const axios = require('axios');
const http = require('http');
import Stream from "stream";
import ytdl from "ytdl-core";
import Discord from "discord.js";
import Utils from "../utils";
import { Persistence, PersistenceInstance } from "../persistence";
import { Instance, Instances } from "../instances";
import config from "../../config.json";

enum PlayerState {
	ASLEEP = 0,
	INACTIVE = 1,
	PLAYING = 2,
	PAUSED = 3
}

enum PlayerSource {
	YOUTUBE,
	SOUNDCLOUD,
	FILE
}

enum PlayerSourceSpecific {
	VIDEO,
	PLAYLIST
}

interface PlayerItemMetadata {
	duration: number;
	title: string;
	imageUrl?: string;
	author?: string;
	loudness?: string;
}

class PlayerItem {
	public source: PlayerSource;
	public requester: Discord.GuildMember;
	public metadata: PlayerItemMetadata;
	public stream;

	constructor(source: PlayerSource, requester: Discord.GuildMember, metadata: PlayerItemMetadata, stream: Stream.Readable) {
		this.source = source;
		this.requester = requester;
		this.metadata = metadata;
		this.stream = stream;
	}
}

interface SourceType {
	major: PlayerSource;
	minor: PlayerSourceSpecific | null;
}

export default class PlayerInstance extends Instance {
	private connection: Discord.VoiceConnection | null;
	private dispatcher: Discord.StreamDispatcher | null;
	private state: PlayerState;
	private queue: PlayerItem[];
	private current: PlayerItem | null;
	private preferenceVol: number;
	private normalizedVol: number;

	constructor(guild: Discord.Guild) {
		super(guild);

		this.connection = null;
		this.dispatcher = null;

		this.state = PlayerState.ASLEEP;
		this.queue = new Array<PlayerItem>();
		this.current = null;

		this.preferenceVol = 1.0;
		this.normalizedVol = 1.0;
	}

	instantiate(instances: Instances) {
		this.instances = instances;

		this.instances.commands.register(["join", "joim"], "Player Join", "Connects the music player to the voice channel", this.joinHandler.bind(this));

		this.instances.commands.register(["leave", "gtfo", "disconnect"], "Player Leave", "Disconnects the music player from the voice channel", this.leaveHandler.bind(this));

		this.instances.commands.register(["pause"], "Player Pause", "Pauses the music player", this.pauseHandler.bind(this));

		this.instances.commands.register(["resume"], "Player Resume", "Resumes the music player", this.resumeHandler.bind(this));

		this.instances.commands.register(["play"], "Player Play", "Plays or resumes a link for the music player", this.playHandler.bind(this));

		this.instances.commands.register(["search"], "Player Search", "Searches YouTube videos for keywords", this.searchHandler.bind(this));

		this.instances.commands.register(["skip"], "Player Skip", "Skips the current music player song", this.skipHandler.bind(this));

		this.instances.commands.register(["remove", "delete"], "Player Remove", "Removes a song from the music player queue", this.removeHandler.bind(this));

		this.instances.commands.register(["queue"], "Player Queue", "Lists the current queue", this.queueHandler.bind(this));

		this.instances.commands.register(["np", "current", "now", "playing"], "Player Now Playing", "Displays the current music player song", this.nowPlayingHandler.bind(this));

		this.instances.commands.register(["vol", "volume"], "Player Volume", "Displays music player volume", this.volumeHandler.bind(this));

		//this.instances.commands.register(["shuffle"], "Player Shuffle", "Shuffles the music player queue", this.shuffleHandler.bind(this));
	}

	isAsleep(): boolean {
		return this.state === PlayerState.ASLEEP;
	}

	isAwake(): boolean {
		return this.state !== PlayerState.ASLEEP;
	}

	isInactive(): boolean {
		return this.state === PlayerState.INACTIVE;
	}

	isActive(): boolean {
		return this.state === PlayerState.PLAYING || this.state === PlayerState.PAUSED;
	}

	isPlaying(): boolean {
		return this.state === PlayerState.PLAYING;
	}

	isPaused(): boolean {
		return this.state === PlayerState.PAUSED;
	}

	setState(newState: PlayerState): void {
		this.state = newState;
		Utils.debug("PLAYER", `PlayerState is now ${newState}`);
	}

