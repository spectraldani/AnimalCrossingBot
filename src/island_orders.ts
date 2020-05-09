import {PATTERN, TurnipPredictor} from "./turnips/predictor";
import {FRUITS, IIsland, is_turnip_data_current, Island, Order} from "./types";
import {Moment} from "moment-timezone/moment-timezone";
import {Command} from "./telegram";

const fruit_emoji = {
    [FRUITS.APPLE]: '🍎',
    [FRUITS.CHERRY]: '🍒',
    [FRUITS.ORANGE]: '🍊',
    [FRUITS.PEACH]: '🍑',
    [FRUITS.PEAR]: '🍐',
};

function format_islands(island_array: IIsland[], date: Moment) {
    let message = '';

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

        if (island.turnips !== null && is_turnip_data_current(island, date)) {
            const [weekday, ampm] = island_date.format('d A').split(' ');
            const index = 2 * (+weekday) + (ampm === 'AM' ? 0 : 1);
            const current_price = island.turnips.prices[index];
            const predictor = new TurnipPredictor(island.turnips);
            const pattern = predictor.predict_pattern().findIndex(x => x >= 0.80);
            message += 'Tnp:';
            if (current_price !== null && !isNaN(current_price)) {
                message += ` ${current_price}`;
            } else {
                const predicted_current_price = predictor.predict_all()[0].prices[index];
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

export const orders: Record<string, Order> = {};

orders.register = (order_arguments, island, command, database) => {
    let [name, raw_fruit, timezone] = order_arguments;
    let fruit: FRUITS | undefined = (FRUITS as any)[raw_fruit.toUpperCase()];

    if (fruit === undefined) {
        return `Invalid fruit \`${order_arguments[1]}\``;
    }

    database.islands[command.from.id] = new Island(command.from.username, name, fruit, timezone);
    return `Registered ${name}!`;
};
orders.register.alias = ['registrar'];
orders.register.mut = true;
orders.register.help = [
    'Register your island in our registry'
];

orders.list = (order_arguments, island, command, database) => {
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
};
orders.list.alias = ['ilhas', 'listar'];
orders.list.help = [
    'Lists all registered islands'
];

orders.me = (order_arguments, island, command) => {
    return format_islands([island], command.date);
};
orders.me.alias = ['eu', 'my_island', 'minha_ilha'];
orders.me.help = [
    'Shows current information about your island'
];

orders.open = (order_arguments, island) => {
    island['open'] = true;
    if (order_arguments.length == 1) {
        island['dodo'] = order_arguments[0];
    }
    return `Opened ${island.name}`;
};
orders.open.alias = ['abrir', 'dodo'];
orders.open.mut = true;
orders.open.help = [
    'Register your island as currently open'
];

orders.close = (order_arguments, island) => {
    island['open'] = false;
    island['dodo'] = null;
    return `Closed ${island.name}`;
};
orders.close.alias = ['fechar'];
orders.close.mut = true;
orders.close.help = [
    'Register your island as currently closed'
];

module.exports = orders;
