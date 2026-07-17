import { EmbedBuilder } from "discord.js";

/** Next restart as a Date, from a list of local hours (0-23). */
export function nextRestart(hours, now = new Date()) {
	if (!hours.length) return null;
	const candidates = hours.map((h) => {
		const d = new Date(now);
		d.setHours(h, 0, 0, 0);
		if (d <= now) d.setDate(d.getDate() + 1);
		return d;
	});
	return candidates.sort((a, b) => a - b)[0];
}

/** status: { online, count, max, names } — see RconManager.parseList. */
export function buildEmbed(cfg, status) {
	const embed = new EmbedBuilder()
		.setTitle(cfg.modpackName)
		.setColor(status.online ? "#57F287" : "#ED4245")
		.addFields({
			name: "Status",
			value: status.online ? "🟢 Online" : "🔴 Offline",
			inline: true,
		})
		.setTimestamp();

	if (status.online) {
		const playerCount =
			status.count === null ? "?" : `${status.count}/${status.max}`;
		embed.addFields({ name: "Players", value: playerCount, inline: true });
		if (status.names.length) {
			embed.addFields({ name: "Online now", value: status.names.join(", ") });
		}
	}

	const restart = nextRestart(cfg.restartHours);
	if (restart) {
		embed.addFields({
			name: "Next restart",
			value: `<t:${Math.floor(restart.getTime() / 1000)}:R>`,
			inline: true,
		});
	}

	return embed;
}
