// src/commands/setup.js — per-guild setup wizard.
// Flow: /setup <admin role> <status channel> <chat channel> [modpack] [restart hours]
//       -> button opens modal (RCON host/port/password)
//       -> button opens modal (SFTP host/port/user/password/log path)
//       -> saved to DB (passwords encrypted), server connected and tracked.
import {
	SlashCommandBuilder,
	PermissionFlagsBits,
	ChannelType,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";
import * as db from "../db.js";
import * as guildServers from "../guildServers.js";

// In-flight wizard state per (guild, user). Cleared once the final
// modal is submitted (or left to expire — harmless if abandoned).
const pending = new Map();
const pendingKey = (i) => `${i.guildId}:${i.user.id}`;

export const data = new SlashCommandBuilder()
	.setName("setup")
	.setDescription("Connect this Discord server to a Minecraft server (RCON + SFTP)")
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
	.addRoleOption((o) =>
		o.setName("admin_role").setDescription("Role allowed to stop/restart the server").setRequired(true),
	)
	.addChannelOption((o) =>
		o
			.setName("status_channel")
			.setDescription("Channel for the live status embed")
			.addChannelTypes(ChannelType.GuildText)
			.setRequired(true),
	)
	.addChannelOption((o) =>
		o
			.setName("chat_channel")
			.setDescription("Channel to bridge in-game chat with")
			.addChannelTypes(ChannelType.GuildText)
			.setRequired(true),
	)
	.addStringOption((o) =>
		o.setName("modpack_name").setDescription("Shown as the status embed title").setRequired(false),
	)
	.addStringOption((o) =>
		o
			.setName("restart_hours")
			.setDescription("Comma-separated local hours, 0-23 (default 0,6,12,18)")
			.setRequired(false),
	);

function parseRestartHours(raw) {
	const parts = raw.split(",").map((s) => s.trim());
	if (!parts.every((p) => /^([0-9]|1[0-9]|2[0-3])$/.test(p))) return null;
	return parts.map(Number);
}

// Not routed through discordUtil's runCommand: this command's flow is
// components/modals, not a single reply, so it needs direct replies
// (showModal() must be an immediate response, never a deferred one).
export async function execute(interaction) {
	if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
		return interaction
			.reply({ content: "You need the **Administrator** permission to use this.", flags: 64 })
			.catch(() => {});
	}

	const adminRole = interaction.options.getRole("admin_role");
	const statusChannel = interaction.options.getChannel("status_channel");
	const chatChannel = interaction.options.getChannel("chat_channel");
	if (!adminRole || !statusChannel || !chatChannel) {
		return interaction.reply({
			content: "I need an admin role, a status channel and a chat channel to continue.",
			flags: 64,
		});
	}

	const modpackName = interaction.options.getString("modpack_name")?.trim() || "Minecraft Server";
	const restartHoursRaw = interaction.options.getString("restart_hours")?.trim() || "0,6,12,18";
	const restartHours = parseRestartHours(restartHoursRaw);
	if (!restartHours) {
		return interaction.reply({
			content: "`restart_hours` should be comma-separated hours 0-23, e.g. `0,6,12,18`.",
			flags: 64,
		});
	}

	pending.set(pendingKey(interaction), {
		adminRoleId: adminRole.id,
		statusChannelId: statusChannel.id,
		chatChannelId: chatChannel.id,
		modpackName,
		restartHours: restartHoursRaw,
	});

	const button = new ButtonBuilder()
		.setCustomId("setup:rcon")
		.setLabel("Enter RCON details")
		.setStyle(ButtonStyle.Primary);

	return interaction.reply({
		content:
			`**Setup (1/2)** — admin role ${adminRole}, status in ${statusChannel}, chat in ${chatChannel}.\n` +
			"Next: RCON connection details.",
		components: [new ActionRowBuilder().addComponents(button)],
		flags: 64,
		allowedMentions: { parse: [] },
	});
}

