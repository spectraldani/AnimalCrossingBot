import {Bot} from "./telegram";
import * as fs from "fs";
import * as moment from "moment-timezone";
import {orders as turnip_orders} from "./turnips";
import {orders as island_orders} from "./island_orders";
import {orders as catalog_orders} from "./catalog";
import {Order, OrderList} from "./orders";
import {orders as administrative_orders} from "./administrative_orders";


const all_orders = OrderList.merge(
    administrative_orders,
    island_orders,
    turnip_orders,
);

const database = JSON.parse(fs.readFileSync('data.json', 'utf8'));
if (!database.bot_token && !database.chat_id) {
    throw "Missing bot_token or chat_id in database";
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

(async () => {
    for await (const command of bot.stream_commands()) {
        if (command.chat.id == database['chat_id'] || command.chat.id in database['islands']) {
            let response;
            try {
                response = await all_orders.executeCommand(command, {database, local_memory, bot, all_orders}, true);
            } catch (e) {
                console.error(e, command);
                response = 'Error:```\n' + JSON.stringify(e, Object.getOwnPropertyNames(e)) + '```';
            }
            if (response !== null) {
                const status = await bot.reply(command, response);
                if (!status.ok) {
                    console.error('Failed:', status.result);
                }
            } else {
                console.warn('null reply', command)
            }
        }
        fs.writeFileSync('data.json', JSON.stringify(database));
    }
})().catch(console.error);
