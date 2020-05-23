import {PATTERN, PATTERN_NAMES, TurnipPredictor} from './predictor';
import {IIsland, is_turnip_data_current} from "../types";
import {Command} from "../telegram";
import {OrderList} from "../orders";

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
        const predictor = new TurnipPredictor(island.turnips!);
        const patterns = predictor.predict_pattern();
        const past_pattern = patterns.findIndex(x => x > 0.99984);
        reset_turnip_data(island, command);
        island.turnips!.past_pattern = past_pattern;
        if (island.turnips!.past_pattern !== -1) {
            message += `Your past pattern was ${PATTERN[island.turnips!.past_pattern].replace('_', ' ')}\n`;
        }
    }
    return message;
}

export const orders = new OrderList();

orders.push({
    name: 'turnip',
    alias: ['nabos', 'nabo', 'turnips'],
    mut: true,
    action(order_arguments, island, command) {
        let day: WEEK_DAYS, time: 'AM' | 'PM', price: number;

        const island_date = command.date.tz(island.timezone);
        const island_day = +island_date.format('d') as typeof day;
        const island_time = island_date.format('A') as 'AM' | 'PM';

        if (order_arguments.length === 3) {
            let [arg_day, arg_time, arg_price] = order_arguments;
            price = parseInt(arg_price);
            if (isNaN(price)) {
                return 'Invalid price';
            }

            day = (WEEK_DAYS as any)[arg_day.toUpperCase()];
            if (day === undefined) {
                return 'Invalid day';
            }

            arg_time = arg_time.toUpperCase();
            if (arg_time === 'AM' || arg_time === 'PM') {
                time = arg_time;
            } else {
                return `Invalid time: \`${arg_time}\``;
            }
        } else if (order_arguments.length === 1) {
            price = parseInt(order_arguments[0]);
            if (isNaN(price)) {
                return `Invalid price: \`${price}\``;
            }
            day = island_day;
            time = island_time;
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
    },
    help: ['Register turnip prices for a given day'],
});

orders.push({
    name: 'past_pattern',
    alias: ['padrão_anterior'],
    mut: true,
    action(order_arguments, island, command) {
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
    },
    help: ['Sets the turnip price pattern of the previous week'],
});

const probabilities_sub = new OrderList();
orders.push(probabilities_sub.asOrder(
    'probabilities',
    ['probabilidades', 'probabilidade', 'prob', 'probs'],
    ['Computes probabilities related to turnip prices']
));

probabilities_sub.push({
    name: 'pattern',
    alias: ['padrão', 'padrao'],
    action(order_arguments: string[], island, command) {
        ensure_turnip_data_exists(island, command);
        const predictor = new TurnipPredictor(island.turnips!);
        const patterns = predictor.predict_pattern();
        let output = 'Your current pattern is:\n';
        for (let i = 0; i < 4; i++) {
            const prob = (patterns[i] * 100);
            if (prob >= 1) {
                output += `${(PATTERN_NAMES as any)[i]}: ${prob.toFixed(2)}%\n`;
            }
        }
        return output;
    },
    help: ['Returns this weeks probable turnip sell patterns']
});

probabilities_sub.push({
    name: 'profit',
    alias: ['lucro'],
    async action(order_arguments: string[], island, command) {
        ensure_turnip_data_exists(island, command);
        const island_date = command.date.tz(island.timezone);
        const predictor = new TurnipPredictor(island.turnips!);
        let price;
        if (order_arguments.length >= 1) {
            price = parseInt(order_arguments[0]);
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
        let output = `Your profit probability for ${price} is:\n\`\`\`\n`;
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
    },
    help: ['Computer the probability of the selling price being higher than a given value']
});

orders.push({
    name: 'max_price',
    alias: ['preço_máximo'],
    action(order_arguments, island, command) {
        ensure_turnip_data_exists(island, command);
        const predictor = new TurnipPredictor(island.turnips!);
        const all_probabilities = predictor.predict_all();
        const max_price = all_probabilities[0].prices.reduce(
            (current, next) => Math.max(current, next.max),
            0
        )
        return `Your sell price this week will not be greater than ${max_price} bells`;
    },
    help: ['Get the maximum selling price for turnips this week'],
});

orders.push({
    name: 'min_price',
    alias: ['preço_mínimo'],
    action(order_arguments, island, command) {
        ensure_turnip_data_exists(island, command);
        const predictor = new TurnipPredictor(island.turnips!);
        const all_probabilities = predictor.predict_all();
        const min_price = all_probabilities[0].prices.reduce(
            (current, next) => Math.min(current, next.min),
            Infinity
        )
        return `Your sell price this week will not be smaller than ${min_price} bells`;
    },
    help: ['Get the minimum selling price for turnips this week'],
});


orders.push({
    name: 'turnip_buy_price',
    alias: ['preço_compra_nabo'],
    mut: true,
    action(order_arguments, island, command) {
        const price = parseInt(order_arguments[0]);
        if (isNaN(price)) {
            return 'Invalid buy price';
        }

        let message = start_new_week_if_needed(island, command);

        island.turnips!.buy_price = price;
        message += 'Set buy price!';
        return message;
    },
    help: ['Set the price you bought turnips this week'],
});

orders.push({
    name: 'turnip_prophet',
    action(order_arguments, island, command) {
        ensure_turnip_data_exists(island, command);
        const template = `[${island.name}'s turnip prices](https://turnipprophet.io?prices=PA&pattern=PR)`;
        const prices = island.turnips!.prices.slice(1).map(
            x => (x === null || isNaN(x)) ? '' : x
        ).join('.');
        const pattern = island.turnips!.past_pattern === null ? -1 : island.turnips!.past_pattern;
        return template.replace('PA', prices).replace('PR', pattern.toString());
    },
    help: ['Get a link of Turnip Prophet with your island data'],
});
