import {PATTERN, TurnipPredictor} from "./turnips/predictor";
import {FRUITS, IIsland, is_turnip_data_current, Island} from "./types";
import {Moment} from "moment-timezone/moment-timezone";
import {OrderList} from "./orders";

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
    action(order_arguments, island, command, island_memory, {database}) {
        let [name, raw_fruit, timezone] = order_arguments;
        let fruit: FRUITS | undefined = (FRUITS as any)[raw_fruit.toUpperCase()];

        if (fruit === undefined) {
            return `Invalid fruit \`${order_arguments[1]}\``;
        }

        const id = command.from.id;
        const username = command.from.username ?? command.from.first_name;

        database.islands[id] = new Island(id, username, name, fruit, timezone);
        return `Registered ${name}!`;
    },
    help: ['Register your island in our registry'],
});

orders.push({
    name: 'list',
    alias: ['ilhas', 'listar'],
    action(order_arguments, island, command, island_memory, {database}) {
        const island_array = Object.values(database.islands).slice(0) as IIsland[];
        if (order_arguments.length === 0) {
            return format_islands(island_array, command.date);
        } else {
            switch (order_arguments[0].toLowerCase()) {
                case 'aberto':
                case 'open': {
                    return format_islands(island_array.filter(x => x.open), command.date);
                }
                default:
                    return 'Unknown argument';
            }
        }
    },
    help: ['Lists all registered islands'],
});

orders.push({
    name: 'me',
    alias: ['eu', 'my_island', 'minha_ilha'],
    action(order_arguments, island, command) {
        return format_islands([island], command.date);
    },
    help: ['Shows current information about your island'],
});

orders.push({
    name: 'open',
    alias: ['abrir', 'dodo'],
    mut: true,
    action(order_arguments, island, command, island_memory, {bot}) {
        island['open'] = true;
        if (order_arguments.length == 1) {
            island['dodo'] = order_arguments[0];
        }

        island_memory.timeout = setTimeout(() => {
            island['open'] = false;
            island['dodo'] = null;
            bot.process_action({
                kind: 'message',
                chat_id: command.chat.id,
                reply_id: command.message_id,
                text: `Auto-closed ${island.name}`,
                parse_mode: 'Markdown'
            });
        }, 24 * 60 * 60 * 1000)
        return `Opened ${island.name}`;
    },
    help: ['Register your island as currently open'],
});

orders.push({
    name: 'close',
    alias: ['fechar'],
    mut: true,
    action(order_arguments, island, command, island_memory) {
        island['open'] = false;
        island['dodo'] = null;
        if (island_memory.timeout) {
            clearTimeout(island_memory.timeout);
            delete island_memory.timeout;
        }
        return `Closed ${island.name}`;
    },
    help: ['Register your island as currently closed'],
});
