module.exports = {
  data: {
    name: "ping",
    description: "Replies with pong",
  },
  async execute(interaction) {
    await interaction.reply("Pong!");
  },
};
