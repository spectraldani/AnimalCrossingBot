import {IIsland} from "./types";
import {Bot, Command} from "./telegram";
import * as fs from "fs";
import * as moment from "moment-timezone";
import {build_export_table} from "./order_types";
import {orders as turnip_orders} from "./turnips";
import {orders as island_orders} from "./island_orders";


const orders: Record<string, any> = {};
orders.as = async function (order_arguments: string[], island: IIsland, command: Command, database: any) {
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

    return await handle_command(command, database, false);
};
orders.as.alias = ['como'];
orders.as.can_mut = true; // hack to avoid '/as x /as x ...'
orders.as.help = [
    'Run command as if you were in another island'
];


const order_lists = [
    orders,
    island_orders,
    turnip_orders,
];

const all_orders = order_lists.flatMap(build_export_table) as any[];

function find_island_by_name(name: string, islands: { [id: string]: IIsland; }) {
    name = name.toLowerCase();
    for (const [id, island] of Object.entries(islands)) {
        if (island.name.toLowerCase() === name) {
            return [id, island];
        }
    }
    return [null, null];
}

async function handle_command(command: Command, database: any, can_mut: boolean) {
    let [order_key, order_arguments] = command.order;
    let island = database.islands[command.from.id];

    for (const order_list of all_orders) {
        const order = order_list[order_key];
        if (order !== undefined) {
            if (!can_mut && order.mut) {
                return 'No permission to run that command';
            } else {
                return await order(order_arguments, island, command, database);
            }
        }
    }

    return null;
}


const database = JSON.parse(fs.readFileSync('data.json', 'utf8'));
if (!database.bot_token && !database.chat_id) {
    throw "Missing bot_token or chat_id in database";
}
const bot = new Bot(database.bot_token);

moment.defineLocale('ac', {
    parentLocale: 'en',
    week: {doy: 3, dow: 0}
});
moment.locale('ac');

(async () => {
    const bot_commands = {
        commands: order_lists
            .flatMap(x => Object.entries(x) as [string, any][])
            .map(([k, v]) => ({command: k, description: v.help[0]}))
    };
    const response = await bot.post('setMyCommands', bot_commands);
    console.log('Sent commands!', await response);
})().catch(console.error);

(async () => {
    for await (const command of bot.stream_commands()) {
        if (command.chat.id == database['chat_id'] || command.chat.id in database['islands']) {
            let response;
            try {
                response = await handle_command(command, database, true);
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
