// import Discord from "discord.js";
// import fs from "fs";
// import pcm from "pcm-util";
// import speech from "@google-cloud/speech";
// import { Readable } from "stream";
// import { Detector, Models } from "snowboy";
// import Utils from "../utils";
// import { Instance, Instances } from "../instances";
// import config from "../../config.json";

// class Silence extends Readable {
// 	_read() {
// 		this.push(SILENCE_FRAME);
// 		this.destroy();
// 	}
// }

// const speechclient = new speech.SpeechClient({
// 	keyFilename: "res/googlecloud.json"
// });

// const MIN_DETECTION_VOLUME = -65.0;
// const SILENCE_FRAME = Buffer.from([0xF8, 0xFF, 0xFE]);

// export default class SpeechInstance extends Instance {
//     private decoder;
//     private connection: Discord.VoiceConnection;
//     private detector: Detector;
//     private models: Models;

//     private processing: boolean;
//     private processQueue: [];

// 	constructor(guild: Discord.Guild) {
//         super(guild);
        
//         this.processing = false;
//         this.processQueue = [];
// 	}

// 	instantiate(instances: Instances) {
//         this.instances = instances;
//         this.loadModels();
// 	}

// 	loadModels(): void {
// 		this.models = new Models();
//         this.models.add({
//             file: "res/jarvis.pmdl",
//             sensitivity: "0.5",
//             hotwords: "alexa"
//         });

//         Utils.log("SPEECH", "[" + this.guild.nameAcronym + "] Loaded models");
// 	}

// 	instantiateDetector(): void {
// 		this.detector = new Detector({
//             resource: "res/common.res",
//             models: this.models,
//             audioGain: 2.0,
//             applyFrontend: true
//         });

//         Utils.log("SPEECH", "[" + this.guild.nameAcronym + "] Instantiated detector");
// 	}

// 	detachConnection(): void {
// 		this.connection = null;
// 		Utils.log("SPEECH", "[" + this.guild.nameAcronym + "] Detached connection");
// 	}

// 	attachConnection(connection: Discord.VoiceConnection) {
// 		this.connection = connection;
// 		this.connection.play(new Silence(), { type: "opus" });
// 		this.connection.on("speaking", (user: Discord.User, speaking: Discord.Speaking) => {
// 			if (speaking.bitfield === 1) {
// 				this.harvestVoiceStream(user);
// 			}
// 		});

// 		Utils.log("SPEECH", "[" + this.guild.nameAcronym + "] Attached connection");
// 	}

// 	harvestVoiceStream(user: Discord.User) {
// 		this.instantiateDetector();
// 		Utils.log("SPEECH", "Listening to voice data from [" + user.username + "]");
        
// 		let stream = this.connection.receiver.createStream(user, {
//             mode: "pcm",
//             end: "silence"
//         });

// 		this.detector.on("silence", function() {
//             //Utils.log("SPEECH", "Silence");
//         });

//         this.detector.on("sound", function(buffer) {
//             //Utils.log("SPEECH", "Sound");
//         });

//         this.detector.on("hotword", function(index, hotword, buffer) {
//             Utils.log("SPEECH", "Hotword");
//             console.log(index, hotword);
// 		});
		
// 		let writeStream = fs.createWriteStream("res/test.pcm");
// 		stream.pipe(writeStream);

//         //stream.pipe(this.detector);
// 	}

// 	/*addToProcessQueue(item) {
// 		this.processQueue.push(item);
// 		this.processNextQueue();
// 	}

// 	processNextQueue() {
// 		if(this.processing || this.processQueue.length < 1) {
// 			return;
// 		}

// 		let item = this.processQueue.shift();
// 		this.processQueueItem(item);
// 	}

// 	processQueueItem(item) {
// 		console.log("PROCESSING QUEUE DATA ITEM");
// 		this.processing = true;
// 		this.processTranscript(this.transcribeVoiceData(item.data), item.user);
// 		this.processing = false;
// 		this.processNextQueue();
// 	}

// 	getAverageVolume(pcmData) {
// 		let sum = 0;
// 		for (let i = 0; i < pcmData.length; i += 2) {
// 			let sample = pcmData.readInt16LE(i) / 32678;
// 			sum += (sample * sample);
// 		}
// 		let rms = Math.sqrt(sum / (pcmData.length / 2));
// 		return Math.log(rms);
// 	}

// 	async transcribeVoiceData(pcmData) {
// 		let audioBytes = pcmData.toString("base64");

// 		let request = {
// 			audio: {
// 				content: audioBytes,
// 			},
// 			config: {
// 				encoding: "LINEAR16",
// 				sampleRateHertz: this.detector.sampleRate,
// 				languageCode: "en-US"
// 			},
// 		};

// 		let result = await speechclient.recognize(request);
// 		let transcription = response[0].results.map(result => result.alternatives[0].transcript).join('\n');
		
// 		console.log(`TRANSCRIBED RESULT = : ${transcription}`);
// 		return transcription.split(' ');
// 	}

// 	processTranscript(transcript, user) {
// 		if(typeof transcript != Array || transcript.length < 2) {
// 			console.log("Transcript is too short to be processed as a command");
// 			return;
// 		}

// 		let command = transcript[1];
// 		let params = transcript.slice(2);

// 		console.log("COMMAND = " + command);
// 		console.log("PARAMS = " + params);
// 		console.log("SPEAKER = " + user.displayName);
// 	}*/
// }
