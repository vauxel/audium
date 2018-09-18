const utils = require("./utils.js");

import PlayerInstance from "./player.js";
import SettingsInstance from "./settings.js";

class InstanceManager {
	constructor() {
		this.instances = {};
	}

	instantiate(guild) {
		this.instances[guild.id] = {
			settings: new SettingsInstance(guild),
			player: new PlayerInstance(guild)
		};

		utils.log("IMANAGER", `Instantiated the guild: '${guild.name}'`);
	}

	uninstantiate(guild) {
		this.instances[guild.id].settings = null;
		this.instances[guild.id].player = null;
		this.instances[guild.id] = null;

		utils.log("IMANAGER", `Un-Instantiated the guild: '${guild.name}'`);
	}

	settings(guild) {
		return this.instances[guild.id].settings;
	}

	player(guild) {
		return this.instances[guild.id].player;
	}
}

export let instances = new InstanceManager();