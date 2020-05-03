const vm = require('vm');
const fs = require('fs');
const moment = require('moment-timezone');

const prophet_path = './turnip_prophet/js/predictions.js'
vm.runInThisContext(fs.readFileSync(prophet_path, 'utf8'))
global['i18next'] = {t: (x) => x.split('.')[1].toUpperCase()}
PATTERN['UNKNOWN'] = -1;

const WEEK_DAYS = {
	// English
	SU:        0,
	SUN:       0,
	SUNDAY:    0,
	MO:        1,
	MON:       1,
	MONDAY:    1,
	TU:        2,
	TUE:       2,
	TUESDAY:   2,
	WE:        3,
	WED:       3,
	WEDNESDAY: 3,
	TH:        4,
	THU:       4,
	THURSDAY:  4,
	FR:        5,
	FRI:       5,
	FRIDAY:    5,
	SA:        6,
	SAT:       6,
	SATURDAY:  6,
	// Portuguese:
	DOM:       0,
	DOMINGO:   0,
	SEG:       1,
	SEGUNDA:   1,
	TER:       2,
	TERÇA:     2,
	QUA:       3,
	QUARTA:    3,
	QUI:       4,
	QUINTA:    4,
	SEX:       5,
	SEXTA:     5,
	SAB:       6,
	SÁB:       6,
	SÁBADO:    6,
}

const NUMBER_TO_DAY = ['Su', 'Mo','Tu','We','Th','Fr','Sa'];

const PATTERN_NAMES = {
	'-1': 'Unknown',
	0:'Fluctuating', 1:'Large Spike', 2:'Decreasing', 3:'Small Spike'
}

function turnip_probabilities(island) {
	const prices = island.turnips.prices;

	for (let i = 0; i < prices.length; i++) {
		if (prices[i] === null) {
			prices[i] = NaN;
		}
	}
	let predictor = new Predictor(
		prices, false, island.turnips.past_pattern
	);

	old_console = console;
	console = {log() {}};
	const probabilities = predictor.analyze_possibilities();
	console = old_console;
	if (probabilities.length == 1) {
		throw 'Impossible prices!';
	} else {
		return probabilities;
	}
}

function probability_greater(dist, x) {
	if (dist.min <= x && x <= dist.max) {
		if (dist.min == dist.max) {
			return 0;
		} else {
			return 1 - (x-dist.min)/(dist.max-dist.min)
		}
	} else if (x < dist.min) {
		return 1;
	} else {
		return 0;
	}
}

function current_pattern_probabilities(all_probabilities) {
	const patterns = [0,0,0,0];
	for (let pattern of all_probabilities.slice(1)) {
		patterns[pattern.pattern_number] = pattern.category_total_probability;
	}
	return patterns;
}

function reset_turnip_data(island, command) {
	const island_date = command.date.tz(island.timezone);
	island.turnips = {
		past_pattern: -1,
		prices: [],
		buy_price: null,
		date: { week: island_date.week(), year: island_date.weekYear()}
	}
	island.turnips.prices.length = 14
	island.turnips.prices.fill(NaN);
}

function ensure_turnip_data_exists(island, command) {
	if (island.turnips === undefined)
		reset_turnip_data(island, command);
}

function is_turnip_data_current(island, command) {
	const island_date = command.date.tz(island.timezone);
	const current_date = {
		week: island_date.week(), year: island_date.weekYear()
	};

	if (island.turnips.date.year < current_date.year) {
		return false;
	} else if (island.turnips.date.week < current_date.week) {
		return false;
	} else {
		return true;
	}
}

/**
 * This function will initialize Turnip data and start a new week if needed
 * @returns {string} Empty message or description of actions taken
 */
function start_new_week_if_needed(island, command) {
	let message = '';
	ensure_turnip_data_exists(island, command);
	if (!is_turnip_data_current(island, command)) {
		message = 'Starting new week...\n';
		reset_turnip_data(island, island_date);
		const all_probabilities = turnip_probabilities(island);
		const patterns = current_pattern_probabilities(all_probabilities);
		island.past_turnip_pattern = patterns.findIndex(x => x > 0.99984);
		if (island.past_turnip_pattern !== -1) {
			message += `Your past pattern was ${PATTERN_NAMES[island.past_turnip_pattern]}\n`;
		}
	}
	return message;
}

let orders = {};

orders.turnip = (arguments, island, command) => {
	let day, time, price;

	const island_date = command.date.tz(island.timezone);
	const [island_day, island_time] = island_date.format('d A').split(' ');

	if (arguments.length == 3) {
		[day, time, price] = arguments;
		price = parseInt(price);
		if (isNaN(price)) {
			return `Invalid price: \`${price}\``;
		}

		day = WEEK_DAYS[day.toUpperCase()];
		if (day === undefined) {
			return `Invalid day: \`${day}\``;
		}

		time = time.toUpperCase();
		if (time !== 'AM' && time !== 'PM') {
			return `Invalid time: \`${time}\``;
		}
	} else if (arguments.length == 1) {
		price = parseInt(arguments[0]);
		if (isNaN(price)) {
			return `Invalid price: \`${price}\``;
		}
		[day, time] = [island_day, island_time];
	} else {
		return 'Invalid number of arguments';
	}

	let message = start_new_week_if_needed(island, command);

	if (day == 0) {
		island.turnip_prices[0] = price;
		island.turnip_prices[1] = price;
		message += 'Set price for Su';
	} else {
		let index = (time === 'AM') ? 0 : 1;
		island.turnip_prices[(day*2) + index] = price;
		message += `Set price for ${NUMBER_TO_DAY[day]} ${time}`;
	}
	return message;
};
orders.turnip.alias = ['nabos', 'nabo', 'turnips'];
orders.turnip.mut = true;
orders.turnip.help = [
	'Register turnip prices for a given day'
];

