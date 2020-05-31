import {InlineKeyboardButton, MethodArguments, Result, Update} from "./api_types";
import moment from "moment-timezone";
import https from "https";
import {nanoid} from "nanoid/async";
import {BotAction, BotActions, CallbackCommand, ChoiceCallback, Command} from "./index";
import MessageChoice = BotActions.MessageChoice;

const base_url = 'https://api.telegram.org/bot';

export class Bot {
    readonly bot_url: string;
    last_id: number = 0;
    callback_memory: Record<number, CallbackMemoryCell | undefined>;

    constructor(bot_token: string) {
        this.bot_url = base_url + bot_token;
        this.last_id = 0;
        this.callback_memory = {};
    }

    post(url: string, body: any): Promise<Result<any>> {
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

    get(url: string, options?: https.RequestOptions): Promise<Result<any>> {
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
                        resolve(JSON.parse(rawData));
                    } catch (e) {
                        reject(e);
                    }
                });
            }).on('error', reject);
        });
    }

    async* stream_updates(): AsyncGenerator<Update> {
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

    async* stream_commands(): AsyncGenerator<Command | CallbackCommand> {
        for await (const update of this.stream_updates()) {
            if ('message' in update && update.message.text !== undefined && update.message.from !== undefined) {
                const order = parse_order(update.message.text);
                if (order !== null)
                    yield {
                        kind: 'command',
                        chat: update.message.chat,
                        from: update.message.from,
                        message_id: update.message.message_id,
                        date: moment.unix(update.message.date).utc(),
                        order
                    };
            } else if ('callback_query' in update && update.callback_query.message !== undefined) {
                const memory = this.callback_memory[update.callback_query.message.message_id];
                if (memory !== undefined) {
                    const {callback, data_map} = memory;
                    let data: any | undefined;
                    if (data_map !== undefined && update.callback_query.data !== undefined) {
                        data = data_map[update.callback_query.data];
                    } else {
                        data = undefined;
                    }
                    const command: CallbackCommand = {
                        kind: 'callback_command',
                        from: update.callback_query.from,
                        chat: update.callback_query.message.chat,
                        message_id: update.callback_query.message.message_id,
                        callback_query_id: update.callback_query.id,
                        callback: () => callback(command, data),

                    };
                    yield command;
                } else {
                    const action: BotActions.AnswerCallbackQuery = {
                        kind: "answer_callback_query",
                        query_id: update.callback_query.id,
                        show_alert: true,
                        text: "Sorry but this action is expired"

                    }
                    const result = await this.process_action(action);
                    if (result.ok) {
                        const removeOptions: BotActions.EditChoices = {
                            kind: "edit_choices",
                            chat_id: update.callback_query.message.chat.id,
                            message_id: update.callback_query.message.message_id,
                            choices: []
                        }
                        await this.process_action(removeOptions);
                    }
                }
            }
        }
    }

    async process_action(action: BotAction): Promise<Result<any>> {
        switch (action.kind) {
            case "message": {
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
            case "choices": {
                const body: MethodArguments.SendMessage = {
                    chat_id: action.chat_id,
                    disable_notification: action.disable_notification,
                    disable_web_page_preview: action.disable_web_page_preview,
                    parse_mode: action.parse_mode,
                    reply_to_message_id: action.reply_id,
                    text: action.text
                }

                const [data_map, buttons] = await convert_choices(action.choices);
                body.reply_markup = {inline_keyboard: buttons};

                const result = await this.post('sendMessage', body);
                if (result.ok) {
                    this.callback_memory[result.result.message_id] = {callback: action.callback, data_map}
                }
                return result;
            }
            case "answer_callback_query": {
                const body: MethodArguments.AnswerCallbackQuery = {
                    callback_query_id: action.query_id,
                    text: action.text,
                    show_alert: action.show_alert
                }
                return await this.post('answerCallbackQuery', body);
            }
            case "edit_message": {
                const body: MethodArguments.EditMessageText = {
                    chat_id: action.chat_id,
                    disable_web_page_preview: action.disable_web_page_preview,
                    message_id: action.message_id,
                    parse_mode: action.parse_mode,
                    text: action.text,
                    reply_markup: {inline_keyboard: [[]]}
                }

                if (action.choices === undefined || action.choices.length == 0) {
                    if (action.message_id in this.callback_memory) delete this.callback_memory[action.message_id];
                } else {
                    const callback_memory = this.callback_memory[action.message_id]!;
                    const [data_map, buttons] = await convert_choices(action.choices);
                    body.reply_markup = {inline_keyboard: buttons};
                    callback_memory.data_map = data_map;
                    if (action.callback !== undefined) callback_memory.callback = action.callback;
                }

                return await this.post('editMessageText', body);
            }
            case "edit_choices": {
                const body: MethodArguments.EditMessageReplyMarkup = {
                    chat_id: action.chat_id,
                    message_id: action.message_id,
                    reply_markup: {inline_keyboard: [[]]}
                }

                if (action.choices.length == 0) {
                    delete this.callback_memory[action.message_id];
                } else {
                    const callback_memory = this.callback_memory[action.message_id]!;
                    const [data_map, buttons] = await convert_choices(action.choices);
                    body.reply_markup = {inline_keyboard: buttons};
                    callback_memory.data_map = data_map;
                    if (action.callback !== undefined) callback_memory.callback = action.callback;
                }
                return await this.post('editMessageReplyMarkup', body);
            }
        }
    }
}

interface CallbackMemoryCell {
    callback: ChoiceCallback
    data_map?: Record<string, any>
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

async function convert_choices(choices: MessageChoice[][]): Promise<[Record<string, any>, InlineKeyboardButton[][]]> {
    const buttons = [];
    const data_map: Record<string, any> = {};
    for (const choice_row of choices) {
        const button_row = [];
        for (const choice of choice_row) {
            const callback_data = await nanoid(12);
            if (choice.data !== undefined) {
                data_map[callback_data] = choice.data;
                button_row.push({text: choice.text, callback_data});
            } else {
                button_row.push({text: choice.text});
            }
        }
        buttons.push(button_row)
    }
    return [data_map, buttons];
}
