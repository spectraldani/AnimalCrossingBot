import {PATTERN, TurnipPredictor} from "./turnips/predictor";
import {FRUITS, IIsland, is_turnip_data_current, Island} from "./types";
import {Moment} from "moment-timezone/moment-timezone";
import {Database, OrderList} from "./orders";
import {User} from "./telegram/api_types";

const fruit_emoji = {
    [FRUITS.APPLE]: '🍎',
    [FRUITS.CHERRY]: '🍒',
    [FRUITS.ORANGE]: '🍊',
    [FRUITS.PEACH]: '🍑',
    [FRUITS.PEAR]: '🍐',
};

function format_islands(island_array: IIsland[], date: Moment) {
    let message = '';

    if (island_array.length == 0) {
        return 'No islands matching your query';
    }

    island_array.sort((a, b) => a.name.localeCompare(b.name));
    island_array.sort((a, b) => a.native_fruit - b.native_fruit);
    island_array.sort((a, b) => +b.open - +a.open);

    let start_open = island_array[0].open;
    if (island_array[0].open) {
        message += '\\[Open]\n';
    } else {
        message += '\\[Closed]\n';
    }

    for (const island of island_array) {
        const island_date = date.tz(island.timezone);
        if (start_open && !island.open) {
            message += '\\[Closed]\n';
            start_open = false;
        }

        message += `*${island.name}* ${fruit_emoji[island.native_fruit]}`;
        message += ' ';

        const island_hour = island_date.hour();
        if (island_hour < 5) {
            message += '\\[💤]';
        } else if (island_hour < 12) {
            message += `\\[AM]`;
        } else if (island_hour < 21) {
            message += `\\[PM]`;
        } else {
            message += '\\[💤]';
        }
        message += '\n';

        if (island.turnips !== undefined && is_turnip_data_current(island, date)) {
            const [weekday, ampm] = island_date.format('d A').split(' ');
            const index = 2 * (+weekday) + (ampm === 'AM' ? 0 : 1);
            const current_price = island.turnips.prices[index];
            const predictor = new TurnipPredictor(island.turnips);
            let predictedPatterns = predictor.predict_pattern();
            if (predictedPatterns === null) {
                message += '❌ Invalid ❌';
            } else {
                const pattern = predictedPatterns.findIndex(x => x >= 0.99984);
                message += 'Tnp:';
                if (current_price !== null && !isNaN(current_price)) {
                    message += ` ${current_price}`;
                } else {
                    const predicted_current_price = predictor.predict_all()![0].prices[index];
                    message += ` [${predicted_current_price.min}-${predicted_current_price.max}]`;
                }
                switch (pattern) {
                    case PATTERN.FLUCTUATING: {
                        message += ' ➡️';
                        break;
                    }
                    case PATTERN.DECREASING: {
                        message += ' ↘️';
                        break;
                    }
                    case PATTERN.SMALL_SPIKE: {
                        message += ' ↗️';
                        break;
                    }
                    case PATTERN.LARGE_SPIKE: {
                        message += ' ⬆️';
                        break;
                    }
                }
            }
            message += '\n';
        }
        if (island.dodo) {
            message += `✈ ${island.dodo}\n`;
        }

        if (island.username) {
            message += `${island.username}\n`;
        }

        message += '\n';
    }
    return message
}

export const orders = new OrderList();

orders.push({
    name: 'register',
    alias: ['registrar'],
    mut: true,
    async action(bot, order_arguments, command, database) {
        let [name, raw_fruit, timezone] = order_arguments;
        let fruit: FRUITS | undefined = (FRUITS as any)[raw_fruit.toUpperCase()];

        if (fruit === undefined) {
            await bot.send_message({
                chat_id: command.chat.id,
                reply_id: command.message_id,
                text: `Invalid fruit \`${order_arguments[1]}\``
            });
            return;
        }

        const id = command.from.id;
        const username = command.from.username ?? command.from.first_name;

        await set_island(database, command.from, new Island(id, username, name, fruit, timezone));
        await bot.send_message({
            chat_id: command.chat.id,
            reply_id: command.message_id,
            text: `Registered ${name}!`
        });
    },
    help: ['Register your island in our registry'],
});

orders.push({
    name: 'list',
    alias: ['ilhas', 'listar'],
    async action(bot, order_arguments, command, database) {
        const island_array = Object.values(await database.get_all<IIsland>('Island')).slice(0) as IIsland[];
        if (order_arguments.length === 0) {
            await bot.send_message({
                chat_id: command.chat.id,
                reply_id: command.message_id,
                text: format_islands(island_array, command.date),
                parse_mode: 'Markdown'
            });
        } else switch (order_arguments[0].toLowerCase()) {
            case 'aberto':
            case 'open': {
                await bot.send_message({
                    chat_id: command.chat.id,
                    reply_id: command.message_id,
                    text: format_islands(island_array.filter(x => x.open), command.date),
                    parse_mode: 'Markdown'
                });
                break;
            }
            default:
                await bot.send_message({
                    chat_id: command.chat.id,
                    reply_id: command.message_id,
                    text: 'Unknown argument'
                });
        }
    },
    help: ['Lists all registered islands'],
});

orders.push({
    name: 'me',
    alias: ['eu', 'my_island', 'minha_ilha'],
    async action(bot, order_arguments, command, database) {
        const island = await get_island(database, command.from);
        await bot.send_message({
            chat_id: command.chat.id,
            reply_id: command.message_id,
            text: format_islands([island], command.date),
            parse_mode: 'Markdown'
        });
    },
    help: ['Shows current information about your island'],
});

orders.push({
    name: 'open',
    alias: ['abrir', 'dodo'],
    mut: true,
    async action(bot, order_arguments, command, database) {
        const island = await get_island(database, command.from);
        island['open'] = true;
        if (order_arguments.length == 1) {
            island['dodo'] = order_arguments[0];
        }
        await set_island(database, command.from, island);
        await bot.send_message({
            chat_id: command.chat.id,
            reply_id: command.message_id,
            text: `Opened ${island.name}`
        });
    },
    help: ['Register your island as currently open'],
});

orders.push({
    name: 'close',
    alias: ['fechar'],
    mut: true,
    async action(bot, order_arguments, command, database) {
        const island = await get_island(database, command.from);
        island['open'] = false;
        island['dodo'] = null;
        await set_island(database, command.from, island);
        await bot.send_message({
            chat_id: command.chat.id,
            reply_id: command.message_id,
            text: `Closed ${island.name}`
        });
    },
    help: ['Register your island as currently closed'],
});

export function get_island(database: Database, user: User): Promise<IIsland> {
    return database.get('Island', String(user.id));
}

export function set_island(database: Database, user: User, island: IIsland): Promise<void> {
    return database.put('Island', String(user.id), island);
}
