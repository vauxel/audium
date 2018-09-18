const axios = require('axios');
const ytdl = require('ytdl-core');
const config = require("../config.json");
const utils = require("./utils.js");

import { instances } from "./instances.js";

const PlayerState = {
	ASLEEP: 0,
	INACTIVE: 1,
	STOPPED: 2,
	PLAYING: 3,
	PAUSED: 4
};

export default class PlayerInstance {
	constructor(guild) {
		this.guild = guild;

		this.connection = undefined;
		this.dispatcher = undefined;

		this.state = PlayerState.ASLEEP;
		this.queue = [];
		this.current = null;

		this.volume_normal = 1.0;
		this.volume_scale = 0.8;
		this.autoplay = true;
	}

	secondsToTimestamp(seconds) {
		return new Date(seconds * 1000).toISOString().substr(11, 8);
	}

	isAsleep() {
		return this.state == PlayerState.ASLEEP;
	}

	isInactive() {
		return this.state == PlayerState.INACTIVE;
	}

	isPlaying() {
		return this.state == PlayerState.PLAYING;
	}

	isPaused() {
		return this.state == PlayerState.PAUSED;
	}

	isActive() {
		return this.state == PlayerState.PLAYING || this.state == PlayerState.PAUSED;
	}

	isStopped() {
		return this.state == PlayerState.STOPPED;
	}

	getState() {
		return this.state;
	}

	getConnection() {
		return this.connection;
	}

	async join(channel) {
		if(!this.isAsleep()) {
			utils.log("PLAYER", "Tried to join while already being active");
			utils.sendMessage(instances.settings(this.guild).defText, `**:small_blue_diamond: The bot is already connected**`);
			return;
		}

		this.connection = await channel.join();

		utils.log("PLAYER", `Joined the voice channel: ${channel.name}`);
		utils.sendMessage(instances.settings(this.guild).defText, `**:small_blue_diamond: Joined \`${channel.name}\`**`);

		this.state = PlayerState.INACTIVE;
	}

	leave() {
		if(this.isAsleep()) {
			utils.log("PLAYER", "Tried to leave voice channel despite being already asleep");
			return;
		}

		utils.log("PLAYER", `Left the voice channel: ${this.connection.channel.name}`);
		utils.sendMessage(instances.settings(this.guild).defText, `**:small_blue_diamond: Left \`${this.connection.channel.name}\`**`);

		this.connection.disconnect();
		this.connection = null;

		this.state = PlayerState.ASLEEP;
		this.current = null;
		this.queue = [];
	}

	_attemptLeave() {
		if(this.isInactive()) {
			this.leave();
		}
	}

	getVolume() {
		return this.volume_scale;
	}

	getActualVolume() {
		return Math.min(Math.max(this.volume_normal * this.volume_scale, 0.1), 1.0).toFixed(4);
	}

	setVolume(vol) {
		this.volume_scale = Math.min(Math.max(parseFloat(vol / 100), 0.1), 2.0).toFixed(4);

		if(this.dispatcher) {
			this.dispatcher.setVolume(this.getActualVolume());
		}
	}

	async playNext() {
		if(this.queue.length > 0 && this.autoplay && !this.isStopped()) {
			this.current = this.queue.shift();
			await this._playCurrent();
			var npmsg = await utils.sendMessage(instances.settings(this.guild).defText, "", { embed: this.generateNowPlayingEmbed() });
			this.updateNowPlayingEmbed(this.current, npmsg);
		} else {
			if(!this.isStopped()) {
				setTimeout(() => this._attemptLeave(), config.player.timeout);
			}

			this.state = PlayerState.INACTIVE;
		}

		if(!this.autoplay) {
			this.autoplay = true;
		}
	}

	async _playCurrent() {
		if(!this.connection) {
			await this.join(instances.settings(this.guild).defVoice);
		}

		if(!this.current) {
			utils.log("PLAYER", "There isn't a current queue item to play");
			return;
		}

		this.volume_normal = Math.min(Math.max(Math.pow(10, (config.player.dblevel - (this.current.meta.loudness ? this.current.meta.loudness : config.player.dblevel)) / 10), 0.1), 0.9);
		this._playStream(this.current.stream, () => this.playNext());
		this.state = PlayerState.PLAYING;
	}

