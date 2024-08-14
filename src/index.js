const { Client, Collection, IntentsBitField } = require("discord.js");
const keep_alive = require("../keep_alive");
require("dotenv").config();
const path = require("path");
const fs = require("fs");
const { token } = require("./config");

// Initialize the client
const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
  ],
});

// Create a collection for commands
client.commands = new Collection();

// Load commands from the 'commands' directory
const commandFiles = fs
  .readdirSync(path.join(__dirname, "commands"))
  .filter((file) => file.endsWith(".js"));
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  if (command.data && command.data.name) {
    client.commands.set(command.data.name, command);
  } else {
    console.warn(`Command file ${file} does not have a valid data export.`);
  }
}

// Load events from the 'events' directory
const eventFiles = fs
  .readdirSync(path.join(__dirname, "events"))
  .filter((file) => file.endsWith(".js"));
for (const file of eventFiles) {
  const event = require(`./events/${file}`);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

// Log in to Discord
client.login(token);
