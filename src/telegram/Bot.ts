import {InlineKeyboardButton, Message, MethodArguments, ResultSuccess, Update} from "./api_types";
import moment from "moment-timezone";
import https from "https";
import {nanoid} from "nanoid/async";
import {BotActions, MessageButton} from "./BotActions";
import {Database, OrderList} from "../orders";
import {ChannelObject} from '@nodeguy/channel';
import {CallbackCommand, Command} from "./user_commands";

const base_url = 'https://api.telegram.org/bot';

export default class Bot {
    readonly root_orders: OrderList;
    readonly bot_url: string;
    readonly database: Database;
    last_id: number = 0;
    callback_memory: Record<number, CallbackMemoryCell | undefined>;

    constructor(bot_token: string, root_orders: OrderList, database: Database) {
        this.bot_url = base_url + bot_token;
        this.root_orders = root_orders;
        this.database = database;
        this.last_id = 0;
        this.callback_memory = {};
    }

    async send_message(action: BotActions.SendMessage): Promise<ResultSuccess<Message>> {
        const body: MethodArguments.SendMessage = {
            chat_id: action.chat_id,
            disable_notification: action.disable_notification,
            disable_web_page_preview: action.disable_web_page_preview,
            parse_mode: action.parse_mode,
            reply_to_message_id: action.reply_id,
            text: action.text
        }
        return await this.post('sendMessage', body);
    }

    async send_choices(action: BotActions.SendChoices): Promise<ResultSuccess<Message>> {
        const body: MethodArguments.SendMessage = {
            chat_id: action.chat_id,
            disable_notification: action.disable_notification,
            disable_web_page_preview: action.disable_web_page_preview,
            parse_mode: action.parse_mode,
            reply_to_message_id: action.reply_id,
            text: action.text
        }

        const [data_map, buttons] = await convert_choices(action.choices.buttons);
        body.reply_markup = {inline_keyboard: buttons};

        const result = await this.post('sendMessage', body);
        if (result.ok) {
            this.callback_memory[result.result.message_id] = {channel: action.choices.channel, data_map}
            return result;
        } else {
            throw result;
        }
    }

    async answer_callback_query(action: BotActions.AnswerCallbackQuery): Promise<ResultSuccess<boolean>> {
        const body: MethodArguments.AnswerCallbackQuery = {
            callback_query_id: action.query_id,
            text: action.text,
            show_alert: action.show_alert
        }
        return await this.post('answerCallbackQuery', body);
    }

    async edit_message(action: BotActions.EditMessage): Promise<ResultSuccess<Message>> {
        const body: MethodArguments.EditMessageText = {
            chat_id: action.chat_id,
            disable_web_page_preview: action.disable_web_page_preview,
            message_id: action.message_id,
            parse_mode: action.parse_mode,
            text: action.text,
            reply_markup: {inline_keyboard: [[]]}
        }

        if (action.choices === undefined) {
            delete this.callback_memory[action.message_id];
        } else {
            const [data_map, buttons] = await convert_choices(action.choices.buttons);
            body.reply_markup = {inline_keyboard: buttons};
            this.callback_memory[action.message_id] = {data_map, channel: action.choices.channel}
        }

        return await this.post('editMessageText', body);
    }

    async edit_choices(action: BotActions.EditChoices): Promise<ResultSuccess<Message>> {
        const body: MethodArguments.EditMessageReplyMarkup = {
            chat_id: action.chat_id,
            message_id: action.message_id,
            reply_markup: {inline_keyboard: [[]]}
        }

        if (action.choices !== undefined) {
            const callback_memory = this.callback_memory[action.message_id]!;
            const [data_map, buttons] = await convert_choices(action.choices.buttons);
            body.reply_markup = {inline_keyboard: buttons};
            callback_memory.data_map = data_map;
            callback_memory.channel = action.choices.channel;
        } else {
            delete this.callback_memory[action.message_id];
        }
        return await this.post('editMessageReplyMarkup', body);
    }

