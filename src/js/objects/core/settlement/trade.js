/**
 * Check if this settlement can trade resources.
 *
 * @public
 * @returns {Boolean}
 */
civitas.objects.settlement.prototype.can_trade = function() {
	return this.is_building_built('tradingpost');
};

/**
 * Buy the specified goods from a settlement.
 * 
 * @public
 * @param {civitas.objects.settlement|String|Number} settlement
 * @param {String} resource
 * @param {Number} amount
 * @returns {Object|Boolean}
 */
civitas.objects.settlement.prototype.buy_from_settlement = function(settlement, resource, amount) {
	if (!civitas.utils.resource_exists(resource)) {
		if (this.is_player()) {
			this.core().error('The resource you specified does not exist.');
		}
		return false;
	}
	if (this.can_trade()) {
		var resources = this.get_resources();
		var _settlement;
		if (typeof settlement === 'string' || typeof settlement === 'number') {
			_settlement = this.core().get_settlement(settlement);
			if (settlement === false) {
				if (this.is_player()) {
					this.core().error(settlement + ' does not exist.');
				}
				return false;
			}
		} else {
			_settlement = settlement;
		}
		var is_double = this.religion().id === _settlement.religion().id ? true : false;
		var trades = _settlement.get_trades();
		if (trades === null) {
			if (this.is_player()) {
				this.core().error(settlement + ' does not trade any goods.');
			}
			return false;
		}
		if (typeof trades.exports === 'undefined') {
			if (this.is_player()) {
				this.core().error(settlement + ' does not export any goods.');
			}
			return false;
		}
		for (var item in trades.exports) {
			if (item === resource) {
				if (typeof amount === 'undefined') {
					amount = trades.exports[item];
				}
				var discount = Math.ceil((civitas.RESOURCES[item].price * 
					civitas.TRADES_ADDITION) / 100);
				var price = civitas.utils.calc_price_plus_discount(amount, item, discount);
				var settlement_price = civitas.utils.calc_price(amount, item);
				var item_discount_price = Math.ceil(civitas.RESOURCES[item].price + discount);
				if (!this.has_storage_space_for(amount)) {
					this.core().error(this.name() + ' does not have enough storage space for ' +
						'<strong>' + amount + '</strong> ' + 
						civitas.utils.get_resource_name(item) + '.');
					return false;
				}
				if (this.dec_coins(price) === false) {
					return false;
				}
				if (!_settlement.has_resource(item, amount)) {
					return false;
				}
				if (!_settlement.remove_resource(item, amount)) {
					return false;
				}
				_settlement.inc_coins(settlement_price);
				this.add_to_storage(item, amount);
				this.remove_from_exports(_settlement, item, amount);
				this.raise_influence(_settlement.id(), (is_double ? civitas.IMPORT_INFLUENCE * 2 : 
					civitas.IMPORT_INFLUENCE));
				this.raise_prestige(is_double ? civitas.IMPORT_PRESTIGE * 2 : 
					civitas.IMPORT_PRESTIGE);
				this.raise_fame(50);
				this.core().refresh();
				if (this.is_player()) {
					this.core().notify(this.name() + ' bought <strong>' + amount + '</strong> ' + 
						civitas.utils.get_resource_name(item) + ' from ' + settlement + 
						' for <strong>' + item_discount_price + '</strong> ' + 
						civitas.utils.get_resource_name('coins') + 
						' each, for a total of <strong>' + price + '</strong> ' + 
						civitas.utils.get_resource_name('coins') + '.', civitas.l('World Market'));
				}
				return {
					buyer: this.name(),
					amount: amount,
					goods: civitas.utils.get_resource_name(item),
					seller: settlement,
					price: Math.round(civitas.RESOURCES[item].price + discount),
					totalPrice: price
				};
			}
		}
		if (this.is_player()) {
			this.core().error(settlement + ' does not export the requested goods.');
		}
	}
	return false;
};
	