orders.past_pattern = (arguments, island, command) => {
	let pattern = arguments.join(' ');
	pattern = PATTERN[pattern.replace(' ','_').toUpperCase()];

	if (pattern === undefined) {
		return `Invalid pattern \`${pattern}\``
	}

	let message = '';
	ensure_turnip_data_exists(island, command);
	if (!is_turnip_data_current(island, command)) {
		message = 'Starting new week...\n';
		reset_turnip_data(island, command);
	}

	island.past_turnip_pattern = pattern;
	message += 'Set!'
	return message;
};
orders.past_pattern.alias = ['padrão_anterior'];
orders.past_pattern.mut = true;
orders.past_pattern.help = [
	'Sets the turnip price pattern of the previous week'
];

orders.probabilities = (arguments, island, command) => {
	if (arguments.length == 0) {
		return 'Missing arguments';
	}

	const island_date = command.date.tz(island.timezone);
	ensure_turnip_data_exists(island, command);

	const type = arguments[0].toLowerCase();
	const all_probabilities = turnip_probabilities(island);
	switch (type) {
		case 'padrão':
		case 'pattern': {
			let output = 'Your current pattern is:\n';
			const patterns = current_pattern_probabilities(all_probabilities);
			for (let i = 0; i < 4; i++) {
				const prob = (patterns[i] * 100)
				if (prob >= 1) {
					output += `${PATTERN_NAMES[i]}: ${prob.toFixed(2)}%\n`;
				}
			}
			return output;
		}
		case 'lucro':
		case 'profit': {
			let valor;
			if (arguments.length >= 2) {
				valor = parseInt(arguments[1]);
				if (isNaN(valor)) {
					return `Invalid buy price \`${arguments[1]}\``;
				}
			} else if (island.turnips.buy_price) {
				valor = island.turnips.buy_price;
			} else {
				return 'No buy price stored!';
			}

			const marginals = all_probabilities.slice(1).map(x => [
				x.probability,
				x.prices.map(a => probability_greater(a, valor))
			]).map(([p,ds]) => ds.map(x => p*x));

			const probabilities = [];
			probabilities.length = 14;
			probabilities.fill(0);

			for (let i = 0; i < marginals.length; i++) {
				for (let j = 0; j < 14; j++) {
					probabilities[j] += marginals[i][j];
				}
			}

			let today = +(island_date.format('d'));
			if (today == 0) today = 1;
			let output = 'Your profit probability is:\n```\n';
			for (let i = today*2; i < 14; i++) {
				if (i % 2 == 0) {
					output += NUMBER_TO_DAY[i/2];
					output += ' AM ';
				} else {
					output += '   PM ';
				}

				output += (probabilities[i]*100).toFixed(2);
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


orders.max_sell_price = (arguments, island, command) => {
	const island_date = command.date.tz(island.timezone);
	ensure_turnip_data_exists(island, command);
	const all_probabilities = turnip_probabilities(island);
	const max_price = all_probabilities[0].weekMax;
	return `Your sell price this week will not be greater than ${max_price} bells`;
}
orders.max_sell_price.alias = ['preço_máximo','max_price'];
orders.max_sell_price.help = [
	'Get the maximum selling price for turnips this week'
];

orders.turnip_buy_price = (arguments, island, command) => {
	let [ price ] = arguments;
	price = parseInt(price);
	if (isNaN(price)) {
		return 'Invalid buy price';
	}

	let message = start_new_week_if_needed(island, command);

	island.current_buy_price = price;
	message += 'Set buy price!'
	return message;
}
orders.turnip_buy_price.alias = ['preço_compra_nabo'];
orders.turnip_buy_price.help = [
	'Set the price you bought turnips this week'
];

orders.turnip_prophet = (arguments, island, command) => {
	const island_date = command.date.tz(island.timezone);
	ensure_turnip_data_exists(island, command);
	const template = `[${island.name}'s turnip prices](https://turnipprophet.io?prices=PA&pattern=PR)`;
	const prices = island.turnip_prices.slice(1).map(
		x => (x === null || isNaN(x)) ? '' : x
	).join('.');
	const pattern = island.past_turnip_pattern === null ? -1 : island.past_turnip_pattern;
	return template.replace('PA',prices).replace('PR',pattern);
}
orders.turnip_prophet.help = [
	'Get a link of Turnip Prophet with your island data'
];

module.exports = orders;
