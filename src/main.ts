import {IIsland} from "./types";
import {Bot} from "./telegram";
import * as fs from "fs";
import * as moment from "moment-timezone";
import {orders as turnip_orders} from "./turnips";
import {orders as island_orders} from "./island_orders";
import {orders as catalog_orders} from "./catalog";
import {Order, OrderList} from "./orders";


const orders = new OrderList();

orders.push({
    name: 'as',
    alias: ['como'],
    mut: true,
    async action(order_arguments, island, command, island_memory, global_data) {
        if (order_arguments.length < 2) {
            return `Invalid number of arguments`;
        }

        let [island_name, order_key, ...next_order_arguments] = order_arguments;
        const [user_id] = find_island_by_name(island_name, database.islands);

        if (user_id === null) {
            return `Unknown island \`${island_name}\``;
        }

        command.from = {id: user_id};
        command.order = [order_key, next_order_arguments];

        return await all_orders.executeCommand(command, global_data, false);
    },
    help: ['Run command as if you were in another island'],
});

const all_orders = OrderList.merge(
    orders,
    island_orders,
    turnip_orders,
);

function find_island_by_name(name: string, islands: { [id: string]: IIsland; }) {
    name = name.toLowerCase();
    for (const [id, island] of Object.entries(islands)) {
        if (island.name.toLowerCase() === name) {
            return [id, island];
        }
    }
    return [null, null];
}


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
                response = await all_orders.executeCommand(command, {database, memory: local_memory, bot}, true);
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
