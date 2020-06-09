import {PATTERN, PATTERN_NAMES, TurnipPredictor} from './predictor';
import {IIsland, is_turnip_data_current, turnip_data_duration} from "../types";
import {reply_command} from "../telegram/BotActions";
import {OrderList} from "../orders";
import {get_island, set_island} from "../island_orders";
import Channel from "@nodeguy/channel";
import {CallbackCommand, Command} from "../telegram/user_commands";

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
function start_new_week_if_needed(island: IIsland, command: Command): string | undefined {
    ensure_turnip_data_exists(island, command);

    const island_date = command.date.tz(island.timezone);
    const date_delta = turnip_data_duration(island_date, island);

    if (date_delta < 0) {
        let message = 'Starting new week...\n';
        const predictor = new TurnipPredictor(island.turnips!);
        const patterns = predictor.predict_pattern();
        if (patterns === null || date_delta < -1) {
            message += 'Your past turnip prices were invalid, your past pattern is UNKNOWN\n';
            reset_turnip_data(island, command);
        } else {
            const past_pattern = patterns.findIndex(x => x > 0.99984);
            reset_turnip_data(island, command);
            island.turnips!.past_pattern = past_pattern;
            if (island.turnips!.past_pattern !== -1) {
                message += `Your past pattern is ${PATTERN[island.turnips!.past_pattern].replace('_', ' ')}\n`;
            }
        }
        return message;
    } else {
        return undefined;
    }
}

export const orders = new OrderList();

orders.push({
    name: 'turnip',
    alias: ['nabos', 'nabo', 'turnips'],
    mut: true,
    async action(bot, order_arguments, command, database) {
        const island = await get_island(database, command.from);
        let day: WEEK_DAYS, time: 'AM' | 'PM', price: number;

        const island_date = command.date.tz(island.timezone);
        const island_day = +island_date.format('d') as typeof day;
        const island_time = island_date.format('A') as 'AM' | 'PM';

        if (order_arguments.length === 3) {
            let [arg_day, arg_time, arg_price] = order_arguments;
            if (arg_price === 'clear' || arg_price === 'apagar') {
                price = NaN;
            } else {
                price = parseInt(arg_price);
                if (isNaN(price)) {
                    await bot.send_message({
                        text: 'Invalid price',
                        ...reply_command(command)
                    })
                    return;
                }
            }

            day = (WEEK_DAYS as any)[arg_day.toUpperCase()];
            if (day === undefined) {
                await bot.send_message({
                    text: 'Invalid day',
                    ...reply_command(command)
                })
                return;
            }

            arg_time = arg_time.toUpperCase();
            if (arg_time === 'AM' || arg_time === 'PM') {
                time = arg_time;
            } else {
                await bot.send_message({
                    text: `Invalid time: \`${arg_time}\``,
                    ...reply_command(command)
                })
                return;
            }
        } else if (order_arguments.length === 1) {
            price = parseInt(order_arguments[0]);
            if (isNaN(price)) {
                await bot.send_message({
                    text: `Invalid price: \`${price}\``,
                    ...reply_command(command)
                })
                return;
            }
            day = island_day;
            time = island_time;
        } else {
            await bot.send_message({
                text: 'Invalid number of arguments',
                ...reply_command(command)
            })
            return;
        }

        let message = start_new_week_if_needed(island, command) ?? '';

        if (day === 0) {
            island.turnips!.prices[0] = price;
            island.turnips!.prices[1] = price;
            message += 'Set price for Su';
        } else {
            let index = (time === 'AM') ? 0 : 1;
            island.turnips!.prices[(day * 2) + index] = price;
            message += `Set price for ${title_case(WEEK_DAYS[day])} ${time}`;
        }
        await set_island(database, command.from, island);
        await bot.send_message({
            text: message,
            ...reply_command(command)
        })
    },
    help: ['Register turnip prices for a given day'],
});

