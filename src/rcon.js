import { Rcon } from "rcon-client";

/**
 * Thin wrapper around rcon-client with lazy connect + auto-reconnect.
 * Every send() reconnects if the socket dropped, and retries once more
 * on failure before giving up.
 */
export class RconManager {
	constructor({ host, port, password }) {
		this.opts = { host, port: Number(port), password };
		this.client = null;
		this.connecting = null;
	}

	async connect() {
		if (this.client) return this.client;
		if (this.connecting) return this.connecting;

		this.connecting = Rcon.connect(this.opts)
			.then((c) => {
				this.client = c;
				this.connecting = null;
				c.on("end", () => (this.client = null));
				c.on("error", () => (this.client = null));
				console.log("[rcon] connected");
				return c;
			})
			.catch((err) => {
				this.connecting = null;
				throw err;
			});

		return this.connecting;
	}

	/** Send a command, reconnecting once if needed. Returns server response text. */
	async send(command) {
		try {
			const c = await this.connect();
			return await c.send(command);
		} catch {
			// one retry with a fresh connection
			this.client = null;
			const c = await this.connect();
			return await c.send(command);
		}
	}

	/** Send Discord chat into the game as a tellraw. JSON.stringify handles escaping. */
	async sendChat(author, content) {
		const payload = [
			{ text: "[Discord] ", color: "blue" },
			{ text: `<${author}> `, color: "aqua" },
			{ text: content, color: "white" },
		];
		return this.send(`tellraw @a ${JSON.stringify(payload)}`);
	}

	/** Parse the vanilla `list` response into a structured online/name summary. */
	static parseList(raw) {
		const m = raw?.match(
			/There are (\d+) of a max(?: of)? (\d+) players online:?\s*(.*)$/i,
		);
		if (!m) return { count: null, max: null, names: [] };
		const names = m[3]
			? m[3]
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean)
			: [];
		return { count: Number(m[1]), max: Number(m[2]), names };
	}
}
