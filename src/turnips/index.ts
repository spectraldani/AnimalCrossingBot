import {PATTERN, PATTERN_NAMES, TurnipPredictor} from './predictor';
import {IIsland, is_turnip_data_current, Order} from "../types";
import {Command} from "../telegram";

enum WEEK_DAYS {
    // English
    // noinspection SpellCheckingInspection,JSUnusedGlobalSymbols
    SUN = 0,
    SUNDAY = 0,
    MON = 1,
    MONDAY = 1,
    TUE = 2,
    TUESDAY = 2,
    WED = 3,
    WEDNESDAY = 3,
    THU = 4,
    THURSDAY = 4,
    FRI = 5,
    FRIDAY = 5,
    SAT = 6,
    SATURDAY = 6,
    // Portuguese=
    DOM = 0,
    DOMINGO = 0,
    SEG = 1,
    SEGUNDA = 1,
    TER = 2,
    TERÇA = 2,
    QUA = 3,
    QUARTA = 3,
    QUI = 4,
    QUINTA = 4,
    SEX = 5,
    SEXTA = 5,
    SAB = 6,
    SÁB = 6,
    SÁBADO = 6,
    // Reverse mapping names
    SU = 0,
    MO = 1,
    TU = 2,
    WE = 3,
    TH = 4,
    FR = 5,
    SA = 6,
}

function title_case(x: string) {
    let ret = x[0].toUpperCase();
    ret += x.slice(1).toLowerCase();
    return ret;
}

function reset_turnip_data(island: IIsland, command: Command) {
    const island_date = command.date.tz(island.timezone);
    island.turnips = {
        past_pattern: -1,
        prices: [],
        buy_price: null,
        week: [island_date.week(), island_date.weekYear()]
    };
    island.turnips.prices.length = 14;
    island.turnips.prices.fill(NaN);
}

function ensure_turnip_data_exists(island: IIsland, command: Command) {
    if (island.turnips === undefined || island.turnips === null) {
        reset_turnip_data(island, command);
    }
}

/**
 * This function will initialize Turnip data and start a new week if needed
 * @returns {string} Empty message or description of actions taken
 */
function start_new_week_if_needed(island: IIsland, command: Command) {
    let message = '';
    ensure_turnip_data_exists(island, command);
    if (!is_turnip_data_current(island, command.date)) {
        message = 'Starting new week...\n';
        reset_turnip_data(island, command);
        const predictor = new TurnipPredictor(island.turnips!);
        const patterns = predictor.predict_pattern();
        island.turnips!.past_pattern = patterns.findIndex(x => x > 0.99984);
        if (island.turnips!.past_pattern !== -1) {
            message += `Your past pattern was ${PATTERN[island.turnips!.past_pattern]}\n`;
        }
    }
    return message;
}

export const orders: Record<string, Order> = {};

orders.turnip = (order_arguments, island, command) => {
    let day: any, time: any, price: any;

    const island_date = command.date.tz(island.timezone);
    const [island_day, island_time] = island_date.format('d A').split(' ');

    if (order_arguments.length === 3) {
        [day, time, price] = order_arguments;
        price = parseInt(price);
        if (isNaN(price)) {
            return 'Invalid price';
        }

        day = WEEK_DAYS[day.toUpperCase()];
        if (day === undefined) {
            return 'Invalid day';
        }

        time = time.toUpperCase();
        if (time !== 'AM' && time !== 'PM') {
            return `Invalid time: \`${time}\``;
        }
    } else if (order_arguments.length === 1) {
        price = parseInt(order_arguments[0]);
        if (isNaN(price)) {
            return `Invalid price: \`${price}\``;
        }
        [day, time] = [island_day, island_time];
    } else {
        return 'Invalid number of arguments';
    }

    let message = start_new_week_if_needed(island, command);

    if (day === 0) {
        island.turnips!.prices[0] = price;
        island.turnips!.prices[1] = price;
        message += 'Set price for Su';
    } else {
        let index = (time === 'AM') ? 0 : 1;
        island.turnips!.prices[(day * 2) + index] = price;
        message += `Set price for ${title_case(WEEK_DAYS[day])} ${time}`;
    }
    return message;
};
orders.turnip.alias = ['nabos', 'nabo', 'turnips'];
orders.turnip.mut = true;
orders.turnip.help = [
    'Register turnip prices for a given day'
];

