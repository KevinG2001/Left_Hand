const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

// In-memory store for lobby data (for demonstration purposes)
const lobbies = new Map();

module.exports = {
  data: {
    name: "maketeams",
    description: "Create teams with this command",
  },
  async execute(interaction) {
    const userId = interaction.user.id; //ID of the person who made the lobby
    const lobbyId = interaction.channelId; // Unique identifier for the lobby

    // If the lobby exists dont make one
    if (!lobbies.has(lobbyId)) {
      lobbies.set(lobbyId, new Set());
    }

    const lobby = lobbies.get(lobbyId);

    // Making an embedded message
    const embed = new EmbedBuilder()
      .setTitle("Join the Lobby for the Next Game")
      .setDescription(`Lobby:\n${[...lobby].join(", ")}`)
      .setColor("#0099ff"); // Optional: Set the color of the embed

    // Buttons for the embedded message
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
        .setLabel("Duo")
        .setStyle(ButtonStyle.Success)
    );

    // Sends the message
    await interaction.reply({ embeds: [embed], components: [row] });
  },
};
