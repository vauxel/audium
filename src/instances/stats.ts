import Discord from "discord.js";
import Utils from "../utils";
import { Instance, Instances } from "../instances";
import { Persistence, PersistenceInstance } from "../persistence";

export default class StatsInstance extends Instance {
	constructor(guild: Discord.Guild) {
		super(guild);

		if (this.db.global("total_uptime") === undefined) {
			this.db.global("total_uptime", 0);
		}

		setInterval(() => this.updateStatsLoop(), 60000);
	}

	instantiate(instances: Instances) {
		this.instances = instances;
		this.instances.commands.register(["stats"], "Statistics", "Lists letious stats about the server", this.statsHandler.bind(this));
	}

	statsHandler(args: string[], callmsg: Discord.Message) {
		Utils.sendMessage(callmsg.channel, "", { embed: this.getStatsEmbed(args[0], args[1]) });
	}

	private updateStatsLoop(): void {
		//this.updateUptime();
		//this.updateUserTimes();
	}

	prettifyMinutes(minutes: number): string {
		let days = Math.floor(minutes / 1440);
		minutes %= 1440;
		let hours = Math.floor(minutes / 60);
		minutes %= 60;

		return `${days} days : ${hours} hours : ${minutes} minutes`;
	}

	updateUptime(): void {
		this.db.global("total_uptime", this.db.global("total_uptime") + 1);
	}

	updateUserTimes(): void {
		let members = this.db.collection("members");

		members.forEach((member: object, id: string) => {
			if (this.guild.members.cache.has(id)) {
				if (this.guild.members.cache.get(id).presence.status == "online") {
					if (!member["time_online"]) {
						member["time_online"] = 1;
					} else {
						member["time_online"]++;
					}
				}

				if (this.guild.members.cache.get(id).voice.channel != null) {
					if (!member["time_connected"]) {
						member["time_connected"] = 1;
					} else {
						member["time_connected"]++;
					}
				}
			}
		});
	}

	getStatsEmbed(statType: string, page: string | number = 1): object {
		let uptime = this.db.global("total_uptime");
		let timeType = "";
		let description = "";

		switch (statType) {
			case "online":
				timeType = "time_online";
				description = "Total Time Spent Online Leaderboard";
				break;
			case "connected":
				timeType = "time_connected";
				description = "Total Time Spent Connected Leaderboard";
				break;
			default:
				return {
					"title": `Statistics [${this.prettifyMinutes(uptime)}]`,
					"description": "Invalid statistics type specified\n\nStatistics: \`online, connected\`",
					"color": 4886754
				};
		}

		if (page !== 1) {
			if (typeof page === "string") {
				page = parseInt(page);
			}

			if (isNaN(page) || page < 1) {
				return {
					"title": `Statistics [${this.prettifyMinutes(uptime)}]`,
					"description": "Invalid statistics page number given",
					"color": 4886754
				};
			}
		}

		let leaderboard = [];

		this.db.collection("members").forEach((member: object, id: string) => {
			if (!member[timeType]) {
				return;
			}

			for (let i = 0; i < leaderboard.length; i++) {
				if (member[timeType] >= leaderboard[i].time) {
					leaderboard.splice(i, 0, {
						username: this.guild.members.cache.get(id).displayName,
						time: member[timeType]
					});
					return;
				}
			}

			leaderboard.push({
				username: this.guild.members.cache.get(id).displayName,
				time: member[timeType]
			});
		});

		page = Math.min(page, Math.ceil(leaderboard.length / 10));
		let fields = [];
		let start = (page - 1) * 10;

		for (let i = start; i < Math.min(leaderboard.length, start + 10); i++) {
			fields.push({
				"name": `${i + 1}) ${leaderboard[i].username}`,
				"value": `**${this.prettifyMinutes(leaderboard[i].time)}**`
			});
		}

		if (leaderboard.length > (start + 10)) {
			fields.push({
				"name": `*+${leaderboard.length - (start + 10)} more members*`,
				"value": "*supply a page number to view them*"
			});
		}

		return {
			"title": `Statistics [${this.prettifyMinutes(uptime)}]`,
			"description": description,
			"color": 4886754,
			"fields": fields
		};
	}
}
