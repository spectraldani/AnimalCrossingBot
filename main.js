const fs = require('fs');
const moment = require('moment-timezone');
const { build_export_table } = require('./src/order_types.js');
const { Bot } = require('./src/telegram.js');

const orders = {};
orders.as = function(arguments, island, command, database) {
	if (arguments.length < 2) {
		return `Invalid number of arguments`;
	}

	var [island_name, order_key, ...arguments] = arguments;
	const [user_id] = find_island_by_name(island_name, database.islands);

	if (user_id === null) {
		return `Unknown island \`${island_name}\``;
	}

	command.from = { id : user_id };
	command.order = [order_key, arguments];

	return handle_command(command, database, false);
}
orders.as.alias = ['como'];
orders.as.can_mut = true; // hack to avoid '/as x /as x ...'
orders.as.help = [
	'Run command as if you were in another island'
];


const order_lists = [
	orders,
	require('./src/island_orders.js'),
	require('./src/turnip_orders.js'),
];

const all_orders = order_lists.flatMap(build_export_table);

function find_island_by_name(name, islands) {
	name = name.toLowerCase();
	for (const [id, island] of Object.entries(islands)) {
		if (island.name.toLowerCase() == name) {
			return [id, island];
		}
	}
	return [null, null];
}

function handle_command(command, database, can_mut) {
	let [order_key, arguments] = command.order;
	let island = database.islands[command.from.id];

	for (const order_list of all_orders) {
		const order = order_list[order_key];
		if (order !== undefined) {
			if (!can_mut && order.mut) {
				return 'No permission to run that command';
			} else {
				return order(arguments, island, command, database);
			}
		}
	}

	return null;
}


const database = JSON.parse(fs.readFileSync('data.json', 'utf8'));
if (!database.bot_token && !database.chat_id) {
	throw "Missing bot_token or chat_id in database";
}
const bot = new Bot(database.bot_token);

moment.defineLocale('ac', {
    parentLocale: 'en',
    week: {doy: 3}
});
moment.locale('ac');

(async () => {
	const bot_commands = {
		commands: order_lists
			.flatMap(x=> Object.entries(x))
			.map(([k,v]) => ({command:k, description:v.help[0]}))
	};
	const response = await bot.post('setMyCommands', bot_commands);
	console.log('Sent commands!', await response.json());
})().catch(console.error);

(async () => {
	for await (const command of bot.stream_commands()) {
		if (command.chat.id == database['chat_id']) {
			let response;
			try {
				response = handle_command(command, database, true);
			} catch(e) {
				console.error(e,command);
				response = 'Error:```\n'+JSON.stringify(e, Object.getOwnPropertyNames(e))+'```';
			}
			if (response !== null) {
				await bot.reply(command, response);
			} else {
				console.warn('null reply',command)
			}
		}
		fs.writeFileSync('data.json', JSON.stringify(database));
	}
})().catch(console.error);
