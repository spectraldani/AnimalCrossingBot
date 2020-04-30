module.exports.build_export_table = (orders) => {
	const table = {};

	for (const [key, order] of Object.entries(orders)) {
		table[key] = order;
		if (order.alias) {
			for (const alias of order.alias) {
				table[alias] = order;
			}
		}
	}

	return table;
};
