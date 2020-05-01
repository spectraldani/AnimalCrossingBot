const https = require('https');
const fetch = require('node-fetch');
const moment = require('moment-timezone');

const base_url = 'https://api.telegram.org/bot';

function message(chat_id, text, reply_to_message_id, disable_notification) {
	const body = {
		chat_id: chat_id,
		text: text,
		parse_mode: 'markdown'
	}

	if (reply_to_message_id !== undefined) {
		body['reply_to_message_id'] = reply_to_message_id;
	}

	if (disable_notification === true) {
		body['disable_notification'] = true;
	}

	const options = {
		method: 'POST',
		headers: {"Content-Type": "application/json"},
		body: JSON.stringify(body),
	};

	return fetch(`${this.bot_url}/sendMessage`, options)
}

function fetch_updates() {
	const url = `${this.bot_url}/getUpdates?offset=${this.last_id+1}&timeout=10`;
	const options = {
		timeout: 10000
	}

	return new Promise((resolve, reject) => {
		https.get(url, options, r => {
			if (r.statusCode !== 200) reject(r.statusCode);
			r.setEncoding('utf8');
			let rawData = '';
			r.on('data', chunk => { rawData += chunk; });
			r.on('end', () => {
				try {
					resolve(JSON.parse(rawData));
				} catch (e) {
					reject(e);
				}
			});
		}).on('error',reject);
	});
}

module.exports.Bot = function(bot_token) {
	this.bot_url = base_url + bot_token;
	this.last_id = 0;

	this.send_message = message.bind(this);
	this.fetch_updates = fetch_updates.bind(this);
	this.stream_updates = async function*() {
		while (true) {
			const updates = await this.fetch_updates();
			if (updates.ok && updates.result.length > 0) {
				const result = updates.result
				yield* result;
				this.last_id = result[result.length-1].update_id;
			} else if (!updates.ok) {
				throw updates;
			}
		}
	}

	this.stream_commands = async function*() {
		for await (const update of this.stream_updates()) {
			if ('message' in update) {
				const order = parse_order(update.message.text);
				if (order !== null)
					yield {
						chat: update.message.chat,
						from: update.message.from,
						message_id: update.message.message_id,
						date: moment.unix(update.message.date).utc(),
						order
					};
			}
		}
	}

	this.reply = function(msg, text) {
		return this.send_message(msg.chat.id, text, msg.message_id);
	}

	this.post = function(url, body) {
		const options = {
			method: 'POST',
			headers: {"Content-Type": "application/json"},
			body: JSON.stringify(body),
		};

		return fetch(`${this.bot_url}/${url}`, options);
	}

	this.get = function(url) {
		return fetch(`${this.bot_url}/${url}`);
	}
}


function parse_order(string) {
	if (!string) {
		return null;
	}
	const parts = string.split(' ');
	const arguments = [];

	let command = parts[0].split('@');
	if (command.length == 2 && command[1] != 'DaniSentretBot') return null;
	if (command[0][0] != '/') return null;
	command = command[0].slice(1)

	let mode = 'scanning';
	let memory;
	let quoted;
	for (const part of parts.slice(1)) {
		switch (mode) {
			case 'scanning': {
				if (part[0] == "'" || part[0] == '"') {
					quoted = part.slice(1);
					memory = part[0];
					mode = 'quoting';
					break;
				} else {
					arguments.push(part);
					break;
				}
			}
			case 'quoting': {
				quoted += ' ';
				if (part[part.length-1] == memory) {
					quoted += part.slice(0,-1)
					arguments.push(quoted);
					mode = 'scanning';
					break;
				} else {
					quoted += part;
					break;
				}
			}
		}
	}
	if (mode == 'quoting') return null;

	return [command, arguments]
}