	async joinHandler(args: string[], callmsg: Discord.Message): Promise<void> {
		if (this.isAwake()) {
			Utils.log("PLAYER", "Tried to join while already being awake");
			Utils.sendMessage(callmsg.channel, `**:small_blue_diamond: The bot is already connected**`);
			return;
		}

		let voiceChannel = callmsg.guild.member(callmsg.author).voice.channel;

		if (!voiceChannel) {
			Utils.sendMessage(callmsg.channel, `**:small_blue_diamond: You must be in a voice channel to summon the bot**`);
			return;
		}

		await this.join(voiceChannel);
		Utils.sendMessage(callmsg.channel, `**:small_blue_diamond: Joined \`${voiceChannel.name}\`**`);
	}

	async join(channel: Discord.VoiceChannel): Promise<void> {
		if (this.isAwake()) {
			Utils.log("PLAYER", "Tried to join voice channel despite being already awake");
			return;
		}

		this.connection = await channel.join();
		Utils.log("PLAYER", `Joined the voice channel: ${channel.name}`);
		this.setState(PlayerState.INACTIVE);
	}

	leaveHandler(args: string[], callmsg: Discord.Message): void {
		if (this.isAwake()) {
			Utils.sendMessage(callmsg.channel, `**:small_blue_diamond: Left \`${this.connection.channel.name}\`**`);
			this.leave();
		} else {
			Utils.sendMessage(callmsg.channel, `**The bot is not in a voice channel**`);
		}
	}

	leave(): void {
		if (this.isAsleep()) {
			Utils.log("PLAYER", "Tried to leave voice channel despite being already asleep");
			return;
		}

		Utils.log("PLAYER", `Left the voice channel: ${this.connection.channel.name}`);

		this.connection.disconnect();
		this.connection = null;
		this.dispatcher = null;
		this.current = null;
		this.queue = new Array<PlayerItem>();
		this.setState(PlayerState.ASLEEP);
	}

	private attemptLeave(): void {
		Utils.debug("PLAYER", `Attempting to leave voice channel`);
		if (this.isInactive()) {
			this.leave();
		}
	}

	async playHandler(args: string[], callmsg: Discord.Message): Promise<void> {
		if (args.length < 1) { // resume current item
			this.resume();
		} else { // play new item
			this.play(args.join(" "), callmsg);
		}
	}

	async play(sourceStr: string, callmsg: Discord.Message): Promise<void> {
		if (this.isAsleep()) {
			let voiceChannel = callmsg.guild.member(callmsg.author).voice.channel;

			if (!voiceChannel) {
				Utils.sendMessage(callmsg.channel, `**:small_blue_diamond: You must be in a voice channel to play music**`);
				return;
			}
	
			await this.join(voiceChannel);
		}

		let type = this.identifySourceType(sourceStr);

		if (type !== null) { // valid url
			Utils.sendMessage(callmsg.channel, `**:small_blue_diamond: Loading \`${sourceStr}\`...**`);
			this.enqueue(type, sourceStr, callmsg.member);
		} else { // youtube search string (invalid url)
			Utils.sendMessage(callmsg.channel, `**:small_blue_diamond: Searching for \`${sourceStr}\`...**`);
			let list = await this.getYoutubeSearchResults(sourceStr);
			Utils.sendMessage(callmsg.channel, `**:small_blue_diamond: Loading and enqueueing \`${"https://youtu.be/" + list[0].id.videoId}\`...**`);
			this.enqueue({ major: PlayerSource.YOUTUBE, minor: PlayerSourceSpecific.VIDEO }, "https://youtu.be/" + list[0].id.videoId, callmsg.member);
		}
	}

