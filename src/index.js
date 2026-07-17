import { Client, GatewayIntentBits, REST, Routes } from "discord.js";
import { discordToken } from "./config.js";
import * as guildServers from "./guildServers.js";
import { runCommand } from "./discordUtil.js";

import * as whitelistCmd from "./commands/mc/whitelist.js";
import * as stopCmd from "./commands/mc/stop.js";
import * as restartCmd from "./commands/mc/restart.js";
import * as startCmd from "./commands/mc/start.js";
import * as maketeamsCmd from "./commands/maketeams.js";
import * as setupCmd from "./commands/setup.js";

const commandModules = [whitelistCmd, stopCmd, restartCmd, startCmd, maketeamsCmd, setupCmd];
const commands = new Map(commandModules.map((c) => [c.data.name, c]));

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
	],
});

// ── Discord chat → Minecraft ─────────────────────────────────────────────
client.on("messageCreate", async (msg) => {
	if (msg.author.bot || msg.webhookId) return;
	const inst = guildServers.findByChatChannel(msg.channelId);
	if (!inst) return;

	const content = msg.cleanContent.trim().slice(0, 256);
	if (!content) return;
	try {
		await inst.rcon.sendChat(msg.member?.displayName ?? msg.author.username, content);
	} catch (err) {
		console.error("[bridge] discord->mc failed:", err.message);
		msg.react("⚠️").catch(() => {});
	}
});

// ── Slash commands + setup wizard components/modals ──────────────────────
client.on("interactionCreate", (interaction) => {
	if (interaction.isChatInputCommand()) {
		const command = commands.get(interaction.commandName);
		if (!command) return;

		if (command === setupCmd) {
			return setupCmd.execute(interaction).catch((err) => console.error("[cmd:setup]", err));
		}

		runCommand(interaction, {
			checkPermission: command.checkPermission,
			handler: (i) => command.execute(i),
		}).catch((err) => console.error("[interactionCreate]", err));
		return;
	}

	if (
		(interaction.isButton() || interaction.isModalSubmit()) &&
		interaction.customId?.startsWith("setup:")
	) {
		setupCmd.handleComponent(interaction).catch((err) => console.error("[setup]", err));
	}
});

// ── Startup ──────────────────────────────────────────────────────────────
client.once("clientReady", async () => {
	console.log(`[discord] logged in as ${client.user.tag}`);

	const rest = new REST().setToken(discordToken);
	const body = commandModules.map((c) => c.data.toJSON());
	await rest.put(Routes.applicationCommands(client.user.id), { body });
	console.log("[discord] global slash commands registered");

	await guildServers.startAll(client);
	guildServers.startStatusLoop(client);
});

client.login(discordToken);
