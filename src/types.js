module.exports.FRUITS = {
	// English
	APPLE: 0,
	CHERRY: 1,
	ORANGE: 2,
	PEACH: 3,
	PEAR: 4,
	// Portuguese
	MACA: 0,
	MAÇÃ: 0,
	CEREJA: 1,
	LARANJA: 2,
	PESSEGO: 3,
	PÊSSEGO: 3,
	PERA: 4,
	PÊRA: 4,
};

module.exports.Island = function(username, island_name, fruit) {
	this.username = username;
	this.name = island_name;
	this.native_fruit = fruit

	this.open = false;
	this.dodo = null;

	this.turnip_prices = [];
	this.turnip_prices.length = 14;
	this.turnip_prices.fill(NaN);

	this.past_turnip_pattern = -1;

	this.current_buy_price = null;
}
