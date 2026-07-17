// src/seedFromEnv.js — one-off: seed the DB row for GUILD_ID from the
// legacy single-server .env values, so the existing server doesn't need
// its real RCON/SFTP credentials re-typed through the /setup modals.
// Run once: `node src/seedFromEnv.js`
import "dotenv/config";
import * as db from "./db.js";

function required(key) {
	const v = process.env[key];
	if (!v) throw new Error(`Missing ${key} in .env — nothing to seed`);
	return v;
}

const cfg = {
	guildId: required("GUILD_ID"),
	modpackName: process.env.MODPACK_NAME || "Catch, Create, Conquer",
	adminRoleId: required("ADMIN_ROLE_ID"),
	statusChannelId: required("STATUS_CHANNEL_ID"),
	chatChannelId: required("CHAT_CHANNEL_ID"),
	restartHours: process.env.RESTART_HOURS || "0,6,12,18",
	rcon: {
		host: required("RCON_HOST"),
		port: Number(process.env.RCON_PORT || 25575),
		password: required("RCON_PASSWORD"),
	},
	sftp: {
		host: required("SFTP_HOST"),
		port: Number(process.env.SFTP_PORT || 22),
		username: required("SFTP_USER"),
		password: required("SFTP_PASSWORD"),
		logPath: process.env.LOG_PATH || "logs/latest.log",
	},
};

const saved = db.upsertServer(cfg);
console.log(`Seeded guild ${saved.guildId} (${saved.modpackName}) from .env`);
