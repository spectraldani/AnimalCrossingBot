import * as fs from 'fs';
import moment from 'moment-timezone';
import {orders as turnip_orders} from './turnips';
import {orders as island_orders} from './island_orders';
import {orders as administrative_orders} from './administrative_orders';
import {Order, OrderList} from './orders';
import Bot from "./telegram/Bot";
import {orders as catalog_orders} from './catalog';


const all_orders = OrderList.merge(
    administrative_orders,
    island_orders,
    turnip_orders,
    catalog_orders
);


// noinspection JSUnusedGlobalSymbols
const file_database = {
    database: JSON.parse(fs.readFileSync('data.json', 'utf8')),
    flush() {
        fs.writeFileSync('data.json', JSON.stringify(this.database), {encoding: 'utf-8'});
    },
    put(collection: string, id: string, obj: any): Promise<void> {
        this.database[collection][id] = obj;
        this.flush()
        return Promise.resolve();
    },
    get<T>(collection: string, id: string): Promise<T> {
        return Promise.resolve(this.database[collection][id]);
    },
    get_all<T>(collection: string): Promise<{ [id: string]: T }> {
        return Promise.resolve(this.database[collection]);
    }
}

const bot_token: Promise<string> = (async () => (await file_database.get<{ token: string }>('BotData', 'agent_s')).token)();


moment.defineLocale('ac', {
    parentLocale: 'en',
    week: {doy: 3, dow: 0}
});
moment.locale('ac');

(async () => {
    const bot = new Bot(await bot_token, all_orders, file_database);
    const bot_commands = {
        commands: all_orders.orders.map((c: Order) => ({
            command: c.name,
            description: c.help?.[0] ?? 'No description.'
        }))
    };
    const response = await bot.post('setMyCommands', bot_commands);
    console.log('Sent commands!', await response);

    await bot.process_updates();
})().catch(console.error);
