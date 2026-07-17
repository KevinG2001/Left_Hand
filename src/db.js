// src/db.js — one row per guild: that guild's Minecraft server connection
// (RCON + SFTP) and Discord wiring (channels, admin role, modpack name).
import Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { encryptionKey, dbPath } from "./config.js";

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);

// One-off migration off the old Pelican-panel schema: that table shape
// (address/pelican_*/name_key) has no RCON/SFTP equivalent, so it can't
// be carried forward — drop it and the now-unused role_groups table.
const existingColumns = db
	.prepare("PRAGMA table_info(servers)")
	.all()
	.map((c) => c.name);
if (existingColumns.length && !existingColumns.includes("rcon_host")) {
	console.warn("[db] migrating off old Pelican-panel schema (old rows are dropped)");
	db.exec("DROP TABLE IF EXISTS servers; DROP TABLE IF EXISTS role_groups;");
}

db.exec(`
  CREATE TABLE IF NOT EXISTS servers (
    guild_id          TEXT PRIMARY KEY,
    modpack_name      TEXT NOT NULL,
    admin_role_id     TEXT NOT NULL,
    status_channel_id TEXT NOT NULL,
    chat_channel_id   TEXT NOT NULL,
    restart_hours     TEXT NOT NULL DEFAULT '0,6,12,18',
    rcon_host         TEXT NOT NULL,
    rcon_port         INTEGER NOT NULL DEFAULT 25575,
    rcon_password_enc TEXT NOT NULL,
    sftp_host         TEXT NOT NULL,
    sftp_port         INTEGER NOT NULL DEFAULT 22,
    sftp_user         TEXT NOT NULL,
    sftp_password_enc TEXT NOT NULL,
    log_path          TEXT NOT NULL DEFAULT 'logs/latest.log',
    status_message_id TEXT
  );
`);

// ---------- encryption for RCON/SFTP passwords at rest ----------
// AES-256-GCM with a key derived from ENCRYPTION_KEY in the env.

function derivedKey() {
	if (!encryptionKey) {
		throw new Error(
			"ENCRYPTION_KEY is not set — required to store server passwords",
		);
	}
	return crypto.createHash("sha256").update(encryptionKey).digest();
}

function encrypt(plain) {
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv("aes-256-gcm", derivedKey(), iv);
	const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
	return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${enc.toString("hex")}`;
}

function decrypt(stored) {
	const [ivHex, tagHex, dataHex] = stored.split(":");
	const decipher = crypto.createDecipheriv(
		"aes-256-gcm",
		derivedKey(),
		Buffer.from(ivHex, "hex"),
	);
	decipher.setAuthTag(Buffer.from(tagHex, "hex"));
	return Buffer.concat([
		decipher.update(Buffer.from(dataHex, "hex")),
		decipher.final(),
	]).toString("utf8");
}

// ---------- row <-> config mapping ----------

function rowToConfig(row) {
	if (!row) return null;
	return {
		guildId: row.guild_id,
		modpackName: row.modpack_name,
		adminRoleId: row.admin_role_id,
		statusChannelId: row.status_channel_id,
		chatChannelId: row.chat_channel_id,
		restartHours: row.restart_hours
			.split(",")
			.map((s) => Number.parseInt(s.trim(), 10))
			.filter((n) => Number.isInteger(n) && n >= 0 && n <= 23),
		rcon: {
			host: row.rcon_host,
			port: row.rcon_port,
			password: decrypt(row.rcon_password_enc),
		},
		sftp: {
			host: row.sftp_host,
			port: row.sftp_port,
			username: row.sftp_user,
			password: decrypt(row.sftp_password_enc),
			logPath: row.log_path,
		},
		statusMessageId: row.status_message_id || null,
	};
}

// ---------- queries ----------

const upsertStmt = db.prepare(`
  INSERT INTO servers (guild_id, modpack_name, admin_role_id, status_channel_id,
    chat_channel_id, restart_hours, rcon_host, rcon_port, rcon_password_enc,
    sftp_host, sftp_port, sftp_user, sftp_password_enc, log_path, status_message_id)
  VALUES (@guild_id, @modpack_name, @admin_role_id, @status_channel_id,
    @chat_channel_id, @restart_hours, @rcon_host, @rcon_port, @rcon_password_enc,
    @sftp_host, @sftp_port, @sftp_user, @sftp_password_enc, @log_path, NULL)
  ON CONFLICT (guild_id) DO UPDATE SET
    modpack_name = excluded.modpack_name,
    admin_role_id = excluded.admin_role_id,
    status_channel_id = excluded.status_channel_id,
    chat_channel_id = excluded.chat_channel_id,
    restart_hours = excluded.restart_hours,
    rcon_host = excluded.rcon_host,
    rcon_port = excluded.rcon_port,
    rcon_password_enc = excluded.rcon_password_enc,
    sftp_host = excluded.sftp_host,
    sftp_port = excluded.sftp_port,
    sftp_user = excluded.sftp_user,
    sftp_password_enc = excluded.sftp_password_enc,
    log_path = excluded.log_path,
    status_message_id = NULL
`);

export function upsertServer(cfg) {
	upsertStmt.run({
		guild_id: cfg.guildId,
		modpack_name: cfg.modpackName,
		admin_role_id: cfg.adminRoleId,
		status_channel_id: cfg.statusChannelId,
		chat_channel_id: cfg.chatChannelId,
		restart_hours: cfg.restartHours,
		rcon_host: cfg.rcon.host,
		rcon_port: cfg.rcon.port,
		rcon_password_enc: encrypt(cfg.rcon.password),
		sftp_host: cfg.sftp.host,
		sftp_port: cfg.sftp.port,
		sftp_user: cfg.sftp.username,
		sftp_password_enc: encrypt(cfg.sftp.password),
		log_path: cfg.sftp.logPath || "logs/latest.log",
	});
	return getServer(cfg.guildId);
}

export function getServer(guildId) {
	const row = db.prepare("SELECT * FROM servers WHERE guild_id = ?").get(guildId);
	return rowToConfig(row);
}

export function allServers() {
	return db.prepare("SELECT * FROM servers").all().map(rowToConfig);
}

export function deleteServer(guildId) {
	return db.prepare("DELETE FROM servers WHERE guild_id = ?").run(guildId).changes > 0;
}

export function saveStatusMessageId(guildId, messageId) {
	db.prepare("UPDATE servers SET status_message_id = ? WHERE guild_id = ?").run(
		messageId || null,
		guildId,
	);
}
