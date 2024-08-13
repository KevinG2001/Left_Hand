const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

// In-memory store for lobby data
const lobbies = new Map();

function getRandomPairs(array) {
  // Shuffle the array
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }

  // Create pairs
  const pairs = [];
  for (let i = 0; i < array.length; i += 2) {
    pairs.push(array.slice(i, i + 2));
  }

  return pairs;
}

module.exports = {
  name: "interactionCreate",
  async execute(interaction) {
    if (interaction.isCommand()) {
      // Handle command execution
      const command = interaction.client.commands.get(interaction.commandName);
      if (command) {
        try {
          await command.execute(interaction);
        } catch (error) {
          console.error("Error executing command:", error);
          await interaction.reply({
            content: "There was an error while executing this command!",
            ephemeral: true,
          });
        }
      }
    } else if (interaction.isButton()) {
      const userId = interaction.user.id;
      const lobbyId = interaction.channelId; // Unique identifier for the lobby

      // Ensure lobby exists
      if (!lobbies.has(lobbyId)) {
        lobbies.set(lobbyId, new Set());
      }

      const lobby = lobbies.get(lobbyId);

      if (interaction.customId === "join_lobby") {
        // Add user to the lobby
        lobby.add(interaction.user.username);

        // Create updated embed message
        const embed = new EmbedBuilder()
          .setTitle("Join the Lobby for the Next Game")
          .setDescription(`Lobby:\n${[...lobby].join(", ")}`)
          .setColor("#0099ff");

        // Update the message
        await interaction.update({
          embeds: [embed],
          components: [interaction.message.components[0]],
        });
      } else if (interaction.customId === "leave_lobby") {
        // Remove user from the lobby
        lobby.delete(interaction.user.username);

        // Create updated embed message
        const embed = new EmbedBuilder()
          .setTitle("Join the Lobby for the Next Game")
          .setDescription(`Lobby:\n${[...lobby].join(", ")}`)
          .setColor("#0099ff");

        // Update the message
        await interaction.update({
          embeds: [embed],
          components: [interaction.message.components[0]],
        });
      } else if (interaction.customId === "randomDuos") {
        // Ensure the user is the one who ran the command initially
        if (interaction.user.id !== interaction.message.interaction.user.id) {
          return await interaction.reply({
            content: "You are not authorized to perform this action.",
            ephemeral: true,
          });
        }

        // Get the list of usernames from the lobby
        const usernames = [...lobby];
        if (usernames.length < 2) {
          return await interaction.reply({
            content: "Not enough users to form teams.",
            ephemeral: true,
          });
        }

        // Generate random pairs
        const pairs = getRandomPairs(usernames);

        // Create the embed message for the random duos
        const pairDescriptions = pairs
          .map((pair, index) => `Pair ${index + 1}: ${pair.join(" & ")}`)
          .join("\n");
        const embed = new EmbedBuilder()
          .setTitle("Random Duos")
          .setDescription(pairDescriptions)
          .setColor("#ff0000");

        // Update the message with the random duos
        await interaction.update({ embeds: [embed], components: [] });
      }
    }
  },
};
