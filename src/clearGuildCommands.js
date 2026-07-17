// src/clearGuildCommands.js — one-off cleanup: removes guild-scoped
// command registrations from every guild the bot is in, leaving only
// the global set (if any).
import { Client, GatewayIntentBits, REST, Routes } from "discord.js";
import { discordToken } from "./config.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const rest = new REST().setToken(discordToken);

client.once("clientReady", async () => {
	const guilds = [...client.guilds.cache.values()];
	console.log(`Bot is in ${guilds.length} guild(s)`);

	for (const guild of guilds) {
		try {
			await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), {
				body: [],
			});
			console.log(`Cleared guild commands in: ${guild.name}`);
		} catch (error) {
			console.error(`Failed for ${guild.name}:`, error.message);
		}
	}

	console.log("Done");
	client.destroy();
});

client.login(discordToken);
