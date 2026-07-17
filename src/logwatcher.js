import SftpClient from "ssh2-sftp-client";
import { EventEmitter } from "node:events";

// Matches the server-thread logger tag in any of its observed forms:
//   [net.minecraft.server.MinecraftServer/]:
//   [net.minecraft.server.dedicated.DedicatedServer/]:
//   [minecraft/MinecraftServer]:
//   [minecraft/DedicatedServer]:
const TAG = String.raw`\[(?:[A-Za-z0-9_]+[./])*(?:Dedicated|Minecraft)Server\/?\]:`;

// <Name> message — tolerates an optional "[Not Secure] " prefix (1.19+
// chat signing) and decorative symbols/rank prefixes before the name.
const CHAT_RE = new RegExp(
	`${TAG}\\s+(?:\\[Not Secure\\]\\s+)?<[^A-Za-z0-9_<>]*([A-Za-z0-9_]{1,16})>\\s?(.*)$`,
);
const BODY_RE = new RegExp(`${TAG}\\s+(.*)$`);

/**
 * Tails logs/latest.log over SFTP by polling file size and reading
 * only the new bytes. Handles log rotation (size shrink -> reset).
 *
 * Emits:
 *   "chat"        { player, message }
 *   "join"        { player }
 *   "leave"       { player }
 *   "death"       { line }
 *   "advancement" { player, kind, name }
 */
export class LogWatcher extends EventEmitter {
	constructor({ host, port, username, password, logPath, pollMs = 2500 }) {
		super();
		this.conn = { host, port: Number(port), username, password };
		this.logPath = logPath;
		this.pollMs = pollMs;
		this.offset = null; // null = first run: skip history, start at EOF
		this.sftp = null;
		this.timer = null;
		this.partial = "";
	}

	async start() {
		await this.ensureConnected();
		this.timer = setInterval(
			() => this.poll().catch((e) => this.onError(e)),
			this.pollMs,
		);
		console.log("[logwatcher] tailing", this.logPath);
	}

	async ensureConnected() {
		if (this.sftp) return;
		const c = new SftpClient();
		await c.connect(this.conn);
		c.on("error", () => (this.sftp = null));
		c.on("end", () => (this.sftp = null));
		this.sftp = c;
		console.log("[logwatcher] sftp connected");
	}

	async onError(e) {
		console.error("[logwatcher]", e.message);
		try {
			await this.sftp?.end();
		} catch {
			// already gone
		}
		this.sftp = null;
		// next poll() will reconnect
	}

	async poll() {
		await this.ensureConnected();
		const stat = await this.sftp.stat(this.logPath);

		if (this.offset === null) {
			// first run: don't replay history
			this.offset = stat.size;
			return;
		}
		if (stat.size < this.offset) {
			// log rotated (server restart) - start from the top of the new file
			this.offset = 0;
			this.partial = "";
		}
		if (stat.size === this.offset) return;

		const buf = await this.sftp.get(this.logPath, undefined, {
			readStreamOptions: { start: this.offset, end: stat.size - 1 },
		});
		this.offset = stat.size;

		const text = this.partial + buf.toString("utf8");
		const lines = text.split("\n");
		this.partial = lines.pop() ?? ""; // keep incomplete trailing line

		for (const line of lines) this.parse(line);
	}

	parse(line) {
		const chat = line.match(CHAT_RE);
		if (chat) return this.emit("chat", { player: chat[1], message: chat[2] });

		const body = line.match(BODY_RE);
		if (!body) return;
		const msg = body[1];

		let m;
		if ((m = msg.match(/^([A-Za-z0-9_]{1,16}) joined the game$/)))
			return this.emit("join", { player: m[1] });
		if ((m = msg.match(/^([A-Za-z0-9_]{1,16}) left the game$/)))
			return this.emit("leave", { player: m[1] });
		if (
			(m = msg.match(
				/^([A-Za-z0-9_]{1,16}) has (made the advancement|completed the challenge|reached the goal) \[(.+)\]$/,
			))
		)
			return this.emit("advancement", { player: m[1], kind: m[2], name: m[3] });

		// Death messages: heuristic keyword match on lines starting with a player-like name
		if (
			/^[A-Za-z0-9_]{1,16} (was|died|drowned|blew up|fell|burned|froze|starved|withered|suffocated|tried|walked|hit|went|discovered|experienced|left the confines)/.test(
				msg,
			)
		)
			return this.emit("death", { line: msg });
	}

	async stop() {
		clearInterval(this.timer);
		try {
			await this.sftp?.end();
		} catch {
			// already gone
		}
	}
}
