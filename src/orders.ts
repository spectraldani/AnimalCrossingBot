import {Command} from "./telegram";
import {IIsland} from "./types";

export interface Order {
    name: string
    alias?: string[]
    help?: string[]
    mut?: boolean
    subOrders?: Order[]

    action(order_arguments: string[], island: IIsland, command: Command, database: any): Promise<string | null> | string | null
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
            subOrders: self.orders,
            action(order_arguments, island, command, database) {
                if (order_arguments.length < 1) {
                    return 'Invalid number of arguments';
                }
                const [order_key, ...its_arguments] = order_arguments;
                const order = self.index[order_key];
                if (order) {
                    return order.action(its_arguments, island, command, database)
                } else {
                    return `Invalid sub-command ${command}`;
                }
            }
        }
    }

    async executeCommand(command: Command, database: any, can_mut: boolean) {
        let [order_key, order_arguments] = command.order;
        let island = database.islands[command.from.id];

        const order = this.index[order_key];
        if (order !== undefined) {
            if (!can_mut && order.mut) {
                return 'No permission to run that command';
            } else {
                return order.action(order_arguments, island, command, database);
            }
        }
        return null;
    }
}
