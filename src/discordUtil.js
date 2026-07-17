import { PermissionFlagsBits } from "discord.js";

/** Administrator perm OR the configured admin role. */
export function isAdmin(member, adminRoleId) {
	if (!member) return false;
	if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
	return Boolean(adminRoleId) && member.roles.cache.has(adminRoleId);
}

/** Minecraft usernames only — strips anything that could smuggle a console command. */
export function sanitizePlayerName(raw) {
	return (raw ?? "").replace(/[^A-Za-z0-9_]/g, "");
}

/** Neutralize @mentions coming out of Minecraft chat/log lines. */
export function sanitizeForDiscord(text) {
	return (text ?? "").replace(/@/g, "@​").slice(0, 1900);
}

/**
 * Runs a slash command with the ordering the bot relies on everywhere:
 * permission check first (replies directly, no defer, if it fails) ->
 * deferReply() -> handler -> crash-proof editReply on any thrown error.
 * This is what keeps RCON's occasional multi-second latency from ever
 * tripping Discord's 3s ack window (interaction error 10062) or crashing
 * the process.
 */
export async function runCommand(interaction, { checkPermission, handler }) {
	if (checkPermission) {
		const allowed = await checkPermission(interaction);
		if (!allowed) return;
	}

	await interaction.deferReply().catch(() => {});

	try {
		await handler(interaction);
	} catch (err) {
		console.error(`[cmd:${interaction.commandName}]`, err);
		await interaction
			.editReply({ content: `Command failed: ${err.message}` })
			.catch(() => {});
	}
}
