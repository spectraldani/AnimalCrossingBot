import Bot from "./telegram/Bot";
import {Command} from "./telegram/user_commands";

export interface Order {
    name: string
    alias?: string[]
    help?: string[]
    mut?: boolean
    asOrderList?: OrderList

    action(
        bot: Bot,
        order_arguments: string[],
        command: Command,
        database: Database
    ): Promise<void> | void
}

export interface Database {
    get<T>(collection: string, id: string): Promise<T>
    get_all<T>(collection: string): Promise<{[id: string] : T}>
    put(collection: string, id: string, obj: any): Promise<void>
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
            async action(bot, order_arguments, command, database) {
                if (order_arguments.length < 1) {
                    await bot.send_message({
                        chat_id: command.chat.id,
                        reply_id: command.message_id,
                        text: 'Invalid number of arguments'
                    });
                } else {
                    const [order_key, ...its_arguments] = order_arguments;
                    const order = self.index[order_key];
                    if (order) {
                        await order.action(bot, its_arguments, command, database);
                    } else {
                        await bot.send_message({
                            chat_id: command.chat.id,
                            reply_id: command.message_id,
                            text: `Invalid sub-command \`${order_key}\``
                        });
                    }
                }
            }
        }
    }

    async executeCommand(command: Command, bot: Bot, database: Database, can_mut: boolean) {
        const [order_key, order_arguments] = command.order;

        const order = this.index[order_key];
        if (order !== undefined) {
            if (!can_mut && order.mut) {
                await bot.send_message({
                    chat_id: command.chat.id,
                    reply_id: command.message_id,
                    text: 'No permission to run that command'
                });
            } else {
                return order.action(bot, order_arguments, command, database);
            }
        } else {
            await bot.send_message({
                chat_id: command.chat.id,
                reply_id: command.message_id,
                text: `Could not find command: ${command.order}`
            });
        }
    }
}
