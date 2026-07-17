import { SlashCommandBuilder } from "discord.js";
import { getServer } from "../../guildServers.js";
import { isAdmin } from "../../discordUtil.js";

export const data = new SlashCommandBuilder()
	.setName("stop")
	.setDescription("Stop the server (admin)");

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
	await interaction.editReply("Stopping the server…");
	await inst.rcon.send("stop");
}
