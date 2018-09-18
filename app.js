const axios = require('axios');
const Discord = require('discord.js');
const client = new Discord.Client();

const config = require("./config.json");
const utils = require("./src/utils.js");

import { instances } from "./src/instances.js";

client.on("error", console.error);

client.on("ready", () => {
	utils.log("APP", `Bot has started, with ${client.users.size} users, in ${client.channels.size} channels of ${client.guilds.size} guilds.`);

	if(client.user.username != config.username) {
		client.user.setUsername(config.username);
		utils.log("APP", `Reset the bot's username to '${config.username}'`);
	}

	client.guilds.forEach(function(guild, key, map) {
		instances.instantiate(guild);
	});
});

client.on("guildCreate", guild => {
	utils.log("APP", `Server joined: ${guild.name} (id: ${guild.id}). This guild has ${guild.memberCount} members!`);
	instances.instantiate(guild);
});

client.on("guildDelete", guild => {
	utils.log("APP", `Server left: ${guild.name} (id: ${guild.id})`);
	instances.uninstantiate(guild);
});

client.on("message", async message => {
	if(message.author.bot || message.content.indexOf(config.prefix) != 0) {
		return;
	}

	utils.log("MSG REC", `"${message.author.username}: ${message.content}"`);

	var args = message.content.slice(config.prefix.length).trim().split(/ +/g);
	var command = args.shift().toLowerCase();

	switch(command) {
		case "ping":
			var ping = message.createdTimestamp - Date.now();
			utils.sendMessage(message.channel, `Pong! \`${ping}ms\``);
			break;
		case "eval":
			var result = eval(args.join(' '));
			utils.sendMessage(message.channel, `\`\`\`${result}\`\`\``);
			break;
		case "joim":
		case "join":
			var channel = message.guild.member(message.author).voiceChannel;
			await instances.player(message.guild).join(channel ? channel : instances.settings(message.guild).defVoice);
			break;
		case "gtfo":
		case "disconnect":
		case "exit":
		case "leave":
			if(!instances.player(message.guild).isAsleep()) {
				instances.player(message.guild).leave();
			} else {
				utils.sendMessage(instances.settings(message.guild).defText, `**<@${client.user.id}> is not in a voice channel**`);
			}
			break;
		case "pause":
			instances.player(message.guild).pause();
			break;
		case "resume":
			instances.player(message.guild).resume();
			break;
		case "stop":
			instances.player(message.guild).stop();
			break;
		case "play":
			if(args.length < 1) {
				instances.player(message.guild).resume();
			} else {
				var type = instances.player(message.guild).identifySourceType(args[0]);

				if(type != "invalid") {
					instances.player(message.guild).enqueue(type, args[0], message.author);
				} else {
					var terms = args.join(" ");
					utils.sendMessage(instances.settings(message.guild).defText, `**:small_blue_diamond: Searching for \`${terms}\`...**`);
					var list = await instances.player(message.guild).getYTSearchResults(terms);
					instances.player(message.guild).enqueue({ name: "youtube", specific: "video" }, "https://youtu.be/" + list[0].id.videoId, message.author);
				}
			}
			break;
		case "search":
			var terms = args.join(" ");
			utils.sendMessage(instances.settings(message.guild).defText, `**:small_blue_diamond: Searching for \`${terms}\`...**`);
			var list = await instances.player(message.guild).getYTSearchResults(terms);
			var listmsg = await utils.sendMessage(instances.settings(message.guild).defText, "", { embed: instances.player(message.guild).generateYTResultsEmbed(list) });

			await listmsg.react("1⃣"); await listmsg.react("2⃣");
			await listmsg.react("3⃣"); await listmsg.react("4⃣");
			await listmsg.react("5⃣"); await listmsg.react("🚫");

			listmsg.delete(10000);

			var collector = listmsg.createReactionCollector((reaction, user) => {
				return user.id == message.author.id &&
				(reaction.emoji.name == "1⃣" || reaction.emoji.name == "2⃣" || reaction.emoji.name == "3⃣" || reaction.emoji.name == "4⃣" || reaction.emoji.name == "5⃣" || reaction.emoji.name == "🚫");
			}, { time: 10000 });

			collector.once('collect', reaction => {
				var num;

				if(reaction.emoji.name == "🚫") {
					listmsg.delete();
					collector.stop();
					return;
				}

				switch(reaction.emoji.name) {
					case "1⃣": num = 1; break;
					case "2⃣": num = 2; break;
					case "3⃣": num = 3; break;
					case "4⃣": num = 4; break;
					case "5⃣": num = 5; break;
					default: num = 0;
				}

				instances.player(message.guild).enqueue({ name: "youtube", specific: "video" }, "https://youtu.be/" + list[num - 1].id.videoId, message.author);
				collector.stop();
			});
			break;
		case "skip":
			instances.player(message.guild).skip();
			break;
		case "delete":
		case "remove":
			instances.player(message.guild).remove(parseInt(args[0]));
			break;
		case "queue":
			if(args.length > 0 && !isNaN(args[0])) {
				utils.sendMessage(instances.settings(message.guild).defText, "", { embed: instances.player(message.guild).generateQueueEmbed(parseInt(args[0])) });
			} else {
				utils.sendMessage(instances.settings(message.guild).defText, "", { embed: instances.player(message.guild).generateQueueEmbed() });
			}
			break;
		case "nowplaying":
		case "now":
		case "current":
		case "np":
			if(instances.player(message.guild).isActive()) {
				utils.sendMessage(instances.settings(message.guild).defText, "", { embed: instances.player(message.guild).generateNowPlayingEmbed() });
			} else {
				utils.sendMessage(instances.settings(message.guild).defText, "**:small_blue_diamond: There isn't anything currently playing**");
			}
			break;
		case "vol":
		case "volume":
			if(args.length > 0) {
				instances.player(message.guild).setVolume(args[0]);
			}

			utils.sendMessage(instances.settings(message.guild).defText, `**:small_blue_diamond: Volume: \`${instances.player(message.guild).getVolume() * 100}%\`** | *Normalized: \`${instances.player(message.guild).getActualVolume() * 100}%\`*`);
			break;
		case "shuffle":
			instances.player(message.guild).shuffle();
			break;
		case "settings":
			if(args.length < 1) {
				utils.sendMessage(instances.settings(message.guild).defText, "", { embed: instances.settings(message.guild).getSettingsEmbed() });
			} else {
				if(args.length != 2) {
					utils.sendMessage(instances.settings(message.guild).defText, "**:small_blue_diamond: Invalid number of arguments**");
				} else {
					instances.settings(message.guild).editSetting(args[0], args[1]);
				}
			}
			break;
		case "bind":
			instances.settings(message.guild).editSetting("text", message.channel.id);
			break;
		default:
			message.reply("**Command not recognized**");
	}
});

client.login(config.token);