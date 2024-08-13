const { REST, Routes } = require("discord.js");
const { clientId, guildId, token } = require("./config");

const commands = [
  {
    name: "ping",
    description: "Replies with pong",
  },
  {
    name: "pong",
    description: "Replies with ping",
  },
  {
    name: "maketeams",
    description: "Create teams with this command",
  },
];

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log("Registering slash commands");
    await rest.put(Routes.applicationGuildCommands(clientId), {
      body: commands,
    });
    console.log("Slash commands were registered");
  } catch (error) {
    console.error("Error registering commands:", error);
  }
})();
