import { SlashCommandBuilder } from "discord.js";
import { getServer } from "../../guildServers.js";
import { isAdmin } from "../../discordUtil.js";

export const data = new SlashCommandBuilder()
	.setName("restart")
	.setDescription("Restart the server (admin)");

export async function checkPermission(interaction) {
	const adminRoleId = getServer(interaction.guildId)?.cfg.adminRoleId;
	if (isAdmin(interaction.member, adminRoleId)) return true;
	await interaction
		.reply({ content: "You need the admin role for that.", flags: 64 })
		.catch(() => {});
	return false;
}

export async function execute(interaction) {
	const inst = getServer(interaction.guildId);
	if (!inst) {
		return interaction.editReply({
			content: "This server hasn't been set up yet — run `/setup` first.",
		});
	}
	await interaction.editReply(
		"Sending stop — the host should bring it back up automatically…",
	);
	await inst.rcon.send("stop");
}
