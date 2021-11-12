import Discord, { Guild, TextChannel } from "discord.js";
import Utils from "../utils";
import { Persistence, PersistenceInstance } from "../persistence";
import { Instance, Instances } from "../instances";
import config from "../../config.json";

export default class SettingsInstance extends Instance {
	private settings = {
		"text": {
			name: "Default Text Channel",
			id: "default_text_channel",
			default: this.pickDefaultText,
			resolver: this.resolveValidDefaultText
		},
		"voice": {
			name: "Default Voice Channel",
			id: "default_voice_channel",
			default: this.pickDefaultVoice,
			resolver: this.resolveValidDefaultVoice
		},
		"admin": {
			name: "Admin Role",
			id: "admin_role",
			default: this.pickDefaultAdminRole,
			resolver: this.resolveValidAdminRole
		}
	};

	constructor(guild: Discord.Guild) {
		super(guild);

		for (let key in this.settings) {
			let setting = this.settings[key];
			if (this.db.global(setting.id) === undefined) {
				this.db.global(setting.id, setting.default());
			}
		}
	}

	instantiate(instances: Instances) {
		this.instances = instances;
		this.instances.commands.register(["settings", "setting"], "Settings", "Gets or sets server settings", this.settingsHandler.bind(this), true);
		this.instances.commands.register(["bind"], "Bind", "Sets the bot's default text channel", this.bindHandler.bind(this), true);
	}

	settingsHandler(args: string[], callmsg: Discord.Message): void {
		if(args.length < 1) {
			Utils.sendMessage(callmsg.channel, "", { embed: this.getSettingsEmbed() });
		} else if(args.length == 1) {
			this.displaySetting(args[0], callmsg.channel);
		} else {
			this.editSetting(args[0], args.splice(1).join(" "), callmsg.channel);
		}
	}

	bindHandler(args: string[], callmsg: Discord.Message): void {
		this.editSetting("text", (<TextChannel>callmsg.channel).name, callmsg.channel);
	}

	pickDefaultText(): string {
		return this.guild.channels.cache.find(channel => channel.type == "text").id;
	}

	pickDefaultVoice(): string {
		return this.guild.channels.cache.find(channel => channel.type == "voice").id;
	}

	pickDefaultAdminRole(): string {
		return this.guild.roles.everyone.id;
	}

	get defText(): Discord.TextChannel {
		return <Discord.TextChannel>this.guild.channels.cache.get(this.db.global("default_text_channel"));
	}

	/*set defText(newID: string | Discord.TextChannel) {
		if (typeof newID == "object") {
			newID = newID.id;
		}

		this.db.global("default_text_channel", newID);
	}*/

	get defVoice(): Discord.VoiceChannel {
		return <Discord.VoiceChannel>this.guild.channels.cache.get(this.db.global("default_voice_channel"));
	}

	/*set defVoice(newID: string | Discord.VoiceChannel) {
		if (typeof newID == "object") {
			newID = newID.id;
		}

		this.db.global("default_voice_channel", newID);
	}*/

	get adminRole(): Discord.Role {
		return this.guild.roles.cache.get(this.db.global("admin_role"));
	}

	/*set adminRole(newID: string | Discord.GuildChannel) {
		if (typeof newID == "object") {
			newID = newID.id;
		}

		this.db.global("admin_role", newID);
	}*/

	resolveValidDefaultText(value: any, unresolve: boolean): string | null {
		let channel: Discord.GuildChannel | null;

		if (unresolve) {
			channel = this.guild.channels.cache.find((channel) => {
				return channel.id == value && channel.type == "text";
			});

			if (channel) {
				return channel.name;
			} else {
				return null;
			}
		} else {
			channel = this.guild.channels.cache.find((channel) => {
				return channel.name == value && channel.type == "text";
			});

			if (channel) {
				return channel.id;
			} else {
				return null;
			}
		}
	}

	resolveValidDefaultVoice(value: any, unresolve: boolean): string | null {
		let channel: Discord.GuildChannel | null;

		if (unresolve) {
			channel = this.guild.channels.cache.find((channel) => {
				return channel.id == value && channel.type == "voice";
			});

			if (channel) {
				return channel.name;
			} else {
				return null;
			}
		} else {
			channel = this.guild.channels.cache.find((channel) => {
				return channel.name == value && channel.type == "voice";
			});

			if (channel) {
				return channel.id;
			} else {
				return null;
			}
		}
	}

	resolveValidAdminRole(value: any, unresolve: boolean): string | null {
		let role: Discord.Role | null;

		if (unresolve) {
			role = this.guild.roles.cache.find((role) => {
				return role.id == value;
			});

			if (role) {
				return role.name;
			} else {
				return null;
			}
		} else {
			role = this.guild.roles.cache.find((role) => {
				return role.name == value;
			});

			if (role) {
				return role.id;
			} else {
				return null;
			}
		}
	}

	displaySetting(name: any, channel: Discord.TextChannel | Discord.DMChannel | Discord.NewsChannel): void {
		if (this.settings[name] === undefined) {
			Utils.sendMessage(channel, `**:small_blue_diamond: The setting named \`${name}\` does not exist**`);
			return;
		}

		let setting = this.settings[name];
		let id = this.db.global(setting.id);
		let resolved = setting.resolver.call(this, id, true);

		Utils.sendMessage(channel, "", { embed: {
			"title": "Settings Manager",
			"description": `Displaying \`${name}\` setting`,
			"color": 4886754,
			"fields": [
				{
					"name": `${setting.name} ["${name}"]`,
					"value": `***${resolved}*** | \`${id}\``
				}
			]
		}});
	}

	editSetting(name: any, value: any, channel: Discord.TextChannel | Discord.DMChannel | Discord.NewsChannel): void {
		if (this.settings[name] === undefined) {
			Utils.sendMessage(channel, `**:small_blue_diamond: The setting named \`${name}\` does not exist**`);
			return;
		}

		let setting = this.settings[name];
		let resolvedValue = setting.resolver.call(this, value);

		if (!resolvedValue) {
			Utils.sendMessage(channel, `**:small_blue_diamond: The input given is not valid**`);
			return;
		}

		this.db.global(setting.id, resolvedValue);
		Utils.sendMessage(channel, `**:small_blue_diamond: The ${setting.name} is now \`${value}\` | \`${resolvedValue}\`**`);
	}

	getSettingsEmbed(): Discord.MessageEmbedOptions {
		let fields = [];

		for (const key in this.settings) {
			if (this.settings.hasOwnProperty(key)) {
				let setting = this.settings[key];
				let id = this.db.global(setting.id);
				let resolved = setting.resolver.call(this, id, true);
				fields.push({
					"name": `${setting.name} ["${key}"]`,
					"value": `***${resolved}*** | \`${id}\``
				});
			}
		}

		return {
			"title": "Settings Manager",
			"description": `Format: \`settings {name} {value}\``,
			"color": 4886754,
			"fields": fields
		};
	}
}
