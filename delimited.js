var net = require('net');
var common = require('common');

var parse = function(delimiter, callback) {
	var buffer = '';
	var lastIndex = 0;

	return function(data) {
		var index = lastIndex;
		var length = buffer.length;

		buffer += data;

		while ((index = buffer.indexOf(delimiter, index+1)) > -1) {
			if (!callback(buffer.substring(lastIndex, index))) {
				return;
			}
			lastIndex = index+1;
		}
		if (lastIndex >= length) {
			lastIndex -= length;
			buffer = data;
		}		
	};
};

var Delimited = common.emitter(function(delimiter) {
	this.delimiter = delimiter;
	this.writable = false;
});

Delimited.prototype.onconnection = function(connection, head) {
	var self = this;

	process.nextTick(this.emit.bind(this, 'open'));

	this.connection = connection;
	this.writable = true;

	connection.setEncoding('utf-8');

	var ondata = parse(this.delimiter, function(message) {
		self.emit('message', message);
		return self.writable;
	});

	var onclose = common.once(function() {
		self.writable = false;
		self.emit('close');
	});

	connection.on('data', ondata);
	connection.on('end', function() {
		self.writable = false;
		onclose();
	});
	connection.on('close', onclose);

	if (head && head.length) {
		ondata(head.toString('utf-8')); // seems risky!
	}
};
Delimited.prototype.send = function(message) {
	this.connection.write(message+this.delimiter);
};
Delimited.prototype.end = Delimited.prototype.close = function() {
	this.connection.end();
};
Delimited.prototype.destroy = function() {
	this.connection.destroy();
};

exports.create = function(delimiter) {
	return new Delimited(delimiter);
};