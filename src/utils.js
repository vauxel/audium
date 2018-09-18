const config = require("../config.json");

module.exports = {
	log: function(caller, message) {
		console.log(`[${new Date().toLocaleString()}] (${caller}) ${message}`);
	},
	sendMessage: async function(channel, message, options, destruct) {
		if(typeof options == 'number') {
			destruct = options;
			options = {};
		}

		var message = await channel.send(message, options);
		this.log("MSG SEND", `"${message.content} ${message.embeds}"`);

		if(destruct) {
			message.delete(destruct);
		}

		return message;
	},
	getMostPopulatedVoiceChannel: function(guild) {
		var channels = guild.channels.findAll("type", "voice");
		var mostPop = channels[0];

		channels.forEach(function(channel, key, map) {
			if(channel.members.size > mostPop.members.size) {
				mostPop = channel;
			}
		});

		return mostPop;
	},
	detectStringType: function(string) {
		if(parseInt(string) !== NaN) {
			return "number";
		} else {
			return "string";
		}
	}
};