	_playStream(stream, finishedcb) {
		if(this.isAsleep()) {
			utils.log("PLAYER", "Tried to play audio stream while being asleep");
			return;
		}

		this.dispatcher = this.connection.playStream(stream, { bitrate: config.player.bitrate });
		this.dispatcher.setBitrate(config.player.bitrate / 1000);
		this.dispatcher.setVolume(this.getActualVolume());

		if(finishedcb) {
			this.dispatcher.on("end", () => {
				this.dispatcher = null;
				this.current = null;
				finishedcb();
			});
		}
	}

	pause() {
		if(!this.isPlaying()) {
			utils.log("PLAYER", "Tried to pause the player without being active");
			utils.sendMessage(instances.settings(this.guild).defText, `**:small_blue_diamond: There isn't anything currently playing**`);
			return;
		}

		utils.sendMessage(instances.settings(this.guild).defText, `:pause_button:`, 2500);

		this.state = PlayerState.PAUSED;
		this.dispatcher.pause();
	}

	resume() {
		if(!this.isActive()) {
			if(this.queue.length > 0) {
				this.playNext();
			} else {
				utils.sendMessage(instances.settings(this.guild).defText, `**:small_blue_diamond: There isn't anything in the queue to play**`);
			}

			return;
		}

		if(!this.isPaused()) {
			utils.sendMessage(instances.settings(this.guild).defText, `**:small_blue_diamond: The player isn't currently paused**`);
			return;
		}

		utils.sendMessage(instances.settings(this.guild).defText, `:play_pause:`, 2500);

		this.state = PlayerState.PLAYING;
		this.dispatcher.resume();
	}

	skip() {
		utils.sendMessage(instances.settings(this.guild).defText, `**:small_blue_diamond: Skipped \`${this.current.meta.title}\`**`);

		if(this.isActive()) {
			this.dispatcher.end();
		} else {
			this.playNext();
		}
	}

	stop() {
		if(!this.isActive()) {
			utils.log("PLAYER", "Tried to stop the player without it currently playing");
			utils.sendMessage(instances.settings(this.guild).defText, `**:small_blue_diamond: There isn't anything currently playing**`);
			return;
		}

		utils.sendMessage(instances.settings(this.guild).defText, `:stop_button:`, 2500);

		this.state = PlayerState.STOPPED;
		this.queue.unshift(this.current);
		this.dispatcher.end();
	}

	remove(index) {
		if(isNaN(index)) {
			utils.sendMessage(instances.settings(this.guild).defText, `**:small_blue_diamond: Invalid index**`);
			return;
		}

		index--;

		if(index < 0 || index >= this.queue.length) {
			utils.sendMessage(instances.settings(this.guild).defText, `**:small_blue_diamond: There isn't an item at that index**`);
			return;
		}

		utils.sendMessage(instances.settings(this.guild).defText, `**:small_blue_diamond: Removed \`${this.queue[index].meta.title}\` from the queue**`);
		this.queue.splice(index, 1);
		utils.sendMessage(instances.settings(this.guild).defText, "", { embed: this.generateQueueEmbed() });
	}

	shuffle() {
		if(this.queue.length < 1) {
			utils.sendMessage(instances.settings(this.guild).defText, `**:small_blue_diamond: Can't shuffle an empty queue**`);
			return;
		}

		var newqueue = [], n = this.queue.length, i;

		while(n) {
			i = Math.floor(Math.random() * n--);
			newqueue.push(this.queue.splice(i, 1)[0]);
		}

		this.queue = newqueue;
		utils.sendMessage(instances.settings(this.guild).defText, `**:small_blue_diamond: Shuffled ${this.queue.length} queue items**`);
	}

	_enqueueYTPlaylist(list, requester) {
		var videos = [];

		for(var i = 0; i < list.length; i++) {
			videos.push({
				type: { name: "youtube", specific: "video" },
				source: "https://youtu.be/" + list[i].contentDetails.videoId
			});
		}

		this._enqueueMultiple(videos, requester);
	}

