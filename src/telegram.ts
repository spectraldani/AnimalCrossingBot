import https = require('https');
import moment = require('moment-timezone');

const base_url = 'https://api.telegram.org/bot';

export interface Command {
    chat: any,
    from: any,
    message_id: number,
    date: moment.Moment,
    order: [string, string[]]
}

export interface TelegramReply {
    ok: boolean,
    result: any
}

export class Bot {
    readonly bot_url: string;
    last_id: number = 0;

    constructor(bot_token: string) {
        this.bot_url = base_url + bot_token;
        this.last_id = 0;
    }

    send_message(
        chat_id: string,
        text: string,
        reply_to_message_id: number,
        disable_notification?: boolean,
    ): Promise<TelegramReply> {
        const body: any = {
            chat_id: chat_id,
            text: text,
            parse_mode: 'markdown'
        };

        if (reply_to_message_id !== undefined) {
            body['reply_to_message_id'] = reply_to_message_id;
        }

        if (disable_notification === true) {
            body['disable_notification'] = true;
        }

        return this.post('sendMessage', body) as Promise<TelegramReply>;
    }

    reply(msg: any, text: string): Promise<TelegramReply> {
        return this.send_message(msg.chat.id, text, msg.message_id);
    }

    fetch_updates(): Promise<TelegramReply> {
        const options = {
            timeout: 10000
        };

        return this.get(`getUpdates?offset=${this.last_id + 1}&timeout=10`, options);
    }

    async* stream_updates() {
        while (true) {
            const updates = await this.fetch_updates();
            if (updates.ok && updates.result.length > 0) {
                const result = updates.result;
                yield* result;
                this.last_id = result[result.length - 1].update_id;
            } else if (!updates.ok) {
                throw updates;
            }
        }
    }

    async* stream_commands(): AsyncGenerator<Command> {
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

    post(url: string, body: any): Promise<TelegramReply> {
        const json_body = JSON.stringify(body);
        const options = {
            method: 'POST',
            headers: {
                'Accept': "application/json",
                "Content-Type": "application/json; charset=utf-8",
                // 'Content-Length': Buffer.byteLength(json_body)
            }
        };

        return new Promise((resolve, reject) => {
            const req = https.request(`${this.bot_url}/${url}`, options, r => {
                r.setEncoding('utf8');
                let rawData = '';
                r.on('data', chunk => {
                    rawData += chunk;
                });
                r.on('end', () => {
                    if (r.statusCode !== 200) {
                        reject([url, r.statusCode, rawData, json_body]);
                    }
                    try {
                        resolve(JSON.parse(rawData));
                    } catch (e) {
                        reject(e);
                    }
                });
            });
            req.on('error', reject);
            req.write(json_body);
            req.end();
        });
    }

    get(url: string, options?: https.RequestOptions): Promise<TelegramReply> {
        return new Promise((resolve, reject) => {
            https.get(`${this.bot_url}/${url}`, options || {}, r => {
                r.setEncoding('utf8');
                let rawData = '';
                r.on('data', chunk => {
                    rawData += chunk;
                });
                r.on('end', () => {
                    if (r.statusCode !== 200) {
                        reject([url, r.statusCode, rawData]);
                    }
                    try {
                        resolve(JSON.parse(rawData));
                    } catch (e) {
                        reject(e);
                    }
                });
            }).on('error', reject);
        });
    }
}


function parse_order(x: string): [string, string[]] | null {
    if (!x) {
        return null;
    }
    const parts = x.split(' ');
    const order_arguments: string[] = [];

    let raw_order = parts[0].split('@');
    if (raw_order.length == 2 && raw_order[1] != 'DaniSentretBot') return null;
    if (raw_order[0][0] != '/') return null;
    let command = raw_order[0].slice(1);

    let mode = 'scanning';
    let memory = '';
    let quoted = '';
    for (const part of parts.slice(1)) {
        switch (mode) {
            case 'scanning': {
                if (part[0] == "'" || part[0] == '"') {
                    quoted = part.slice(1);
                    memory = part[0];
                    mode = 'quoting';
                    break;
                } else {
                    order_arguments.push(part);
                    break;
                }
            }
            case 'quoting': {
                quoted += ' ';
                if (part[part.length - 1] == memory) {
                    quoted += part.slice(0, -1);
                    order_arguments.push(quoted);
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

    return [command, order_arguments]
}
