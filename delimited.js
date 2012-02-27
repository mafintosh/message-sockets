var http = require('http');
var https = require('https');
var common = require('common');
var parseURL = require('url').parse;

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
	this.connection = null;
	this.address = null;

	this._destroyed = false;
});

Delimited.prototype.transport = 'delimited';
Delimited.prototype.open = function(connection, head) {
	if (this._destroyed) {
		connection.destroy();
		return;
	}

	var self = this;

	this.connection = connection;
	this.writable = this.readable = true;
	this.address = connection.remoteAddress;

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
	if (this._preclose()) {
		return;
	}

	this.connection.end();
};
Delimited.prototype.destroy = function() {
	if (this._preclose()) {
		return;
	}

	this.connection.destroy();
};

Delimited.prototype._preclose = function() {
	if (this.connection) {
		return false;
	}

	this.writable = this.readable = false;
	this._destroyed = true;
	this.emit('close');

	return true;
};

exports.create = function() {
	return new Delimited();
};
exports.connect = function(destination) {
	var host = typeof destination === 'string' ? parseURL((destination.indexOf('://') === -1 ? 'json://' : '')+destination) : destination;
	var transport = exports.create();
	var req = (host.protocol === 'jsons:' ? https : http).request({
		agent: false,
		port: host.port,
		host: host.hostname,
		path: host.path,
		headers: {'Connection':'Upgrade','Upgrade': 'jsonsocket'}
	});

	req.on('upgrade', function(response, connection, head) {
		transport.open(connection, head);
	});
	req.on('error', function() {
		transport.destroy();
	});

	req.end();

	return transport;	
};
exports.onupgrade = function(ontransport) {
	return function(request, connection, head) {
		var transport = exports.create();
		var upgrade = request.headers.upgrade;

		connection.write(''+
			'HTTP/1.1 101 Switching Protocols\r\n'+
			'Upgrade: '+upgrade+'\r\n'+
			'Connection: Upgrade\r\n'+
			'\r\n'
		);

		transport.once('open', function() {
			ontransport(transport);
		});

		transport.open(connection, head);		
	};
};