/**
 * Perform a trades reset (resets all amounts of resources available
 * for trade and randomize the amount.
 * 
 * @public
 * @returns {Boolean}
 */
civitas.objects.settlement.prototype.reset_trades = function() {
	var trades = {
		'imports': {},
		'exports': {}
	};
	var amount = 0;
	if (typeof civitas.SETTLEMENTS[this.id()] !== 'undefined') {
		var _trades = civitas.SETTLEMENTS[this.id()].trades;
		for (var goods_type in _trades) {
			for (var item in _trades[goods_type]) {
				amount = civitas.utils.get_random_by_importance(_trades[goods_type][item])
				if (goods_type === 'exports') {
					if (this.resources[item] < amount) {
						this.resources[item] += amount;
					}
					/* else {
						this.resources[item] = Math.floor(this.resources[item] / 2);
					}*/
				}
				trades[goods_type][item] = amount;
			}
		}
		this.trades = trades;
		return true;
	} else {
		this.trades = trades;
		return false;
	}
};

/**
 * Add the specified resource amount and the total price to the
 * Black Market goods list.
 * 
 * @public
 * @param {String} resource
 * @param {Number} amount
 * @param {Number} price
 * @returns {Object}
 */
civitas.objects.settlement.prototype.add_black_market = function (resource, amount, price) {
	var core = this.core();
	if (typeof core.black_market[resource] !== 'undefined') {
		var old = core.black_market[resource];
		core.black_market[resource] = {
			resource: resource,
			amount: old.amount + amount,
			price: old.price + price
		};
	} else {
		core.black_market[resource] = {
			resource: resource,
			amount: amount,
			price: price
		};
	}
	return core.black_market;
};

/**
 * List the specified goods onto the Black Market.
 * 
 * @public
 * @param {String} resource
 * @param {Number} amount
 * @returns {Object|Boolean}
 */
civitas.objects.settlement.prototype.list_black_market = function(resource, amount) {
	if (!civitas.utils.resource_exists(resource)) {
		return false;
	}
	var resources = this.get_resources();
	if (!this.has_resource(resource, amount)) {
		this.core().error(this.name() + ' doesn`t have enough resources of this type.');
		return false;
	}
	if (this.remove_resource(resource, amount)) {
		var discount = Math.ceil((civitas.RESOURCES[resource].price * 
			civitas.BLACK_MARKET_DISCOUNT) / 100);
		var price = civitas.utils.calc_price_minus_discount(amount, resource, discount);
		this.add_black_market(resource, amount, price);
		this.core().refresh();
		if (this.is_player()) {
			this.core().notify(this.name() + ' placed ' + amount + ' ' + 
				civitas.utils.get_resource_name(resource) + 
				' on the Black Market and will receive ' + price + ' ' + 
				civitas.utils.get_resource_name('coins') + ' next month.', 
				civitas.l('Black Market'));
		}
		return {
			seller: this.name(),
			amount: amount,
			goods: civitas.utils.get_resource_name(resource),
			price: price,
			discount: discount
		};
	}
	return false;
};
	
/**
 * Sell the specified goods to a settlement.
 * 
 * @public
 * @param {civitas.objects.settlement|String|Number} settlement
 * @param {String} resource
 * @param {Number} amount
 * @returns {Object|Boolean}
 */
