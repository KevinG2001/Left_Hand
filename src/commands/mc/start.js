import { SlashCommandBuilder } from "discord.js";
import { getServer } from "../../guildServers.js";
import { isAdmin } from "../../discordUtil.js";

export const data = new SlashCommandBuilder()
	.setName("start")
	.setDescription("Start the server (admin)");

export async function checkPermission(interaction) {
	const adminRoleId = getServer(interaction.guildId)?.cfg.adminRoleId;
	if (isAdmin(interaction.member, adminRoleId)) return true;
	await interaction
		.reply({ content: "You need the admin role for that.", flags: 64 })
		.catch(() => {});
	return false;
}

export async function execute(interaction) {
	await interaction.editReply(
		"A stopped server has no console, so I can't start it over RCON. Use the host panel.",
	);
}
