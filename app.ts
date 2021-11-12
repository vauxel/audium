import Discord from "discord.js";
import config from "./config.json";
import Utils from "./src/utils";
import { Persistence } from "./src/persistence";
import { InstanceManager } from "./src/instances.js";

const client = new Discord.Client();
const instances = new InstanceManager();

client.on("error", console.error);

client.on("ready", () => {
	Utils.log("APP", `Bot has started, with ${client.users.cache.size} users, in ${client.channels.cache.size} channels of ${client.guilds.cache.size} guilds.`);

	if (client.user.username != config.username) {
		client.user.setUsername(config.username);
		Utils.log("APP", `Reset the bot's username to '${config.username}'`);
	}

	client.guilds.cache.forEach((guild, key, map) => {
		instances.instantiate(guild);
	});
});

client.on("guildCreate", guild => {
	Utils.log("APP", `Server joined: ${guild.name} (id: ${guild.id}). This guild has ${guild.memberCount} members!`);
	instances.instantiate(guild);
});

client.on("guildDelete", guild => {
	Utils.log("APP", `Server left: ${guild.name} (id: ${guild.id})`);
	instances.uninstantiate(guild);
});

client.on("guildMemberAdd", member => {
	Utils.log("APP", `Member joined: ${member.displayName} (guild: ${member.guild.id})`);
	Persistence.use(member.guild.id).collection("members").add(member.guild.id);
});

client.on("guildMemberRemove", member => {
	Utils.log("APP", `Member left: ${member.displayName} (guild: ${member.guild.id})`);
	Persistence.use(member.guild.id).collection("members").remove(member.guild.id);
});

client.on("message", async message => {
	if (message.author.bot || message.content.indexOf(config.prefix) != 0) {
		return;
	}

	Utils.log("MSG REC", `"${message.author.username}: ${message.content}"`);

	let args = message.content.slice(config.prefix.length).trim().split(/ +/g);
	let result = instances.commands(message.guild).resolve(args.shift().toLowerCase(), args, message);

	if (result !== 0) {
		if (result === 1) {
			message.reply("**Command not recognized**");
		} else if (result === 2) {
			message.reply("**You do not have permission to use this command**");
		}
	}
});

client.login(config.token);
setInterval(Persistence.saveAll, config.db.saveinterval);
