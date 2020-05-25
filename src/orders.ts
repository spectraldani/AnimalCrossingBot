import {BotAction, Command} from "./telegram";
import {IIsland} from "./types";
import {Bot} from "./telegram/bot";

export interface Order {
    name: string
    alias?: string[]
    help?: string[]
    mut?: boolean
    asOrderList?: OrderList

    action(
        order_arguments: string[],
        island: IIsland,
        command: Command,
        island_memory: Record<string, any>,
        global_data: GlobalData
    ): Promise<BotAction | string> | BotAction | string
}

interface GlobalData {
    all_orders: OrderList;
    bot: Bot;
    database: any;
    local_memory: Record<string, Record<string, any>>;
}

export class OrderList {
    index: Record<string, Order>;
    orders: Order[];

    constructor() {
        this.index = {};
        this.orders = [];
    }

    static merge(...orderLists: OrderList[]) {
        const merged = new OrderList();
        for (const orderList of orderLists) {
            merged.orders.push(...orderList.orders);
            Object.assign(merged.index, orderList.index);
        }
        return merged;
    }

    push(order: Order) {
        this.orders.push(order);
        this.index[order.name] = order;
        if (order.alias) {
            for (const alias of order.alias) {
                this.index[alias] = order;
            }
        }
    }

    asOrder(name: string, alias?: string[], help?: string[]): Order {
        const self = this;
        const mut = this.orders.reduce((a, b) => a || (b.mut ?? false), false);
        return {
            name,
            alias,
            help,
            mut,
            asOrderList: self,
            action(order_arguments, island, command, island_memory, global_data) {
                if (order_arguments.length < 1) {
                    return 'Invalid number of arguments';
                }
                const [order_key, ...its_arguments] = order_arguments;
                const order = self.index[order_key];
                if (order) {
                    return order.action(its_arguments, island, command, island_memory, global_data)
                } else {
                    return `Invalid sub-command \`${order_key}\``;
                }
            }
        }
    }

    async executeCommand(command: Command, global_data: GlobalData, can_mut: boolean) {
        const [order_key, order_arguments] = command.order;
        const island = global_data.database.islands[command.from.id];
        const island_memory = ensure_island_memory(global_data.local_memory, command.from.id);

        const order = this.index[order_key];
        if (order !== undefined) {
            if (!can_mut && order.mut) {
                return 'No permission to run that command';
            } else {
                return order.action(order_arguments, island, command, island_memory, global_data);
            }
        }
        return `Could not find command: ${command.order}`;
    }
}

function ensure_island_memory(memory: Record<string, Record<string, any>>, id: number) {
    memory[id] = memory[id] ?? {};
    return memory[id];
}