orders.push({
    name: 'past_pattern',
    alias: ['padrão_anterior'],
    mut: true,
    async action(bot, order_arguments, command, database) {
        const island = await get_island(database, command.from);
        const pattern_string = order_arguments.join(' ').replace(' ', '_').toUpperCase();
        const pattern = PATTERN[pattern_string as keyof typeof PATTERN] as PATTERN | undefined;

        if (pattern === undefined) {
            await bot.send_message({
                text: `Invalid pattern \`${pattern}\``,
                ...reply_command(command)
            })
            return;
        } else {
            let message = '';
            ensure_turnip_data_exists(island, command);
            if (!is_turnip_data_current(island, command.date)) {
                message = 'Starting new week...\n';
                reset_turnip_data(island, command);
            }

            island.turnips!.past_pattern = pattern;
            message += 'Set!';

            await set_island(database, command.from, island);
            await bot.send_message({
                text: message,
                ...reply_command(command)
            });
        }
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
    async action(bot, order_arguments, command, database) {
        const island = await get_island(database, command.from);
        ensure_turnip_data_exists(island, command);
        const predictor = new TurnipPredictor(island.turnips!);
        const patterns = predictor.predict_pattern();
        if (patterns === null) {
            await bot.send_message({
                text: 'Couldn\'t complete order, your turnip prices are invalid',
                ...reply_command(command)
            })
        } else {
            let output = 'Your current pattern is:\n';
            for (let i = 0; i < 4; i++) {
                const prob = (patterns[i] * 100);
                if (prob >= 1) {
                    output += `${(PATTERN_NAMES as any)[i]}: ${prob.toFixed(2)}%\n`;
                }
            }
            await bot.send_message({
                text: output,
                ...reply_command(command)
            })
        }
    },
    help: ['Returns this weeks probable turnip sell patterns']
});

probabilities_sub.push({
    name: 'profit',
    alias: ['lucro'],
    async action(bot, order_arguments, command, database) {
        const island = await get_island(database, command.from);
        ensure_turnip_data_exists(island, command);
        const island_date = command.date.tz(island.timezone);
        const predictor = new TurnipPredictor(island.turnips!);
        let price;
        if (order_arguments.length >= 1) {
            price = parseInt(order_arguments[0]);
            if (isNaN(price)) {
                await bot.send_message({
                    text: `Invalid buy price \`${order_arguments[1]}\``,
                    ...reply_command(command)
                })
                return;
            }
        } else if (island.turnips!.buy_price) {
            price = island.turnips!.buy_price;
        } else {
            await bot.send_message({
                text: 'No buy price stored!',
                ...reply_command(command)
            })
            return;
        }

        const probabilities = await predictor.probability_greater(price);
        if (probabilities === null) {
            await bot.send_message({
                text: 'Couldn\'t complete order, your turnip prices are invalid',
                ...reply_command(command)
            })
            return;
        }

        let today = +(island_date.format('d'));
        if (today === 0) today = 1;
        let message = `Your profit probability for ${price} is:\n\`\`\`\n`;
        for (let i = today * 2; i < 14; i++) {
            if (i % 2 === 0) {
                message += title_case(WEEK_DAYS[i / 2]);
                message += ' AM ';
            } else {
                message += '   PM ';
            }

            message += (probabilities[i] * 100).toFixed(2);
            message += '%';
            message += '\n'
        }
        message += '```';
        await bot.send_message({
            text: message,
            ...reply_command(command)
        })
    },
    help: ['Computer the probability of the selling price being higher than a given value']
});

orders.push({
    name: 'max_price',
    alias: ['preço_máximo'],
    async action(bot, order_arguments, command, database) {
        const island = await get_island(database, command.from);
        ensure_turnip_data_exists(island, command);
        const predictor = new TurnipPredictor(island.turnips!);
        const all_probabilities = predictor.predict_all();
        if (all_probabilities === null) {
            await bot.send_message({
                text: 'Couldn\'t complete order, your turnip prices are invalid',
                ...reply_command(command)
            })
        } else {
            const max_price = all_probabilities[0].prices.reduce(
                (current, next) => Math.max(current, next.max),
                0
            )
            await bot.send_message({
                text: `Your sell price this week will not be greater than ${max_price} bells`,
                ...reply_command(command)
            })
        }
    },
    help: ['Get the maximum selling price for turnips this week'],
});

orders.push({
    name: 'min_price',
    alias: ['preço_mínimo'],
    async action(bot, order_arguments, command, database) {
        const island = await get_island(database, command.from);
        ensure_turnip_data_exists(island, command);
        const predictor = new TurnipPredictor(island.turnips!);
        const all_probabilities = predictor.predict_all();
        if (all_probabilities === null) {
            await bot.send_message({
                text: 'Couldn\'t complete order, your turnip prices are invalid',
                ...reply_command(command)
            })
        } else {
            const min_price = all_probabilities[0].prices.reduce(
                (current, next) => Math.min(current, next.min),
                Infinity
            )
            await bot.send_message({
                text: `Your sell price this week will not be smaller than ${min_price} bells`,
                ...reply_command(command)
            })
        }
    },
    help: ['Get the minimum selling price for turnips this week'],
});


orders.push({
    name: 'turnip_buy_price',
    alias: ['preço_compra_nabo'],
    mut: true,
    async action(bot, order_arguments, command, database) {
        const island = await get_island(database, command.from);
        const price = parseInt(order_arguments[0]);
        if (isNaN(price)) {
            await bot.send_message({
                text: 'Invalid buy price',
                ...reply_command(command)
            });
        } else {
            let message = start_new_week_if_needed(island, command) ?? '';

            island.turnips!.buy_price = price;
            message += 'Set buy price!';

            await set_island(database, command.from, island);
            await bot.send_message({
                text: message,
                ...reply_command(command)
            });
        }
    },
    help: ['Set the price you bought turnips this week'],
});

orders.push({
    name: 'turnip_prophet',
    async action(bot, order_arguments, command, database) {
        const island = await get_island(database, command.from);
        ensure_turnip_data_exists(island, command);
        const template = `[${island.name}'s turnip prices](https://turnipprophet.io?prices=PA&pattern=PR)`;
        const prices = island.turnips!.prices.slice(1).map(
            x => (x === null || isNaN(x)) ? '' : x
        ).join('.');
        const pattern = island.turnips!.past_pattern === null ? -1 : island.turnips!.past_pattern;
        await bot.send_message({
            text: template.replace('PA', prices).replace('PR', pattern.toString()),
            chat_id: command.chat.id,
            reply_id: command.message_id,
            disable_web_page_preview: true,
            parse_mode: "Markdown"

        });
    },
    help: ['Get a link of Turnip Prophet with your island data'],
});

orders.push({
    name: 'clear_turnip_data',
    alias: ['apagar_nabos'],
    async action(bot, order_arguments, command, database) {
        const island = await get_island(database, command.from);
        ensure_turnip_data_exists(island, command);

        const chan = Channel<CallbackCommand<boolean>>();
        const result = await bot.send_choices({
            chat_id: command.chat.id,
            reply_id: command.message_id,
            text: "Are you sure?",
            choices: {
                buttons: [[
                    {text: 'Yes', data: true},
                    {text: 'No', data: false},
                ]],
                channel: chan
            },
        });

        if (!result.ok) throw 'Impossible';
        const this_message = result.result;

        let response: boolean | undefined;
        while (response === undefined) {
            const callback_command = await chan.shift();
            if (callback_command === undefined) throw new Error('Channel shouldn\'t be closed');

            if (callback_command.from.id !== command.from.id) {
                await bot.answer_callback_query({
                    query_id: callback_command.callback_query_id,
                    text: 'You can\'t reply this query',
                    show_alert: true
                });
            } else {
                response = callback_command.data;
                await chan.close();
            }
        }

        if (response) {
            let prophet_link = null;
            if (island.turnips && is_turnip_data_current(island, command.date)) {
                const template = `[your previous data](https://turnipprophet.io?prices=PA&pattern=PR)`;
                const prices = island.turnips!.prices.slice(1).map(
                    x => (x === null || isNaN(x)) ? '' : x
                ).join('.');
                const pattern = island.turnips!.past_pattern === null ? -1 : island.turnips!.past_pattern;
                prophet_link = template.replace('PA', prices).replace('PR', pattern.toString());
            }
            reset_turnip_data(island, command);
            let message = 'Your turnip data was cleared'
            if (prophet_link !== null) {
                message += `\nHere is ${prophet_link}`
            }
            await bot.edit_message({
                chat_id: this_message.chat.id,
                message_id: this_message.message_id,
                text: message,
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            })
        } else {
            await bot.edit_message({
                chat_id: this_message.chat.id,
                message_id: this_message.message_id,
                text: 'Your turnip data was kept as is',
            });
        }
    },
    help: ['Clear all the turnip related data of this week'],
});