	identifySourceType(url: string): SourceType | null {
		if (/^(http|https):\/\/[^ "]+$/.test(url)) {
			if (ytdl.validateURL(url)) {
				if (/^.*(list=)([^#\&\?]*).*/.test(url)) {
					return { major: PlayerSource.YOUTUBE, minor: PlayerSourceSpecific.PLAYLIST };
				} else {
					return { major: PlayerSource.YOUTUBE, minor: PlayerSourceSpecific.VIDEO };
				}
			} else if (/soundcloud/.test(url)) {
				return { major: PlayerSource.SOUNDCLOUD, minor: PlayerSourceSpecific.VIDEO };
			} else {
				return { major: PlayerSource.FILE, minor: null };
			}
		} else {
			return null;
		}
	}

	async enqueue(source: SourceType, sourceUrl: string, requester: Discord.GuildMember): Promise<void> {
		/*if (type.major == PlayerSource.YOUTUBE && type.minor == PlayerSourceSpecific.PLAYLIST) {
			let id = new RegExp("[&?]list=([a-z0-9_]+)", "i").exec(source)[1];
			let list = await this.getYTPlaylistItems(id);
			this._enqueueYTPlaylist(list, requester);
			return;
		}*/

		this.enqueueSingle(source.major, sourceUrl, requester);
	}

	private async enqueueSingle(source: PlayerSource, sourceUrl: string, requester: Discord.GuildMember): Promise<void> {
		Utils.debug("PLAYER", `Enqueueing ${source} | ${sourceUrl}`);
		let data = await this.getStreamData(source, sourceUrl);

		if (!data) {
			Utils.sendMessage(this.instances.settings.defText, `**:small_blue_diamond: Failed to retrieve data from the given source**`);
			return;
		}

		let item = new PlayerItem(source, requester, data.meta, data.stream);
		this.queue.push(item);

		Utils.sendMessage(this.instances.settings.defText, "", { embed: this.generateEnqueuedEmbed(item) });
		Utils.sendMessage(this.instances.settings.defText, "", { embed: this.generateQueueEmbed() });

		if (this.isInactive()) {
			this.playNext();
		}
	}

	private async getStreamData(source: PlayerSource, sourceUrl: string): Promise<{stream: Stream.Readable, meta: PlayerItemMetadata}> {
		if (source === PlayerSource.YOUTUBE) {
			return await this.getStreamDataYoutube(sourceUrl);
		} else if (source === PlayerSource.SOUNDCLOUD) {
			return await this.getStreamDataSoundcloud(sourceUrl);
		}
	}

	private async getStreamDataYoutube(sourceUrl: string): Promise<{stream: Stream.Readable, meta: PlayerItemMetadata}> {
		let starttime = Date.now();
		let stream = ytdl(sourceUrl, { filter: "audioonly", quality: "highestaudio" });

		return new Promise((resolve, reject) => {
			stream.on("error", (err) => {
				Utils.log("PLAYER", `YouTube video (${sourceUrl}) failed to be retrieved: ${err}`);
				resolve(null);
			});

			stream.on("info", (info) => {
				let meta = this.extractYoutubeMeta(info);
				Utils.log("PLAYER", `YouTube video (${sourceUrl}) retrieved in ${Date.now() - starttime}ms`);
				resolve({stream, meta});
			});
		});
	}

	private extractYoutubeMeta(info: ytdl.videoInfo): PlayerItemMetadata {
		return {
			duration: parseInt(info.videoDetails.lengthSeconds),
			title: info.videoDetails.title,
			imageUrl: `https://i.ytimg.com/vi/${info.videoDetails.videoId}/default.jpg`,
			author: info.videoDetails.author.name,
			loudness: info.loudness
		};
	}

	private async getStreamDataSoundcloud(sourceUrl: string): Promise<{stream: Stream.Readable, meta: PlayerItemMetadata}> {
		let starttime = Date.now();
		let inforeq = await axios.get("http://api.soundcloud.com/resolve", {
			params: {
				url: sourceUrl,
				client_id: config.player.scapikey
			}
		});

		let meta = this.extractSoundcloudMeta(inforeq.data);

		return new Promise((resolve, reject) => {
			axios.get(`http://api.soundcloud.com/tracks/${inforeq.data.id}/stream`, {
				params: {
					client_id: config.player.scapikey
				},
				responseType: "stream"
			}).then((res: any) => {
				let stream = new Stream.PassThrough();
				res.data.pipe(stream);
				Utils.log("PLAYER", `SoundCloud audio (${sourceUrl}) retrieved in ${Date.now() - starttime}ms`);
				resolve({stream, meta});
			}).catch((err: any) => {
				Utils.log("PLAYER", `SoundCloud audio (${sourceUrl}) failed to be retrieved: ${err}`);
				resolve(null);
			});
		});
	}

	private extractSoundcloudMeta(info: any): PlayerItemMetadata {
		return {
			duration: Math.floor(parseInt(info.duration) / 1000),
			title: info.title,
			imageUrl: info.artwork_url,
			author: info.user.username
		};
	}

	async getYoutubeSearchResults(keyword: string): Promise<any> {
		let response = await axios.get("https://www.googleapis.com/youtube/v3/search", {
			params: {
				"part": "snippet",
				"type": "video",
				"maxResults": 5,
				"q": keyword,
				"key": config.player.ytapikey
			}
		});

		return response.data.items;
	}

	private async playNext(): Promise<void> {
		if (this.queue.length > 0) {
			Utils.debug("PLAYER", `Playing the next item in the queue`);
			this.current = this.queue.shift();
			await this.playCurrent();
			let npmsg = await Utils.sendMessage(this.instances.settings.defText, "", { embed: this.generateNowPlayingEmbed() });
			this.updateNowPlayingEmbed(this.current, npmsg);
		} else {
			Utils.debug("PLAYER", `Finished playing all items in the queue`);
			setTimeout(() => this.attemptLeave(), config.player.timeout);
		}
	}

	private async playCurrent(): Promise<void> {
		Utils.debug("PLAYER", `Playing the current item`);

		if (!this.isInactive()) {
			Utils.log("PLAYER", "Tried to play while not inactive");
			return;
		}

		if (!this.current) {
			Utils.log("PLAYER", "There isn't a current queue item to play");
			return;
		}
		
		this.playStream(this.current.stream, () => this.playNext());
		this.setState(PlayerState.PLAYING);
	}

	private playStream(stream: Stream.Readable, finishedcb: any) {
		if (this.isAsleep()) {
			Utils.log("PLAYER", "Tried to play audio stream while being asleep");
			return;
		}

		Utils.debug("PLAYER", `Playing the stream`);

		this.dispatcher = this.connection.play(stream, {
			bitrate: config.player.bitrate,
			//volume: this.getCombinedVolume()
		});

		if (finishedcb && typeof finishedcb === "function") {
			this.dispatcher.on("finish", () => {
				Utils.debug("PLAYER", `Stream finished`);
				this.dispatcher = null;
				this.current = null;
				this.setState(PlayerState.INACTIVE);
				finishedcb();
			});

			this.dispatcher.on("error", (err) => {
				Utils.debug("PLAYER", `Stream error: ${err}`);
				this.dispatcher = null;
				this.current = null;
				this.setState(PlayerState.INACTIVE);
				finishedcb();
			});
		}
	}

	resumeHandler(args: string[], callmsg: Discord.Message): void {
		if (!this.isPaused()) {
			Utils.sendMessage(callmsg.channel, `**:small_blue_diamond: The player isn't currently paused**`);
			return;
		}

		this.resume();
		Utils.sendMessage(callmsg.channel, `:play_pause:`, 2500);
	}

	resume(): void {
		if (!this.isPaused()) {
			Utils.log("PLAYER", "Tried to resume the player without being paused");
			return;
		}

		Utils.debug("PLAYER", `Resumed`);
		this.setState(PlayerState.PLAYING);
		this.dispatcher.resume();
	}

	pauseHandler(args: string[], callmsg: Discord.Message): void {
		if (!this.isPlaying()) {
			Utils.sendMessage(callmsg.channel, `**:small_blue_diamond: There isn't anything currently playing**`);
			return;
		}

		this.pause();
		Utils.sendMessage(callmsg.channel, `:pause_button:`, 2500);
	}

	pause() {
		if (!this.isPlaying()) {
			Utils.log("PLAYER", "Tried to resume the player without being playing");
			return;
		}

		Utils.debug("PLAYER", `Paused`);
		this.setState(PlayerState.PAUSED);
		this.dispatcher.pause();
	}

	skipHandler(args: string[], callmsg: Discord.Message): void {
		Utils.sendMessage(callmsg.channel, `**:small_blue_diamond: Skipped \`${this.current.metadata.title}\`**`);
		this.skip();
	}

	skip(): void {
		Utils.debug("PLAYER", `Skipped`);
		this.stop();
	}

	stop() {
		Utils.debug("PLAYER", `Stopped`);
		this.state = PlayerState.INACTIVE;
		this.dispatcher.end();
	}

	removeHandler(args: string[], callmsg: Discord.Message): void {
		let index = parseInt(args[0]);

		if (isNaN(index)) {
			Utils.sendMessage(callmsg.channel, `**:small_blue_diamond: Invalid index**`);
			return;
		}

		index--;

		if (index < 0 || index >= this.queue.length) {
			Utils.sendMessage(callmsg.channel, `**:small_blue_diamond: There isn't an item at that index**`);
			return;
		}

		Utils.sendMessage(callmsg.channel, `**:small_blue_diamond: Removed \`${this.queue[index].metadata.title}\` from the queue**`);
		this.remove(parseInt(args[0]));
		Utils.sendMessage(callmsg.channel, "", {embed: this.generateQueueEmbed()});
	}

	remove(index: number): void {
		Utils.debug("PLAYER", `Removed queue index ${index}`);
		this.queue.splice(index, 1);
	}

	volumeHandler(args: string[], callmsg: Discord.Message): void {
		if (args.length > 0) {
			this.setVolume(parseFloat(args[0]));
		}

		Utils.sendMessage(callmsg.channel, `**:small_blue_diamond: Volume: \`${this.getPreferenceVolume() * 100}%\`** | *Actual: \`${this.getCombinedVolume() * 100}%\`*`);
	}

	setVolume(vol: number): void {
		Utils.debug("PLAYER", `Set the volume to ${vol}`);
		this.preferenceVol = parseFloat(Math.min(Math.max(vol / 100, 0.1), 2.0).toFixed(4));

		if (this.dispatcher) {
			this.dispatcher.setVolume(this.getCombinedVolume());
		}
	}

	getPreferenceVolume(): number {
		return this.preferenceVol;
	}

	getNormalizedVolume(): number {
		return this.normalizedVol;
	}

	getCombinedVolume(): number {
		return parseFloat(Math.min(Math.max(this.preferenceVol * this.normalizedVol, 0.1), 1.0).toFixed(4));
	}

	async searchHandler(args: string[], callmsg: Discord.Message): Promise<void> {
		let terms = args.join(" ");
		Utils.sendMessage(callmsg.channel, `**:small_blue_diamond: Searching for \`${terms}\`...**`);
		let list = await this.getYoutubeSearchResults(terms);
		let listmsg = await Utils.sendMessage(callmsg.channel, "", {embed: this.generateYoutubeResultsEmbed(list)});

		let collector = listmsg.createReactionCollector((reaction, user) => {
			return user.id == callmsg.author.id &&
			(reaction.emoji.name == "1⃣" || reaction.emoji.name == "2⃣" || reaction.emoji.name == "3⃣" || reaction.emoji.name == "4⃣" || reaction.emoji.name == "5⃣" || reaction.emoji.name == "🚫");
		}, {time: 10000});

		listmsg.delete({timeout: 10000});

		collector.once("collect", reaction => {
			let num: number;

			if (reaction.emoji.name == "🚫") {
				listmsg.delete();
				collector.stop();
				return;
			}

			switch (reaction.emoji.name) {
				case "1⃣": num = 1; break;
				case "2⃣": num = 2; break;
				case "3⃣": num = 3; break;
				case "4⃣": num = 4; break;
				case "5⃣": num = 5; break;
				default: num = 0;
			}

			Utils.sendMessage(callmsg.channel, `**:small_blue_diamond: Loading \`${list[num - 1].snippet.title}\`...**`);
			this.enqueue({major: PlayerSource.YOUTUBE, minor: PlayerSourceSpecific.VIDEO}, "https://youtu.be/" + list[num - 1].id.videoId, callmsg.member);
			collector.stop();
		});

		await listmsg.react("1⃣"); await listmsg.react("2⃣");
		await listmsg.react("3⃣"); await listmsg.react("4⃣");
		await listmsg.react("5⃣"); await listmsg.react("🚫");
	}

	queueHandler(args: string[], callmsg: Discord.Message): void {
		if (args.length > 0 && !isNaN(parseInt(args[0]))) {
			Utils.sendMessage(callmsg.channel, "", {embed: this.generateQueueEmbed(parseInt(args[0]))});
		} else {
			Utils.sendMessage(callmsg.channel, "", {embed: this.generateQueueEmbed()});
		}
	}

	nowPlayingHandler(args: string[], callmsg: Discord.Message): void {
		if (this.isActive()) {
			Utils.sendMessage(callmsg.channel, "", {embed: this.generateNowPlayingEmbed()});
		} else {
			Utils.sendMessage(callmsg.channel, "**:small_blue_diamond: There isn't anything currently playing**");
		}
	}

	secondsToTimestamp(seconds: number): string {
		return new Date(seconds * 1000).toISOString().substr(11, 8);
	}

	updateNowPlayingEmbed(current: PlayerItem, message: Discord.Message) {
		if(!this.isActive() || this.current !== current) {
			return;
		}

		message.edit("", {embed: this.generateNowPlayingEmbed()});

		setTimeout(() => {
			this.updateNowPlayingEmbed(current, message);
		}, 5000);
	}

	generateYoutubeResultsEmbed(results: any[]): Discord.MessageEmbedOptions {
		let list = "";

		for (let i = 0; i < results.length; i++) {
			list += "`[" + (i + 1) + "]` " + `[${results[i].snippet.title}](https://youtu.be/${results[i].id.videoId})`;

			if (i != (results.length - 1)) {
				list += "\n";
			}
		}

		return {
			title: "YouTube Search Results",
			description: "*Click on the corresponding number reaction to select a video*" + "\n\n" + list,
			color: 4886754
		};
	}

	generateEnqueuedEmbed(item: PlayerItem): Discord.MessageEmbedOptions {
		let position = this.queue.indexOf(item);
		let eta: string;

		if (this.queue.length === 1) {
			eta = "NOW";
		} else {
			let etaSeconds = this.current.metadata.duration - (this.dispatcher.streamTime / 1000);;

			for (let i = 0; i < position; i++) {
				etaSeconds += this.queue[i].metadata.duration;
			}

			eta = this.secondsToTimestamp(etaSeconds);
		}

		return {
			"title": "Added to Queue",
			"description": `[${item.metadata.title}](${item.source})`,
			"color": 4886754,
			"thumbnail": {
				"url": item.metadata.imageUrl
			},
			"fields": [
				{
					"name": "Length",
					"value": "`" + this.secondsToTimestamp(item.metadata.duration) + "`"
				},
				{
					"name": "Position / ETA",
					"value": `\`${position + 1}\` / \`${eta}\``
				}
			]
		};
	}

	generateNowPlayingEmbed(): Discord.MessageEmbedOptions {
		let numpercent = Math.floor(((this.dispatcher.streamTime / 1000) / this.current.metadata.duration) * 25);
		let progress = "[" + "=".repeat(numpercent) + "#" + "=".repeat(Math.max(0, 25 - numpercent)) + "] | " + Math.floor(((this.dispatcher.streamTime / 1000) / this.current.metadata.duration) * 100) + "%";

		return {
			title: "Now Playing",
			description: `[${this.current.metadata.title}](${this.current.source})`,
			color: 4886754,
			thumbnail: {
				url: this.current.metadata.imageUrl
			},
			footer: {
				text: progress
			},
			fields: [
				{
					name: "Length / Elapsed",
					value: "`" + this.secondsToTimestamp(this.current.metadata.duration) + "` / `" + this.secondsToTimestamp(this.dispatcher.streamTime / 1000) + "`"
				},
				{
					name: "Requested By",
					value: "`" + this.current.requester.displayName + "`"
				}
			]
		};
	}

	generateQueueEmbed(page: number = 1): Discord.MessageEmbedOptions {
		let queue = "";
		let totaltime = 0;
		page = Math.min(Math.max(page, 1), Math.ceil(this.queue.length / 5));

		if (this.current && page === 1) {
			queue += `\`[NOW PLAYING]\` __**[${this.current.metadata.title}](${this.current.source})**__` + "\n" + "Requester: `" + this.current.requester.displayName + "`\n" + "Duration: `" + this.secondsToTimestamp(this.current.metadata.duration) + "`";
		}

		let start = (page - 1) * 5;

		for (let i = start; i < this.queue.length; i++) {
			if(i >= start && i < (start + 5)) {
				queue += (queue ? "\n\n" : "") + `\`[${i + 1}]\` __**[${this.queue[i].metadata.title}](${this.queue[i].source})**__` + "\n" + "Requester: `" + this.queue[i].requester.displayName + "`\n" + "Duration: `" + this.secondsToTimestamp(this.queue[i].metadata.duration) + "`";
			}

			if (this.queue[i].metadata.duration) {
				totaltime += this.queue[i].metadata.duration;
			}
		}

		if (this.queue.length > (start + 5)) {
			queue += `\n\n***+${this.queue.length - (start + 5)} more queue items***`;
		}

		return {
			title: "Player Queue",
			description: `**Queue Length:** \`${this.queue.length}\`\n**Total Time:** \`${this.secondsToTimestamp(totaltime)}\`\n\n${queue}`,
			color: 4886754,
			footer: {
				text: `Page #${Math.ceil((start + 1) / 5)} of ${Math.max(1, Math.ceil(this.queue.length / 5))}`
			}
		};
	}
}
