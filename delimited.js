var net = require('net');
var common = require('common');

var DELIMETER = '\n';

var noop = function() {};
var parse = function(callback) {
	var buffer = '';
	var lastIndex = 0;

	return function(data) {
		var index = lastIndex;
		var length = buffer.length;

		buffer += data;

		while ((index = buffer.indexOf(DELIMETER, index+1)) > -1) {
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

var Delimited = common.emitter(function() {
	this.writable = this.readable = false;
});

Delimited.prototype.open = function(connection, head) {
	var self = this;

	this.connection = connection;
	this.writable = this.readable = true;

	connection.setEncoding('utf-8');

	var ondata = parse(function(message) {
		if (self.readable) {
			self.emit('message', message);		
		}
		return self.writable;
	});
	var onend = function() {
		connection.end();
		onclose();		
	};
	var onclose = common.once(function() {
		self.writable = this.readable = false;
		self.emit('close');
	});

	connection.on('data', ondata);
	connection.on('end', onend);
	connection.on('close', onclose);

	this.emit('open');

	if (this.writable && head && head.length) {
		ondata(head.toString('utf-8'));
	}
};
Delimited.prototype.send = function(message) {
	this.connection.write(message+DELIMETER);
};
Delimited.prototype.end = Delimited.prototype.close = function() {
	this.connection.end();
};
Delimited.prototype.destroy = function() {
	this.connection.destroy();
};

exports.create = function() {
	return new Delimited();
};