export async function handleComponent(interaction) {
	if (interaction.customId === "setup:rcon") {
		if (!pending.has(pendingKey(interaction))) {
			return interaction.reply({
				content: "This setup session expired — run `/setup` again.",
				flags: 64,
			});
		}
		const modal = new ModalBuilder().setCustomId("setup:modal_rcon").setTitle("RCON connection details");
		modal.addComponents(
			new ActionRowBuilder().addComponents(
				new TextInputBuilder().setCustomId("host").setLabel("RCON host").setStyle(TextInputStyle.Short).setRequired(true),
			),
			new ActionRowBuilder().addComponents(
				new TextInputBuilder().setCustomId("port").setLabel("RCON port").setStyle(TextInputStyle.Short).setValue("25575").setRequired(true),
			),
			new ActionRowBuilder().addComponents(
				new TextInputBuilder().setCustomId("password").setLabel("RCON password").setStyle(TextInputStyle.Short).setRequired(true),
			),
		);
		return interaction.showModal(modal);
	}

	if (interaction.customId === "setup:sftp") {
		if (!pending.has(pendingKey(interaction))) {
			return interaction.reply({
				content: "This setup session expired — run `/setup` again.",
				flags: 64,
			});
		}
		const modal = new ModalBuilder().setCustomId("setup:modal_sftp").setTitle("SFTP connection details");
		modal.addComponents(
			new ActionRowBuilder().addComponents(
				new TextInputBuilder().setCustomId("host").setLabel("SFTP host").setStyle(TextInputStyle.Short).setRequired(true),
			),
			new ActionRowBuilder().addComponents(
				new TextInputBuilder().setCustomId("port").setLabel("SFTP port").setStyle(TextInputStyle.Short).setValue("22").setRequired(true),
			),
			new ActionRowBuilder().addComponents(
				new TextInputBuilder().setCustomId("username").setLabel("SFTP username").setStyle(TextInputStyle.Short).setRequired(true),
			),
			new ActionRowBuilder().addComponents(
				new TextInputBuilder().setCustomId("password").setLabel("SFTP password").setStyle(TextInputStyle.Short).setRequired(true),
			),
			new ActionRowBuilder().addComponents(
				new TextInputBuilder()
					.setCustomId("log_path")
					.setLabel("Log path (default logs/latest.log)")
					.setStyle(TextInputStyle.Short)
					.setRequired(false),
			),
		);
		return interaction.showModal(modal);
	}

	if (interaction.customId === "setup:modal_rcon") {
		const state = pending.get(pendingKey(interaction));
		if (!state) {
			return interaction.reply({
				content: "This setup session expired — run `/setup` again.",
				flags: 64,
			});
		}

		const host = interaction.fields.getTextInputValue("host").trim();
		const port = Number.parseInt(interaction.fields.getTextInputValue("port").trim(), 10);
		const password = interaction.fields.getTextInputValue("password");
		if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !password) {
			return interaction.reply({
				content: "That RCON host/port/password didn't look right — run `/setup` again.",
				flags: 64,
			});
		}
		state.rcon = { host, port, password };

		const button = new ButtonBuilder()
			.setCustomId("setup:sftp")
			.setLabel("Enter SFTP details")
			.setStyle(ButtonStyle.Primary);
		return interaction.reply({
			content: "**Setup (2/2)** — got RCON details. Last step: SFTP (for the in-game chat bridge).",
			components: [new ActionRowBuilder().addComponents(button)],
			flags: 64,
		});
	}

	if (interaction.customId === "setup:modal_sftp") {
		const state = pending.get(pendingKey(interaction));
		if (!state || !state.rcon) {
			return interaction.reply({
				content: "This setup session expired — run `/setup` again.",
				flags: 64,
			});
		}

		const host = interaction.fields.getTextInputValue("host").trim();
		const port = Number.parseInt(interaction.fields.getTextInputValue("port").trim(), 10);
		const username = interaction.fields.getTextInputValue("username").trim();
		const password = interaction.fields.getTextInputValue("password");
		const logPath = interaction.fields.getTextInputValue("log_path")?.trim() || "logs/latest.log";
		if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !username || !password) {
			return interaction.reply({
				content: "That SFTP host/port/username/password didn't look right — run `/setup` again.",
				flags: 64,
			});
		}

		await interaction.deferReply({ flags: 64 });

		const cfg = db.upsertServer({
			guildId: interaction.guildId,
			modpackName: state.modpackName,
			adminRoleId: state.adminRoleId,
			statusChannelId: state.statusChannelId,
			chatChannelId: state.chatChannelId,
			restartHours: state.restartHours,
			rcon: state.rcon,
			sftp: { host, port, username, password, logPath },
		});
		pending.delete(pendingKey(interaction));

		const lines = [`**${cfg.modpackName}** saved for this server.`];
		try {
			const inst = await guildServers.startServer(interaction.client, cfg);
			lines.push("✅ Log watcher (SFTP) connected — chat bridge is live.");
			try {
				await inst.rcon.send("list");
				lines.push("✅ RCON connected — whitelist/stop/restart/status are ready.");
			} catch (err) {
				lines.push(`⚠️ RCON didn't respond yet: ${err.message}. Whitelist/stop/restart will retry automatically.`);
			}
		} catch (err) {
			lines.push(`⚠️ Couldn't connect over SFTP: ${err.message}. Fix the credentials and run \`/setup\` again.`);
		}
		lines.push("Status embed will appear within 60s.");

		return interaction.editReply({ content: lines.join("\n") });
	}
}
