module.exports = {
  data: {
    name: "pong",
    description: "Replies with ping",
  },
  async execute(interaction) {
    await interaction.reply("Ping!");
  },
};