civitas.objects.settlement.prototype.sell_to_settlement = function(settlement, resource, amount) {
	if (!civitas.utils.resource_exists(resource)) {
		if (this.is_player()) {
			this.core().error('The resource you specified does not exist.');
		}
		return false;
	}
	if (this.can_trade()) {
		var resources = this.get_resources();
		var _settlement;
		if (typeof settlement === 'string' || typeof settlement === 'number') {
			_settlement = this.core().get_settlement(settlement);
			if (settlement === false) {
				if (this.is_player()) {
					this.core().error(settlement + ' does not exist.');
				}
				return false;
			}
		} else {
			_settlement = settlement;
		}
		var is_double = this.religion().id === _settlement.religion().id ? true : false;
		var trades = _settlement.get_trades();
		if (trades === null) {
			if (this.is_player()) {
				this.core().error(settlement + ' does not trade any goods.');
			}
			return false;
		}
		if (typeof trades.imports === 'undefined') {
			if (this.is_player()) {
				this.core().error(settlement + ' does not import any goods.');
			}
			return false;
		}
		for (var item in trades.imports) {
			if (item === resource) {
				if (typeof amount === 'undefined') {
					amount = trades.imports[item];
				}
				var discount = Math.ceil((civitas.RESOURCES[item].price * 
					civitas.TRADES_DISCOUNT) / 100);
				var price = civitas.utils.calc_price_minus_discount(amount, item, discount);
				var settlement_price = civitas.utils.calc_price(amount, item);
				var item_discount_price = Math.ceil(civitas.RESOURCES[item].price - discount);
				if (!this.has_resource(item, amount)) {
					this.core().error(this.name() + ' does not have enough ' + 
						civitas.utils.get_resource_name(item) + ' to sell.');
					return false;
				}
				if (!this.remove_resource(item, amount)) {
					return false;
				}
				this.inc_coins(price);
				if (!_settlement.dec_coins(settlement_price)) {
					if (this.is_player()) {
						this.core().error(settlement + ' does not have enough ' + 
							civitas.utils.get_resource_name('coins') + '.');
					}
					return false;
				}
				_settlement.add_to_storage(item, amount);
				this.remove_from_imports(_settlement, item, amount);
				this.raise_influence(_settlement.id(), (is_double ? civitas.EXPORT_INFLUENCE * 2 : 
					civitas.EXPORT_INFLUENCE));
				this.raise_prestige(is_double ? civitas.EXPORT_PRESTIGE * 2 : 
					civitas.EXPORT_PRESTIGE);
				this.raise_fame(50);
				this.core().refresh();
				if (this.is_player()) {
					this.core().notify(this.name() + ' sold <strong>' + amount + '</strong> ' + 
						civitas.utils.get_resource_name(item) + ' to ' + settlement + 
						' for <strong>' + item_discount_price + '</strong> ' + 
						civitas.utils.get_resource_name('coins') + 
						' each, for a total of <strong>' + price + '</strong> ' + 
						civitas.utils.get_resource_name('coins') + '.', civitas.l('World Market'));
				}
				return {
					seller: this.name(),
					amount: amount,
					goods: civitas.utils.get_resource_name(item),
					buyer: settlement,
					price: Math.round(civitas.RESOURCES[item].price - discount),
					totalPrice: price
				};
			}
		}
		if (this.is_player()) {
			this.core().error(settlement + ' does not import the specified goods.');
		}
	}
	return false;
};
	
/**
 * Remove a specified amount of a resource from the trade exports of a settlement.
 * 
 * @public
 * @param {civitas.objects.settlement} settlement
 * @param {String} item
 * @param {Number} amount
 * @returns {Boolean}
 */
civitas.objects.settlement.prototype.remove_from_exports = function(settlement, item, amount) {
	settlement.trades.exports[item] = settlement.trades.exports[item] - amount;
	return true;
};

/**
 * Remove a specified amount of a resource from the trade imports of a settlement.
 * 
 * @public
 * @param {civitas.objects.settlement} settlement
 * @param {String} item
 * @param {Number} amount
 * @returns {Boolean}
 */
civitas.objects.settlement.prototype.remove_from_imports = function(settlement, item, amount) {
	settlement.trades.imports[item] = settlement.trades.imports[item] - amount;
	return true;
};

/**
 * Get the imports and exports of this settlement.
 * 
 * @public
 * @returns {Object}
 */
civitas.objects.settlement.prototype.get_trades = function() {
	return this.trades;
};
	
/**
 * Set the imports and exports of this settlement.
 * 
 * @public
 * @param {Object} value
 * @returns {civitas.objects.settlement}
 */
civitas.objects.settlement.prototype.set_trades = function(value) {
	this.trades = value;
	return this;
};
	