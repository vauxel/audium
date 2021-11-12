import Discord from "discord.js";
import Utils from "../utils";
import { Persistence, PersistenceInstance } from "../persistence";
import { Instance, Instances } from "../instances";
import config from "../../config.json";

export default class RolesInstance extends Instance {
	constructor(guild: Discord.Guild) {
		super(guild);

		this.db.collection("ranks");

		this.guild.client.on("roleDelete", role => {
			if(role.guild.id != this.guild.id) {
				return;
			}

			if(this.db.collection("ranks").has(role.id)) {
				this.db.collection("ranks").remove(role.id);
			}
		});

		this.guild.client.on("roleUpdate", (oldRole, newRole) => {
			if(oldRole.guild.id != this.guild.id) {
				return;
			}

			if((oldRole.name != newRole.name) && this.db.collection("ranks").has(oldRole.id)) {
				this.db.collection("ranks").get(oldRole.id).name = newRole.name;
			}
		});
	}

	instantiate(instances: Instances) {
		this.instances = instances;

		this.instances.commands.register(["rankadd"], "Rank Add", "Adds a rank role", this.addRankHandler.bind(this), true);

		this.instances.commands.register(["rankdel", "rankdelete"], "Rank Delete", "Deletes a rank role", this.deleteRankHandler.bind(this), true);

		this.instances.commands.register(["ranklist", "ranks"], "Rank List", "Lists all of the rank roles", this.rankListHandler.bind(this), false);

		this.instances.commands.register(["rank"], "Rank Assign", "Assigns a user to a rank", this.rankAssignHandler.bind(this), true);
	}

	addRankHandler(args: string[], callmsg: Discord.Message) {
		if(args.length < 1) {
			Utils.sendMessage(callmsg.channel, "**:small_blue_diamond: You must supply a rank name**");
			return;
		}

		if(this.db.collection("ranks").find("name", args[0]) != null) {
			Utils.sendMessage(callmsg.channel, "**:small_blue_diamond: A rank by that name already exists**");
			return;
		}

		if(this.db.collection("ranks").size >= config.roles.maxlimit) {
			Utils.sendMessage(callmsg.channel, "**:small_blue_diamond: The maximum number of ranks has been reached (" + config.roles.maxlimit + ")**");
			return;
		}

		let color: string | number[] = "RANDOM";

		let valid_colors = ['DEFAULT', 'AQUA', 'GREEN', 'BLUE', 'PURPLE', 'LUMINOUS_VIVID_PINK', 'GOLD', 'ORANGE', 'RED', 'GREY', 'DARKER_GREY', 'NAVY', 'DARK_AQUA', 'DARK_GREEN', 'DARK_BLUE', 'DARK_PURPLE', 'DARK_VIVID_PINK', 'DARK_GOLD', 'DARK_ORANGE', 'DARK_RED', 'DARK_GREY', 'LIGHT_GREY', 'DARK_NAVY', 'RANDOM'];

		if (args[1] !== undefined) {
			if (valid_colors.indexOf(args[1].toUpperCase()) != -1) {
				color = args[1].toUpperCase();
			} else if (color.length == 6 || color.length == 7) {
				if (color.length == 7) {
					color = color.substring(1);
				}
	
				color = [
					parseInt(args[1].substring(0, 2), 16),
					parseInt(args[1].substring(2, 4), 16),
					parseInt(args[1].substring(4, 6), 16)
				];

				for (let i = 0; i < color.length; i++) {
					if (isNaN(color[i]) || color[i] < 0 || color[i] > 255) {
						Utils.sendMessage(callmsg.channel, "**:small_blue_diamond: Invalid color hex given**");
						return;
					}
				}
			} else {
				Utils.sendMessage(callmsg.channel, "**:small_blue_diamond: Invalid color given**");
				return;
			}
		}

		this.addRank(args[0], color).then(role => {
			Utils.sendMessage(callmsg.channel, "", { embed: {
				"title": "Rank Roles Add",
				"description": `Added the \`${role.name}\` rank with the color \`${role.hexColor}\``,
				"color": role.color
			}});
		}).catch(console.error);
	}

	deleteRankHandler(args: string[], callmsg: Discord.Message) {
		if (args.length < 1) {
			Utils.sendMessage(callmsg.channel, "**:small_blue_diamond: You must supply a rank name**");
			return;
		}

		if (this.db.collection("ranks").find("name", args[0]) == null) {
			Utils.sendMessage(callmsg.channel, "**:small_blue_diamond: A rank by that name doesnt exist**");
			return;
		}

		this.deleteRank(args[0]).then(role => {
			Utils.sendMessage(callmsg.channel, "", { embed: {
				"title": "Rank Roles Delete",
				"description": `Deleted the \`${role.name}\` rank`,
				"color": 4886754
			}});
		}).catch(console.error);
	}

	rankListHandler(args: string[], callmsg: Discord.Message) {
		Utils.sendMessage(callmsg.channel, "", { embed: this.getRankListEmbed() });
	}

	rankAssignHandler(args: string[], callmsg: Discord.Message) {
		if (args.length < 1) {
			Utils.sendMessage(callmsg.channel, "**:small_blue_diamond: You must supply a rank name**");
			return;
		}

		let mentionRegex = /<@[0-9]+>/;
		let rankName = args.filter(value => !mentionRegex.test(value)).join(" ");
		let rank = this.db.collection("ranks").find("name", rankName);

		if (!rank) {
			Utils.sendMessage(callmsg.channel, "**:small_blue_diamond: A rank by that name doesn't exist**");
			return;
		}

		let members;

		if (callmsg.mentions.members.size < 1) {
			members = new Map([[callmsg.member.id, callmsg.member]]);
		} else {
			members = callmsg.mentions.members;
		}

		members.forEach((member, id) => {
			this.assignRank(rank.id, member).then((assigned) => {
				let description;
				if (assigned) {
					description = `Assigned the \`${rank.value.name}\` rank to \`${member.displayName}\``
				} else {
					description = `Unassigned the \`${rank.value.name}\` rank from \`${member.displayName}\``
				}

				Utils.sendMessage(callmsg.channel, "", { embed: {
					"author": {
						"name": "Rank Role Assign",
						"icon_url": member.user.avatarURL()
					},
					"description": description,
					"color": rank.value.color
				}});
			});
		});
	}

	addRank(name, color) {
		return this.guild.roles.create({
			data: {
				name: name.replace("_", " "),
				color,
				mentionable: true
			}
		}).then(role => {
			this.db.collection("ranks").add(role.id, {
				name: name.replace("_", " "),
				color: role.color
			});
			return role;
		});
	}

	deleteRank(name): Promise<Discord.Role> {
		let rankRole = this.guild.roles.cache.find(role => role.name == name.replace("_", " "));

		if (!rankRole) {
			return;
		}

		this.db.collection("ranks").remove(rankRole.id);
		return rankRole.delete("Deleted by rank command");
	}

	assignRank(rankId, user) {
		if (user.roles.has(rankId)) {
			return user.removeRole(rankId).then(() => { return false; });
		} else {
			return user.addRole(rankId);
		}
	}

	getRankListEmbed() {
		let ranksList = `Number of Ranks: \`${this.db.collection("ranks").size}\`\n\n`;

		this.db.collection("ranks").forEach((rank, id) => {
			ranksList += `__**${rank.name}**__`;
			ranksList += "\n";
		});

		return {
			"title": `Rank List`,
			"description": ranksList,
			"color": 4886754
		};
	}
}
