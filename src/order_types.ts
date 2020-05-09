export function build_export_table(orders: any) {
    const table: Record<string, any> = {};

    for (const [key, order] of Object.entries(orders) as [string, any][]) {
        table[key] = order;
        if (order.alias) {
            for (const alias of order.alias) {
                table[alias] = order;
            }
        }
    }

    return table;
}