    async process_updates(): Promise<void> {
        for await (const update of this.stream_updates()) {
            if ('message' in update && update.message.text !== undefined && update.message.from !== undefined) {
                const order = parse_order(update.message.text);
                if (order !== null) {
                    const command: Command = {
                        kind: 'command',
                        chat: update.message.chat,
                        from: update.message.from,
                        message_id: update.message.message_id,
                        date: moment.unix(update.message.date).utc(),
                        order
                    };
                    this.root_orders.executeCommand(command, this, this.database, true)
                        .catch(e => {
                            console.error('command error:', command, e);
                        })
                        .finally(async () => {
                            const memory = this.callback_memory[update.message.message_id];
                            if (memory !== undefined) {
                                memory.channel.close().catch(function () {
                                });
                                delete this.callback_memory[update.message.message_id];
                            }
                        });
                }
            } else if ('callback_query' in update && update.callback_query.message !== undefined) {
                const memory = this.callback_memory[update.callback_query.message.message_id];
                if (memory !== undefined) {
                    const {channel, data_map} = memory;
                    if (update.callback_query.data === undefined) {
                        throw new Error('Invalid callback query');
                    }
                    const data = data_map[update.callback_query.data];
                    if (data === undefined) {
                        await this.answer_callback_query({
                            query_id: update.callback_query.id,
                            show_alert: true,
                            text: "Sorry but this action is expired"

                        });
                    } else {
                        await channel.push({
                            kind: 'callback_command',
                            from: update.callback_query.from,
                            chat: update.callback_query.message.chat,
                            message_id: update.callback_query.message.message_id,
                            callback_query_id: update.callback_query.id,
                            data
                        });
                    }
                } else {
                    const result = await this.answer_callback_query({
                        query_id: update.callback_query.id,
                        show_alert: true,
                        text: "Sorry but this action is expired"

                    })
                    if (result.ok) {
                        await this.edit_choices({
                            chat_id: update.callback_query.message.chat.id,
                            message_id: update.callback_query.message.message_id
                        });
                    }
                }
            }
        }
    }

    get(url: string, options?: https.RequestOptions): Promise<ResultSuccess<any>> {
        return new Promise((resolve, reject) => {
            https.get(`${this.bot_url}/${url}`, options || {}, r => {
                r.setEncoding('utf8');
                let rawData = '';
                r.on('data', chunk => {
                    rawData += chunk;
                });
                r.on('end', () => {
                    if (r.statusCode && r.statusCode > 500) {
                        reject([url, r.statusCode, rawData]);
                    }
                    try {
                        const result = JSON.parse(rawData);
                        if (result.ok) {
                            resolve(result)
                        } else {
                            reject(result);
                        }
                    } catch (e) {
                        reject(e);
                    }
                });
            }).on('error', reject);
        });
    }

    post(url: string, body: any): Promise<ResultSuccess<any>> {
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
                    if (r.statusCode && r.statusCode > 500) {
                        reject([url, r.statusCode, rawData, json_body]);
                    }
                    try {
                        const result = JSON.parse(rawData);
                        if (result.ok) {
                            resolve(result)
                        } else {
                            reject(result);
                        }
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

    private async* stream_updates(): AsyncGenerator<Update> {
        const timeout = 10;
        const options = {timeout: timeout * 1000};
        while (true) {
            const updates = await this.get(`getUpdates?offset=${this.last_id + 1}&timeout=${timeout}`, options);
            if (updates.ok && updates.result.length > 0) {
                const result = updates.result;
                yield* result;
                this.last_id = result[result.length - 1].update_id;
            } else if (!updates.ok) {
                throw updates;
            }
        }
    }
}

interface CallbackMemoryCell {
    channel: ChannelObject<CallbackCommand<any>>
    data_map: Record<string, any>
}

function parse_order(x: string): [string, string[]] | null {
    if (!x) {
        return null;
    }
    const parts = x.split(' ');
    const order_arguments: string[] = [];

    let raw_order = parts[0].split('@');
    if (raw_order.length == 2 && raw_order[1] != 'agent_s_bot') return null;
    if (raw_order[0][0] != '/') return null;
    let command = raw_order[0].slice(1);

    let mode = 'scanning';
    let memory = '';
    let quoted = '';
    for (const part of parts.slice(1)) {
        switch (mode) {
            case 'scanning': {
                if (part[0] == '"') {
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

async function convert_choices(choices: MessageButton[][]): Promise<[Record<string, any>, InlineKeyboardButton[][]]> {
    const buttons = [];
    const data_map: Record<string, any> = {};
    for (const choice_row of choices) {
        const button_row = [];
        for (const choice of choice_row) {
            const callback_data = await nanoid(12);
            data_map[callback_data] = choice.data;
            button_row.push({text: choice.text, callback_data});
        }
        buttons.push(button_row)
    }
    return [data_map, buttons];
}
