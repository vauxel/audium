const fs = require('fs');
const utils = require("./utils.js");

export default class SettingsInstance {
	constructor(guild) {
		this.guild = guild;

		var saved = this.loadSettings();

		if(saved == null) {
			this.default_text = this._pickDefaultText();
			this.default_voice = this._pickDefaultVoice();
		} else {
			this.default_text = saved.default_text;
			this.default_voice = saved.default_voice;
		}
	}

	get settingsPath() {
		return "./res/settings_" + this.guild.id + ".json";
	}

	settingsFileExists() {
		return fs.existsSync(this.settingsPath);
	}

	loadSettings() {
		if(!this.settingsFileExists()) {
			return null;
		}

		var raw = fs.readFileSync(this.settingsPath);
		return JSON.parse(raw);
	}

	saveSettings() {
		var data = JSON.stringify({
			default_text: this.default_text,
			default_voice: this.default_voice
		});

		fs.writeFile(this.settingsPath, data, (err) => {
			if(err) {
				throw err;
			}

			utils.log("SETTINGS", "Successfully saved settings data");
		});
	}

	_pickDefaultText() {
		return this.guild.channels.find("type", "text").id;
	}

	_pickDefaultVoice() {
		return this.guild.channels.find("type", "voice").id;
	}

	get defText() {
		return this.guild.channels.get(this.default_text);
	}

	set defText(newID) {
		if(typeof newID == "object") {
			newID = newID.id;
		}

		this.default_text = newID;
	}

	get defVoice() {
		return this.guild.channels.get(this.default_voice);
	}

	set defVoice(newID) {
		if(typeof newID == "object") {
			newID = newID.id;
		}

		this.default_voice = newID;
	}

	editSetting(name, value) {
		switch(name) {
			case "text":
				value = parseInt(value);

				if(typeof value != "number") {
					utils.sendMessage(this.defText, `**:small_blue_diamond: The text channel id \`${value}\` is not an integer**`);
					break;
				}

				var channel = this.guild.channels.find((channel) => {
					return channel.id == value && channel.type == "text";
				});

				if(!channel) {
					utils.sendMessage(this.defText, `**:small_blue_diamond: The text channel with the id \`${value}\` does not exist**`);
					break;
				}

				this.defText = channel;
				utils.sendMessage(this.defText, `**:small_blue_diamond: The default text channel is now \`${channel.name}\` - \`${channel.id}\`**`);
				break;
			case "voice":
				value = parseInt(value);

				if(typeof value != "number") {
					utils.sendMessage(this.defText, `**:small_blue_diamond: The voice channel id \`${value}\` is not an integer**`);
					break;
				}

				var channel = this.guild.channels.find((channel) => {
					return channel.id == value && channel.type == "voice";
				});

				if(!channel) {
					utils.sendMessage(this.defText, `**:small_blue_diamond: The voice channel with the id \`${value}\` does not exist**`);
					break;
				}

				this.defText = channel;
				utils.sendMessage(this.defText, `**:small_blue_diamond: The default voice channel is now \`${channel.name}\` - \`${channel.id}\`**`);
				break;
			default:
				utils.sendMessage(this.defText, `**:small_blue_diamond: The setting named \`${name}\` does not exist**`);
		}

		this.saveSettings();
	}

	getSettingsEmbed() {
		return {
			"title": "Settings",
			"description": `Format: \`settings {name} {value}\``,
			"color": 4886754,
			"fields": [
				{
					"name": "Default Text Channel",
					"value": `**text** - ${this.defText.name} - \`${this.defText.id}\``
				},
				{
					"name": "Default Voice Channel",
					"value": `**voice** - ${this.defVoice.name} - \`${this.defVoice.id}\``
				}
			]
		};
	}
}