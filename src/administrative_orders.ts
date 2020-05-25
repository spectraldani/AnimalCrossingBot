import {OrderList} from "./orders";
import {IIsland} from "./types";

function find_island_by_name(name: string, islands: { [id: string]: IIsland; }): [string, IIsland] | [null, null] {
    name = name.toLowerCase();
    for (const [id, island] of Object.entries(islands)) {
        if (island.name.toLowerCase() === name) {
            return [id, island];
        }
    }
    return [null, null];
}

export const orders = new OrderList();

orders.push({
    name: 'as',
    alias: ['como'],
    mut: true,
    async action(order_arguments, island, command, island_memory, global_data) {
        if (order_arguments.length < 2) {
            return `Invalid number of arguments`;
        }

        let [island_name, order_key, ...next_order_arguments] = order_arguments;
        const [user_id, other_island] = find_island_by_name(island_name, global_data.database.islands);

        if (user_id === null || other_island === null) {
            return `Unknown island \`${island_name}\``;
        }

        command.from = {id: +user_id, first_name: other_island.username};
        command.order = [order_key, next_order_arguments];

        return await global_data.all_orders.executeCommand(command, global_data, false);
    },
    help: ['Run command as if you were in another island'],
});

orders.push({
    name: 'help',
    alias: ['ajuda'],
    action(order_arguments, island, command, island_memory, {all_orders}) {
        const [order_key] = order_arguments;
        const order = all_orders.index[order_key];
        let message = `*${order.name}*`;
        message += `:\n${order.help?.[0] ?? 'No description available'}`;
        if (order.alias !== undefined) {
            message += '\nAlias: ';
            message += order.alias.map(x => `_${x.replace('_', '_\\__')}_`).join(', ');
        }
        return message;
    },
    help: ['Displays information about a certain command']

})
