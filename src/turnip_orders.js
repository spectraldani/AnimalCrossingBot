const vm = require('vm');
const fs = require('fs');

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

function turnip_probabilities(island) {
	const prices = island.turnip_prices;

	if (island.past_turnip_pattern === null ) {
		island.past_turnip_pattern = -1;
	}

	for (let i = 0; i < prices.length; i++) {
		if (prices[i] === null) {
			prices[i] = NaN;
		}
	}
	let predictor = new Predictor(
		prices, false, island.past_turnip_pattern
	);

	old_console = console;
	console = {log() {}};
	const probabilities = predictor.analyze_possibilities();
	console = old_console;
	return probabilities;
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

let orders = {};

orders.turnip = (arguments, island) => {
	let [day, time, price] = arguments;

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
	if (time === 'AM') {
		time = 0
	} else {
		time = 1
	}

	if (day == 0) {
		island.turnip_prices[0] = price;
		island.turnip_prices[1] = price;
	} else {
		island.turnip_prices[(day*2) + time] = price;
	}
	return 'Set!';
};
orders.turnip.alias = ['nabos', 'nabo', 'turnips'];
orders.turnip.mut = true;
orders.turnip.help = [
	'Register turnip prices for a given day'
];

orders.past_pattern = (arguments, island) => {
	let pattern = arguments.join(' ');
	pattern = PATTERN[pattern.replace(' ','_').toUpperCase()];

	if (pattern === undefined) {
		return `Invalid pattern \`${pattern}\``
	}

	island.past_turnip_pattern = pattern;
	return 'Set!';
};
orders.past_pattern.alias = ['padrão_anterior'];
orders.past_pattern.mut = true;
orders.past_pattern.help = [
	'Sets the turnip price pattern of the previous week'
];


const NUMBER_TO_DAY = ['Mo','Tu','We','Th','Fr','Sa'];

orders.probabilities = (arguments, island) => {
	if (arguments.length == 0) {
		return 'Missing arguments';
	}

	const type = arguments[0].toLowerCase();
	const all_probabilities = turnip_probabilities(island);
	switch (type) {
		case 'padrão':
		case 'pattern': {
			let output = 'Your current pattern is:\n\n';
			const patterns = [0,0,0,0];
			for (let pattern of all_probabilities.slice(1)) {
				patterns[pattern.pattern_number] = pattern.category_total_probability * 100;
			}
			output += `Fluctuating: ${(patterns[0]).toFixed(2)}%\n`;
			output += `Large Spike: ${(patterns[1]).toFixed(2)}%\n`;
			output += `Decreasing: ${(patterns[2]).toFixed(2)}%\n`;
			output += `Small Spike: ${(patterns[3]).toFixed(2)}%\n`;
			return output;
		}
		case 'lucro':
		case 'profit': {
			const valor = parseInt(arguments[1]);
			if (isNaN(valor)) {
				return `Invalid buy price \`${arguments[1]}\``;
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

			let output = 'Your profit probability is:\n```\n';
			for (let i = 2; i < 14; i++) {
				if (i % 2 == 0) {
					output += NUMBER_TO_DAY[i/2 - 1];
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


orders.max_sell_price = (arguments, island) => {
	const all_probabilities = turnip_probabilities(island);
	const max_price = all_probabilities[0].weekMax;
	return `Your sell price this week will not be greater than ${max_price} bells`;
}
orders.max_sell_price.alias = ['preço_máximo','max_price'];
orders.max_sell_price.help = [
	'Get the maximum selling price for turnips this week'
];

orders.turnip_prophet = (arguments, island) => {
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
