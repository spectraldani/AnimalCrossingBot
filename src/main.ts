import {BaseCommand, BotAction} from './telegram';
import * as fs from 'fs';
import * as moment from 'moment-timezone';
import {orders as turnip_orders} from './turnips';
import {orders as island_orders} from './island_orders';
import {orders as administrative_orders} from './administrative_orders';
import {Order, OrderList} from './orders';
import {Result} from "./telegram/api_types";
import {Bot} from "./telegram/bot";
import {orders as catalog_orders} from './catalog';


const all_orders = OrderList.merge(
    administrative_orders,
    island_orders,
    turnip_orders,
    catalog_orders
);

const database = JSON.parse(fs.readFileSync('data.json', 'utf8'));
if (!database.bot_token && !database.chat_id) {
    throw 'Missing bot_token or chat_id in database';
}
const local_memory = {};
const bot = new Bot(database.bot_token);

moment.defineLocale('ac', {
    parentLocale: 'en',
    week: {doy: 3, dow: 0}
});
moment.locale('ac');

(async () => {
    const bot_commands = {
        commands: all_orders.orders.map((c: Order) => ({
            command: c.name,
            description: c.help?.[0] ?? 'No description.'
        }))
    };
    const response = await bot.post('setMyCommands', bot_commands);
    console.log('Sent commands!', await response);
})().catch(console.error);

function uniformize_response(response: BotAction | string, command: BaseCommand): BotAction {
    if (typeof response === 'string') {
        response = {
            kind: 'message',
            chat_id: command.chat.id,
            reply_id: command.message_id,
            text: response,
            parse_mode: 'Markdown'
        };
    }
    return response;
}

(async () => {
    for await (const command of bot.stream_commands()) {
        if (command.chat.id == database['chat_id'] || command.chat.id in database['islands']) {
            let response: BotAction | string;
            let status: Result<any>;

            try {
                switch (command.kind) {
                    case 'command': {
                        response = await all_orders.executeCommand(command, {
                            database,
                            local_memory,
                            bot,
                            all_orders
                        }, true);
                        break;
                    }
                    case 'callback_command': {
                        response = await command.callback();
                        break;
                    }
                }
                response = uniformize_response(response, command);
                status = await bot.process_action(response);
            } catch (e) {
                console.error('Exception!', e, command);
                const status = await bot.process_action(uniformize_response('*Fatal failure* ☠', command))
                if (!status.ok) console.error('Failed to send error message:', status.description);
                continue;
            }
            if (!status.ok) console.error('Failed to respond to update:', response, status.description);
        }
        fs.writeFileSync('data.json', JSON.stringify(database));
    }
})().catch(e => console.error('for await error:', e));
