import Discord, { Guild } from "discord.js";
import config from "../config.json";

export default class Utils {
	static timeout(ms: number) {
		return new Promise(res => setTimeout(res, ms));
	}

	static log(caller: string, message: string) {
		console.log(`[${new Date().toLocaleString()}] (${caller}) ${message}`);
	}

	static debug(caller: string, message: string) {
		console.log(`[${new Date().toLocaleString()}] [DEBUG] (${caller}) ${message}`);
	}

	static async sendMessage(channel: Discord.TextChannel | Discord.DMChannel | Discord.NewsChannel, message: string, options?: object | number, destruct?: number) {
		if(typeof options == 'number') {
			destruct = options;
			options = {};
		}

		let messageObj = await channel.send(message, options);
		this.log("MSG SEND", `"${messageObj.content} ${messageObj.embeds}"`);

		if(destruct && destruct !== -1) {
			messageObj.delete({timeout: destruct});
		}

		return messageObj;
	}

	static detectStringType(str: string) {
		if(parseInt(str) !== NaN) {
			return "number";
		} else {
			return "string";
		}
	}

	static hasPermission(member: Discord.GuildMember, roleId: string) {
		return roleId === member.guild.roles.everyone.id || member.roles.cache.find((r: Discord.Role) => r.id == roleId) !== undefined;
	}
}
