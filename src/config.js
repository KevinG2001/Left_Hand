import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function env(key, fallback) {
	const raw = process.env[key];
	const value = raw === undefined || raw === "" ? fallback : raw;
	if (value === undefined) {
		throw new Error(`Missing required env var ${key}`);
	}
	return value;
}

// Bot-level settings only. Per-guild Minecraft server config (RCON/SFTP
// creds, channels, admin role, modpack name) lives in the database and
// is set up per guild via /setup — see db.js and commands/setup.js.
export const discordToken = env("DISCORD_TOKEN");
export const encryptionKey = env("ENCRYPTION_KEY");
export const dbPath =
	process.env.DB_PATH || path.join(__dirname, "..", "data", "bot.db");
