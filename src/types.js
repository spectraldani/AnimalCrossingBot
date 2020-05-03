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

module.exports.Island = function(username, island_name, fruit, time_offset) {
	this.username = username;
	this.name = island_name;
	this.native_fruit = fruit;
	this.timezone = timezone;

	this.open = false;
	this.dodo = null;
}
