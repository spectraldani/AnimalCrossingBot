const fs = require('fs');
const moment = require('moment-timezone');
const { Island, FRUITS } = require('./types.js')

const fruit_emoji = {
	[FRUITS.APPLE]:  '🍎',
	[FRUITS.CHERRY]: '🍒',
	[FRUITS.ORANGE]: '🍊',
	[FRUITS.PEACH]:  '🍑',
	[FRUITS.PEAR]:   '🍐',
}

function format_islands(islands) {
	let message = '';

	islands = Object.values(islands).slice(0);
	islands.sort((a,b) => a.name.localeCompare(b.name));
	islands.sort((a,b) => a.native_fruit - b.native_fruit);
	islands.sort((a,b) => b.open - a.open);

	let start_open = islands[0].open;
	if (islands[0].open) {
		message += '\\[Open]\n';
	} else {
		message += '\\[Closed]\n';
	}

	for (const island of islands) {
		if (start_open && !island.open) {
			message += '\\[Closed]\n';
			start_open = false;
		}

		message += `*${island.name}* ${fruit_emoji[island.native_fruit]} `;
		message += `\\[${moment().tz(island.timezone).format('A')}]`;
		message += '\n'

		if (island.username) {
			message += `${island.username}\n`;
		}

		message += '\n';
	}
	return message
}

let orders = {};

orders.register = (arguments, island, command, database) => {
	let [name, fruit, timezone] = arguments;
	fruit = FRUITS[fruit.toUpperCase()];

	if (fruit == undefined) {
		return `Invalid fruit \`${arguments[1]}\``;
	}

	database.islands[command.from.id] = new Island(command.from.username, name, fruit, timezone)
	return `Registered ${name}!`;
};
orders.register.alias = ['registrar'];
orders.register.mut = true;
orders.register.help = [
	'Register your island in our registry'
];

orders.list = (arguments, island, command, database) => (
	format_islands(database.islands)
);
orders.list.alias = ['ilhas','listar'];
orders.list.help = [
	'Lists all registred islands'
];

orders.open = (arguments, island) => {
	island['open'] = true;
	if (arguments.length == 1) {
		island['dodo'] = arguments[0];
	}
	return `Opened ${island.name}`;
}
orders.open.alias = ['abrir','dodo'];
orders.open.mut = true;
orders.open.help = [
	'Register your island as currently open'
];

orders.close = (arguments, island) => {
	island['open'] = false;
	island['dodo'] = null;
	return `Closed ${island.name}`;
}
orders.close.alias = ['fechar'];
orders.close.mut = true;
orders.close.help = [
	'Register your island as currently closed'
];

module.exports = orders;
