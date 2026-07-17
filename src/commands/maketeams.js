import {
	SlashCommandBuilder,
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
} from "discord.js";

// In-memory store for lobby data (for demonstration purposes)
const lobbies = new Map();

export const data = new SlashCommandBuilder()
	.setName("maketeams")
	.setDescription("Create teams with this command");

export async function execute(interaction) {
	const lobbyId = interaction.channelId; // Unique identifier for the lobby

	// If the lobby exists dont make one
	if (!lobbies.has(lobbyId)) {
		lobbies.set(lobbyId, new Set());
	}

	const lobby = lobbies.get(lobbyId);

	const embed = new EmbedBuilder()
		.setTitle("Join the Lobby for the Next Game")
		.setDescription(`Lobby:\n${[...lobby].join(", ")}`)
		.setColor("#0099ff");

	const row = new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId("join_lobby")
			.setLabel("Join")
			.setStyle(ButtonStyle.Primary),
		new ButtonBuilder()
			.setCustomId("leave_lobby")
			.setLabel("Leave")
			.setStyle(ButtonStyle.Secondary),
		new ButtonBuilder()
			.setCustomId("randomDuos")
			.setLabel("Duos")
			.setStyle(ButtonStyle.Success),
		new ButtonBuilder()
			.setCustomId("randomTrios")
			.setLabel("Trios")
			.setStyle(ButtonStyle.Success),
		new ButtonBuilder()
			.setCustomId("randomSquads")
			.setLabel("Squads")
			.setStyle(ButtonStyle.Success),
	);

	await interaction.editReply({ embeds: [embed], components: [row] });
}
