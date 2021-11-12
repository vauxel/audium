import config from "../../config.json";
import Discord from "discord.js";
import Utils from "../utils";
import { Instances, Instance } from "../instances";
import { Persistence, PersistenceInstance } from "../persistence";

class Command {
	public aliases: string[];
	public name: string;
	public description: string;
	public func: any;
	public restricted: boolean;

	constructor(aliases: string[], name: string, description: string, func: any, restricted: boolean) {
		this.aliases = aliases;
		this.name = name;
		this.description = description;
		this.func = func;
		this.restricted = restricted;
	}
}

export default class CommandsInstance extends Instance {
	commands: Command[];
	instances: Instances;

	constructor(guild: Discord.Guild) {
		super(guild);
		this.commands = [];
	}

	instantiate(instances: Instances) {
		this.instances = instances;
		
		this.register(["ping"], "Ping", "Pings the bot", (args: string[], callmsg: Discord.Message) => {
			let ping = callmsg.createdTimestamp - Date.now();
			Utils.sendMessage(callmsg.channel, `Pong! \`${ping}ms\``);
		});
		
		this.register(["eval"], "Eval", "Evaluates a piece of code", ((args: string[], callmsg: Discord.Message) => {
			let result;
		
			try {
				result = eval(args.join(' '));
		
				if(typeof result === "object") {
					result = JSON.stringify(result, null, 2);
				}
			} catch (e) {
				result = e.message;
			}
		
			Utils.sendMessage(callmsg.channel, `\`\`\`${result}\`\`\``);
		}).bind(this));
		
		this.register(["help"], "Help", "Outputs the list of commands", (args: string[], callmsg: Discord.Message) => {
			let fields = [];
			for (let i = 0; i < this.commands.length; i++) {
				let command = this.commands[i];
				
				if (command.restricted && !callmsg.member.roles.resolve(this.db.global("admin_role"))) {
					continue;
				}

				fields.push({
					"name": `${command.name}${command.restricted ? " *(A)*" : ""}: \`[${command.aliases}]\` `,
					"value": `${command.description}`
				});
			}
		
			Utils.sendMessage(callmsg.channel, "", { embed: {
				"title": `Commands List`,
				"description": "",
				"color": 4886754,
				"fields": fields,
				"footer": {
					"text": "(A) = Admin restricted command"
				},
			}});
		});
	}

	register(aliases: string[], name: string, description: string, func: any, restricted?: boolean): void {
		if (this.commands.findIndex(value => value.name == name) == -1) {
			this.commands.push(new Command(
				aliases,
				name,
				description,
				func,
				restricted !== undefined ? restricted : false
			));
		}
	}

	resolve(cmd: string, args: string[], callmsg: Discord.Message): number {
		let resolved = this.commands.find(command => {
			return command.aliases.indexOf(cmd) != -1;
		});

		if (resolved) {
			if (resolved.restricted && !Utils.hasPermission(callmsg.member, this.db.global("admin_role"))) {
				return 2;
			}
			
			try {
				resolved.func(args, callmsg);
			} catch (e) {
				console.log(e.message);
			}

			return 0;
		} else {
			return 1;
		}
	}
}
