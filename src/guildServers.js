import { WebhookClient, ActivityType } from "discord.js";
import * as db from "./db.js";
import { RconManager } from "./rcon.js";
import { LogWatcher } from "./logwatcher.js";
import { buildEmbed } from "./statusEmbed.js";
import { sanitizeForDiscord } from "./discordUtil.js";

const STATUS_REFRESH_MS = 60_000;

// guildId -> { cfg, rcon, watcher, webhook, lastCount }
const instances = new Map();

export function getServer(guildId) {
	return instances.get(guildId);
}

export function findByChatChannel(channelId) {
	for (const inst of instances.values()) {
		if (inst.cfg.chatChannelId === channelId) return inst;
	}
	return null;
}

async function getWebhook(client, inst) {
	if (inst.webhook) return inst.webhook;
	const channel = await client.channels.fetch(inst.cfg.chatChannelId);
	const hooks = await channel.fetchWebhooks();
	let hook = hooks.find((h) => h.owner?.id === client.user.id);
	if (!hook) hook = await channel.createWebhook({ name: "Minecraft Bridge" });
	inst.webhook = new WebhookClient({ id: hook.id, token: hook.token });
	return inst.webhook;
}

async function mcToDiscord(client, inst, { username, avatarPlayer, content }) {
	const hook = await getWebhook(client, inst);
	await hook.send({
		username,
		avatarURL: avatarPlayer
			? `https://mc-heads.net/avatar/${avatarPlayer}/64`
			: undefined,
		content: sanitizeForDiscord(content),
		allowedMentions: { parse: [] },
	});
}

function wireWatcher(client, inst) {
	const { watcher } = inst;
	watcher.on("chat", ({ player, message }) =>
		mcToDiscord(client, inst, {
			username: player,
			avatarPlayer: player,
			content: message,
		}).catch(console.error),
	);
	watcher.on("join", ({ player }) =>
		mcToDiscord(client, inst, {
			username: "Server",
			content: `➕ **${player}** joined the game`,
		}).catch(console.error),
	);
	watcher.on("leave", ({ player }) =>
		mcToDiscord(client, inst, {
			username: "Server",
			content: `➖ **${player}** left the game`,
		}).catch(console.error),
	);
	watcher.on("death", ({ line }) =>
		mcToDiscord(client, inst, { username: "Server", content: `💀 ${line}` }).catch(
			console.error,
		),
	);
	watcher.on("advancement", ({ player, name }) =>
		mcToDiscord(client, inst, {
			username: "Server",
			content: `🏆 **${player}** earned **${name}**`,
		}).catch(console.error),
	);
}

/** (Re)start the RCON/SFTP/chat-bridge stack for one guild's config. */
export async function startServer(client, cfg) {
	stopServer(cfg.guildId); // replace any existing instance

	const inst = {
		cfg,
		rcon: new RconManager(cfg.rcon),
		watcher: new LogWatcher(cfg.sftp),
		webhook: null,
		lastCount: null,
	};
	wireWatcher(client, inst);
	instances.set(cfg.guildId, inst);

	await inst.watcher.start();
	return inst;
}

export function stopServer(guildId) {
	const inst = instances.get(guildId);
	if (!inst) return;
	inst.watcher.stop().catch(() => {});
	instances.delete(guildId);
}

export async function startAll(client) {
	for (const cfg of db.allServers()) {
		await startServer(client, cfg).catch((err) =>
			console.error(`[guildServers] failed to start ${cfg.guildId}:`, err.message),
		);
	}
	console.log(`[guildServers] started ${instances.size} server(s)`);
}

async function fetchStatus(rcon) {
	try {
		const raw = await rcon.send("list");
		return { online: true, ...RconManager.parseList(raw) };
	} catch {
		return { online: false, count: null, max: null, names: [] };
	}
}

async function refreshOne(client, inst) {
	const status = await fetchStatus(inst.rcon);
	inst.lastCount = status.count ?? 0;
	const embed = buildEmbed(inst.cfg, status);

	let channel;
	try {
		channel = await client.channels.fetch(inst.cfg.statusChannelId);
	} catch (err) {
		console.error(`[statusEmbed:${inst.cfg.guildId}] channel fetch failed:`, err.message);
		return;
	}

	let messageId = inst.cfg.statusMessageId;
	if (messageId) {
		try {
			const message = await channel.messages.fetch(messageId);
			await message.edit({ embeds: [embed] });
			return;
		} catch {
			messageId = null; // deleted — fall through and post a new one
		}
	}

	const message = await channel.send({ embeds: [embed] });
	inst.cfg.statusMessageId = message.id;
	db.saveStatusMessageId(inst.cfg.guildId, message.id);
}

function updatePresence(client) {
	const total = [...instances.values()].reduce(
		(sum, inst) => sum + (inst.lastCount || 0),
		0,
	);
	client.user.setPresence({
		activities: [{ name: `${total} online`, type: ActivityType.Watching }],
		status: "online",
	});
}

export function startStatusLoop(client) {
	async function tick() {
		for (const inst of instances.values()) {
			await refreshOne(client, inst).catch((err) =>
				console.error(`[statusEmbed:${inst.cfg.guildId}]`, err),
			);
		}
		updatePresence(client);
	}
	tick();
	setInterval(tick, STATUS_REFRESH_MS);
}
