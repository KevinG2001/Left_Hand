import { SlashCommandBuilder } from "discord.js";
import { getServer } from "../../guildServers.js";
import { sanitizePlayerName } from "../../discordUtil.js";

export const data = new SlashCommandBuilder()
	.setName("whitelist")
	.setDescription("Manage the server whitelist")
	.addSubcommand((s) =>
		s
			.setName("add")
			.setDescription("Whitelist a player")
			.addStringOption((o) =>
				o
					.setName("player")
					.setDescription("Minecraft username")
					.setRequired(true),
			),
	)
	.addSubcommand((s) =>
		s
			.setName("remove")
			.setDescription("Remove a player from the whitelist")
			.addStringOption((o) =>
				o
					.setName("player")
					.setDescription("Minecraft username")
					.setRequired(true),
			),
	)
	.addSubcommand((s) => s.setName("list").setDescription("Show the whitelist"));

export async function execute(interaction) {
	const inst = getServer(interaction.guildId);
	if (!inst) {
		return interaction.editReply({
			content: "This server hasn't been set up yet — an admin should run `/setup`.",
		});
	}

	const sub = interaction.options.getSubcommand();

	if (sub === "list") {
		const res = await inst.rcon.send("whitelist list");
		return interaction.editReply({ content: `\`\`\`${res.slice(0, 1900)}\`\`\`` });
	}

	const raw = interaction.options.getString("player");
	if (!raw) {
		return interaction.editReply({
			content: "Give me a player name: `/whitelist add <player>`",
		});
	}
	const player = sanitizePlayerName(raw);
	if (!player) {
		return interaction.editReply({
			content: "That name had no valid characters (A-Z, 0-9, _).",
		});
	}

	const res = await inst.rcon.send(`whitelist ${sub} ${player}`);
	return interaction.editReply({ content: res || "Done." });
}
