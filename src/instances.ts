import Discord from "discord.js";
import Utils from "./utils";
import { Persistence, PersistenceInstance } from "./persistence";

export interface Instances {
	commands: CommandsInstance;
	settings: SettingsInstance;
	player: PlayerInstance;
	moderation: ModerationInstance;
	roles: RolesInstance;
	stats: StatsInstance;
}

export class Instance {
	protected guild: Discord.Guild;
	protected db: PersistenceInstance;
	protected instances: Instances;

	constructor(guild: Discord.Guild) {
		this.guild = guild;
		this.db = Persistence.use(guild.id);
	}
}

import CommandsInstance from "./instances/commands";
import SettingsInstance from "./instances/settings";
import PlayerInstance from "./instances/player";
import ModerationInstance from "./instances/moderation";
import RolesInstance from "./instances/roles";
import StatsInstance from "./instances/stats";
//import SpeechInstance from "./instances/speech";

export class InstanceManager {
	instances: object;

	constructor() {
		this.instances = {};
	}

	instantiate(guild: Discord.Guild) {
		Persistence.load(guild.id);
		guild.members.cache.forEach((member, id) => {
			Persistence.use(guild.id).collection("members").add(id);
		});

		this.instances[guild.id] = {
			commands: new CommandsInstance(guild),
			settings: new SettingsInstance(guild),
			player: new PlayerInstance(guild),
			moderation: new ModerationInstance(guild),
			roles: new RolesInstance(guild),
			stats: new StatsInstance(guild)
			//speech: new SpeechInstance(guild)
		};

		for (let key in this.instances[guild.id]) {
			if (this.instances[guild.id].hasOwnProperty(key)) {
				this.instances[guild.id][key].instantiate(this.instances[guild.id]);
			}
		}

		Utils.log("IMANAGER", `Instantiated the guild: '${guild.name}'`);
	}

	uninstantiate(guild: Discord.Guild) {
		delete this.instances[guild.id].commands;
		delete this.instances[guild.id].settings;
		delete this.instances[guild.id].player;
		delete this.instances[guild.id].moderation;
		delete this.instances[guild.id].roles;
		delete this.instances[guild.id].stats;
		//delete this.instances[guild.id].speech;
		delete this.instances[guild.id];

		Utils.log("IMANAGER", `Un-Instantiated the guild: '${guild.name}'`);
	}

	commands(guild: Discord.Guild): CommandsInstance {
		return this.instances[guild.id].commands;
	}

	settings(guild: Discord.Guild): SettingsInstance {
		return this.instances[guild.id].settings;
	}

	player(guild: Discord.Guild): PlayerInstance {
		return this.instances[guild.id].player;
	}

	moderation(guild: Discord.Guild): ModerationInstance {
		return this.instances[guild.id].moderation;
	}

	roles(guild: Discord.Guild): RolesInstance {
		return this.instances[guild.id].roles;
	}

	stats(guild: Discord.Guild): StatsInstance {
		return this.instances[guild.id].stats;
	}

	//speech(guild: Discord.Guild): SpeechInstance {
	//	return this.instances[guild.id].speech;
	//}
}
