const fs = require("fs");
import config from "../config.json";
import Utils from "./utils";

class Collection extends Map {
	constructor() {
		super();
	}

	add(key: any, value = {}): void {
		this.set(key, value);
	}

	remove(key: any): void {
		this.delete(key);
	}

	find(key: any, value: any): any | null {
		let found = null;

		this.forEach((subCollection: any) => {
			if (subCollection.hasOwnProperty(key) && subCollection[key] === value) {
				found = subCollection[key];
				return;
			}
		});

		return found;
	}
}

export class PersistenceInstance {
	id: string;
	globals: object;
	collections: object;

	constructor(id: string, globals = {}, collections = {}) {
		this.id = id;
		this.globals = globals;
		this.collections = collections;
		
		for (const collection in this.collections) {
			if (this.collections.hasOwnProperty(collection)) {
				let oldObj = this.collections[collection];
				this.collections[collection] = new Collection();
				Object.keys(oldObj).forEach(key => {
					this.collections[collection].set(key, this.collections[collection][key]);
				});
			}
		}
	}
	
	save(): void {
		fs.writeFile(config.db.path + this.id + ".json", JSON.stringify({globals: this.globals, collections: this.collections}, null, 4), (err) => {
			if(err) { throw err; }
			Utils.log("PERSISTENCE", "[" + this.id + "] Saved guild data");
		});
	}

	global(key: string, value?: any): any {
		if (value) {
			this.globals[key] = value;
		} else {
			return this.globals[key];
		}
	}

	collection(name: string): Collection {
		if (!this.collections[name]) {
			this.collections[name] = new Collection();
		}

		return this.collections[name];
	}
}

export class Persistence {
	static instances = {};

	static use(id: string): PersistenceInstance {
		if (!this.instances[id]) {
			this.instances[id] = new PersistenceInstance(id);
		}
	
		return this.instances[id];
	}

	static load(id: string): void {
		if (fs.existsSync(config.db.path + id + ".json")) {
			let raw = fs.readFileSync(config.db.path + id + ".json");
			let parsed = JSON.parse(raw);
			this.instances[id] = new PersistenceInstance(id, parsed.globals, parsed.collections);
			Utils.log("PERSISTENCE", "[" + id + "] Loaded data");
		} else {
			this.instances[id] = new PersistenceInstance(id);
			Utils.log("PERSISTENCE", "[" + id + "] Created data");
			this.use(id).save();
		}
	}

	static saveAll(): void {
		for (const id in this.instances) {
			if (!this.instances.hasOwnProperty(id)) {
				continue;
			}

			this.use(id).save();
		}
	}
}