	async _enqueueMultiple(items, requester) {
		var promises = [];

		for(var i = 0; i < items.length; i++) {
			promises.push(this._getStreamDataFromSource(items[i].type, items[i].source));
		}

		var parsed_data = await Promise.all(promises);
		var failed = 0;

		for(var i = 0; i < parsed_data.length; i++) {
			if(parsed_data[i] == null) {
				failed++;
				continue;
			}

			this.queue.push({
				type: items[i].type,
				source: items[i].source,
				requester,
				meta: parsed_data[i].meta,
				stream: parsed_data[i].stream
			});
		}

		utils.sendMessage(instances.settings(this.guild).defText, `**:small_blue_diamond: Enqueued \`${parsed_data.length - failed}\` items...**`);
		utils.sendMessage(instances.settings(this.guild).defText, "", { embed: this.generateQueueEmbed() });

		if(!this.current) {
			this.playNext();
		}
	}

	async _enqueueSingle(type, source, requester) {
		var data = await this._getStreamDataFromSource(type, source);

		if(!data) {
			utils.sendMessage(instances.settings(this.guild).defText, `**:small_blue_diamond: Failed to retrieve data from the given source (invalid URL)**`);
			return;
		}

		var item = {
			type,
			source,
			requester,
			meta: data.meta,
			stream: data.stream
		};

		this.queue.push(item);

		utils.sendMessage(instances.settings(this.guild).defText, "", { embed: this.generateEnqueuedEmbed(item) });

		if(this.current || this.queue.length > 1) {
			utils.sendMessage(instances.settings(this.guild).defText, "", { embed: this.generateQueueEmbed() });
		}

		if(!this.current) {
			this.playNext();
		}
	}

	async enqueue(type, source, requester) {
		utils.sendMessage(instances.settings(this.guild).defText, `**:small_blue_diamond: Loading \`${source}\`...**`);

		if(type.name == "youtube" && type.specific == "playlist") {
			var id = new RegExp("[&?]list=([a-z0-9_]+)", "i").exec(source)[1];
			var list = await this.getYTPlaylistItems(id);
			this._enqueueYTPlaylist(list, requester);
			return;
		}

		this._enqueueSingle(type, source, requester);
	}

	async _getStreamDataFromSource(type, source) {
		var stream = null;
		var meta = {};
		var starttime = Date.now();

		if(type.name == "youtube") {
			stream = ytdl(source, { filter: 'audioonly', quality: 'highestaudio' });

			return new Promise((resolve, reject) => {
				stream.on('error', (error) => {
					utils.log("PLAYER", `YouTube video (${source}) failed to be retrieved`);
					resolve(null);
				});

				stream.on('info', (info) => {
					meta = this._extractYTInfo(info);
					utils.log("PLAYER", `YouTube video (${source}) retrieved in ${Date.now() - starttime}ms`);
					resolve({ stream, meta });
				});
			});
		}
	}

	_extractYTInfo(info) {
		var meta = {};

		meta.title = info.title;
		meta.uploader = info.author.name;
		meta.duration = parseInt(info.length_seconds);
		meta.thumbnail = info.thumbnail_url;
		meta.loudness = info.loudness;
		meta.ytinfo = info;

		return meta;
	}