orders.past_pattern = (order_arguments, island, command) => {
    const pattern_string = order_arguments.join(' ').replace(' ', '_').toUpperCase();
    const pattern = PATTERN[pattern_string as keyof typeof PATTERN] as PATTERN | undefined;

    if (pattern === undefined) {
        return `Invalid pattern \`${pattern}\``
    }

    let message = '';
    ensure_turnip_data_exists(island, command);
    if (!is_turnip_data_current(island, command.date)) {
        message = 'Starting new week...\n';
        reset_turnip_data(island, command);
    }

    island.turnips!.past_pattern = pattern;
    message += 'Set!';
    return message;
};
orders.past_pattern.alias = ['padrão_anterior'];
orders.past_pattern.mut = true;
orders.past_pattern.help = [
    'Sets the turnip price pattern of the previous week'
];

orders.probabilities = async (order_arguments, island, command) => {
    if (order_arguments.length === 0) {
        return 'Missing arguments';
    }

    const island_date = command.date.tz(island.timezone);
    ensure_turnip_data_exists(island, command);

    const predictor = new TurnipPredictor(island.turnips!);

    const type = order_arguments[0].toLowerCase();
    switch (type) {
        case 'padrão':
        case 'padrao':
        case 'pattern': {
            let output = 'Your current pattern is:\n';
            const patterns = predictor.predict_pattern();
            for (let i = 0; i < 4; i++) {
                const prob = (patterns[i] * 100);
                if (prob >= 1) {
                    output += `${(PATTERN_NAMES as any)[i]}: ${prob.toFixed(2)}%\n`;
                }
            }
            return output;
        }
        case 'lucro':
        case 'profit': {
            let price;
            if (order_arguments.length >= 2) {
                price = parseInt(order_arguments[1]);
                if (isNaN(price)) {
                    return `Invalid buy price \`${order_arguments[1]}\``;
                }
            } else if (island.turnips!.buy_price) {
                price = island.turnips!.buy_price;
            } else {
                return 'No buy price stored!';
            }

            const probabilities = await predictor.probability_greater(price);

            let today = +(island_date.format('d'));
            if (today === 0) today = 1;
            let output = 'Your profit probability is:\n```\n';
            for (let i = today * 2; i < 14; i++) {
                if (i % 2 === 0) {
                    output += title_case(WEEK_DAYS[i / 2]);
                    output += ' AM ';
                } else {
                    output += '   PM ';
                }

                output += (probabilities[i] * 100).toFixed(2);
                output += '%';
                output += '\n'
            }
            output += '```';
            return output;
        }
        default: {
            return `Unknown argument \`${type}\``;
        }
    }
};
orders.probabilities.alias = ['probabilidades', 'probabilidade', 'prob'];
orders.probabilities.help = [
    'Computes probabilities related to turnip prices'
];


orders.max_sell_price = (order_arguments, island, command) => {
    ensure_turnip_data_exists(island, command);
    const predictor = new TurnipPredictor(island.turnips!);
    const all_probabilities = predictor.predict_all();
    const max_price = all_probabilities[0].weekMax;
    return `Your sell price this week will not be greater than ${max_price} bells`;
};
orders.max_sell_price.alias = ['preço_máximo', 'max_price'];
orders.max_sell_price.help = [
    'Get the maximum selling price for turnips this week'
];

orders.turnip_buy_price = (order_arguments, island, command) => {
    const price = parseInt(order_arguments[0]);
    if (isNaN(price)) {
        return 'Invalid buy price';
    }

    let message = start_new_week_if_needed(island, command);

    island.turnips!.buy_price = price;
    message += 'Set buy price!';
    return message;
};
orders.turnip_buy_price.alias = ['preço_compra_nabo'];
orders.turnip_buy_price.help = [
    'Set the price you bought turnips this week'
];

orders.turnip_prophet = (order_arguments, island, command) => {
    ensure_turnip_data_exists(island, command);
    const template = `[${island.name}'s turnip prices](https://turnipprophet.io?prices=PA&pattern=PR)`;
    const prices = island.turnips!.prices.slice(1).map(
        x => (x === null || isNaN(x)) ? '' : x
    ).join('.');
    const pattern = island.turnips!.past_pattern === null ? -1 : island.turnips!.past_pattern;
    return template.replace('PA', prices).replace('PR', pattern.toString());
};
orders.turnip_prophet.help = [
    'Get a link of Turnip Prophet with your island data'
];
