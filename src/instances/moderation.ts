import Discord from "discord.js";
import Utils from "../utils";
import { Persistence, PersistenceInstance } from "../persistence";
import { Instance, Instances } from "../instances";
import config from "../../config.json";

export default class ModerationInstance extends Instance {
	constructor(guild: Discord.Guild) {
		super(guild);

		if (this.db.global("phrase_blacklist") === undefined) {
			this.db.global("phrase_blacklist", []);
		}

		this.guild.client.on("message", message => {
			if (message.guild.id != this.guild.id) {
				return;
			}
			
			if (message.author.bot) {
				return;
			}

			let blacklist = this.db.global("phrase_blacklist");

			for (let i = 0; i < blacklist.length; i++) {
				if (message.content.includes(blacklist[i])) {
					message.delete().then(msg => {
						Utils.sendMessage(message.channel, `you can't say that, <@${message.author.id}>`, 3000);
					});
					break;
				}
			}
		});
	}

	instantiate(instances: Instances) {
		this.instances = instances;

		this.instances.commands.register(
			["blacklist"],
			"Blacklist",
			"Views, adds to, or removes from the blacklist of phrases",
			this.blacklistHandler.bind(this),
			true
		);
	}

	blacklistHandler(args: string[], callmsg: Discord.Message) {
		if (args.length < 1) {
			Utils.sendMessage(callmsg.channel, "", { embed: this.getRankListEmbed() });
		} else {
			let blacklist = this.db.global("phrase_blacklist");
			let phrase = args.join(" ");

			if (blacklist.includes(phrase)) {
				blacklist = blacklist.filter(item => item !== phrase);
				Utils.sendMessage(callmsg.channel, `Removed \`${phrase}\` from the phrase blacklist`);
			} else {
				blacklist.push(phrase);
				Utils.sendMessage(callmsg.channel, `Added \`${phrase}\` to the phrase blacklist`);
			}

			this.db.global("phrase_blacklist", blacklist);
		}
	}

	getRankListEmbed() {
		let blacklist = this.db.global("phrase_blacklist");
		let ranksList = `Number of Blacklisted Phrases: \`${blacklist.length}\`\n\n`;

		for (let i = 0; i < blacklist.length; i++) {
			ranksList += `***${blacklist[i]}***`;
			ranksList += "\n";
		}

		return {
			"title": `Blacklist`,
			"description": ranksList,
			"color": 4886754
		};
	}
}