	identifySourceType(source) {
		if(/^(http|https):\/\/[^ "]+$/.test(source)) {
			if(ytdl.validateURL(source)) {
				if(/^.*(list=)([^#\&\?]*).*/.test(source)) {
					return { name: "youtube", specific: "playlist" };
				} else {
					return { name: "youtube", specific: "video" };
				}
			} else {
				return { name: "file" };
			}
		} else {
			return "invalid";
		}
	}

	async getYTSearchResults(keyword) {
		var response = await axios.get("https://www.googleapis.com/youtube/v3/search", {
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

	async getYTPlaylistItems(listid) {
		var response = await axios.get("https://www.googleapis.com/youtube/v3/playlistItems", {
			params: {
				"part": "contentDetails",
				"maxResults": 25,
				"playlistId": listid,
				"key": config.player.ytapikey
			}
		});

		return response.data.items;
	}

	generateYTResultsEmbed(results) {
		var list = "";

		for(var i = 0; i < results.length; i++) {
			list += "`[" + (i + 1) + "]` " + `[${results[i].snippet.title}](https://youtu.be/${results[i].id.videoId})`;

			if(i != (results.length - 1)) {
				list += "\n";
			}
		}

		return {
			"title": "YouTube Search Results",
			"description": "*Click on the corresponding number reaction to select a video*" + "\n\n" + list,
			"color": 4886754
		};
	}

	generateQueueEmbed(page) {
		var queue = "";
		var totaltime = 0;

		if(!page) {
			page = 1;
		} else {
			page = Math.min(Math.max(page, 1), Math.ceil(this.queue.length / 5));
		}

		if(this.current && page == 1) {
			queue += `\`[NOW PLAYING]\` __**[${this.current.meta.title}](${this.current.source})**__` + "\n" + "Requester: `" + this.current.requester.username + "`\n" + "Duration: `" + this.secondsToTimestamp(this.current.meta.duration) + "`";
		}

		var start = (page - 1) * 5;

		for(var i = start; i < this.queue.length; i++) {
			if(i >= start && i < (start + 5)) {
				queue += (queue ? "\n\n" : "") + `\`[${i + 1}]\` __**[${this.queue[i].meta.title}](${this.queue[i].source})**__` + "\n" + "Requester: `" + this.queue[i].requester.username + "`\n" + "Duration: `" + this.secondsToTimestamp(this.queue[i].meta.duration) + "`";
			}

			if(this.queue[i].meta.duration) {
				totaltime += this.queue[i].meta.duration;
			}
		}

		if(this.queue.length > (start + 5)) {
			queue += `\n\n***+${this.queue.length - (start + 5)} more queue items***`;
		}

		return {
			"title": "Player Queue",
			"description": `**Queue Length:** \`${this.queue.length}\`\n**Total Time:** \`${this.secondsToTimestamp(totaltime)}\`\n\n${queue}`,
			"color": 4886754,
			"footer": {
				"text": `Page #${Math.ceil((start + 1) / 5)} of ${Math.max(1, Math.ceil(this.queue.length / 5))}`
			}
		};
	}

	generateNowPlayingEmbed() {
		var numpercent = Math.floor(((this.dispatcher.time / 1000) / this.current.meta.duration) * 25);
		console.log("numpercent: " + numpercent);
		var progress = "[" + "=".repeat(numpercent) + "#" + "=".repeat(Math.max(0, 25 - numpercent)) + "] | " + Math.floor(((this.dispatcher.time / 1000) / this.current.meta.duration) * 100) + "%";

		return {
			"title": "Now Playing",
			"description": `[${this.current.meta.title}](${this.current.source})`,
			"color": 4886754,
			"thumbnail": {
				"url": this.current.meta.thumbnail
			},
			"footer": {
				"text": progress
			},
			"fields": [
				{
					"name": "Length / Elapsed",
					"value": "`" + this.secondsToTimestamp(this.current.meta.duration) + "` / `" + this.secondsToTimestamp(this.dispatcher.time / 1000) + "`"
				},
				{
					"name": "Requested By",
					"value": "`" + this.current.requester.username + "`"
				}
			]
		};
	}

	generateEnqueuedEmbed(item) {
		var position = this.queue.indexOf(item);
		var eta = 0;

		if(!this.current) {
			eta = "NOW";
		} else {
			eta += this.current.meta.duration - (this.dispatcher.time / 1000);

			for(var i = 0; i < position; i++) {
				eta += this.queue[i].meta.duration;
			}

			eta = this.secondsToTimestamp(eta);
		}

		return {
			"title": "Added to Queue",
			"description": `[${item.meta.title}](${item.source})`,
			"color": 4886754,
			"thumbnail": {
				"url": item.meta.thumbnail
			},
			"fields": [
				{
					"name": "Length",
					"value": "`" + this.secondsToTimestamp(item.meta.duration) + "`"
				},
				{
					"name": "Position / ETA",
					"value": `\`${position + 1}\` / \`${eta}\``
				}
			]
		};
	}

	updateNowPlayingEmbed(current, message) {
		if(!this.isActive() || this.current !== current) {
			return;
		}

		message.edit("", { embed: this.generateNowPlayingEmbed() });

		setTimeout(() => {
			this.updateNowPlayingEmbed(current, message);
		}, 5000);
	}
}