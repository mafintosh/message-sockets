var delimited = require('./delimited');
var websock = require('websock');
var common = require('common');
var http = require('http');
var https = require('https');
var parseURL = require('url').parse;

var noop = function() {};

var JSONSocket = common.emitter(function(connection, options) {
	var self = this;

	options = options || {};

	this.address = null;
	this.destination = options.destination;
	this.connection = connection;
	this.writable = this.readable = true;

	this._buffer = [];
	this._ping = null;
	this._pong = true;

	if (options.open) {
		this.send = this._send;
		this.address = connection.address;
	}

	connection.on('open', function() {
		self.send = self._send;
		self.address = connection.address;

		while (self._buffer.length) {
			self.send(self._buffer.shift());
		}
		self.emit('open');
	});
	connection.on('message', function(message) {
		if (message === 'ping') {
			connection.send('pong');
			return;
		}
		if (message === 'pong') {
			self._pong = true;
			return;
		}
		try {
			message = JSON.parse(message);
		}
		catch (err) {
			self.destroy();
			return;
		}
		self.emit('message', message);
	});
	connection.on('close', function() {
		clearInterval(self._ping);

		self.writable = self.readable = true;
		self.emit('close');
	});
});

JSONSocket.prototype.send = function(message) {
	this._buffer.push(message);
};
JSONSocket.prototype.destroy = function() {
	if (!this.writable) {
		return;
	}
	this.connection.destroy();
};
JSONSocket.prototype.end = function() {
	if (!this.writable) {
		return;
	}
	this.connection.end();	
};
JSONSocket.prototype.ping = function() {
	var self = this;
	var ping = function() {
		if (!self._pong) {
			self.destroy();
			return;
		}
		self._pong = false;
		self.connection.send('ping');		

	};

	this._ping = setInterval(ping, 60*1000);
};

JSONSocket.prototype._send = function(message) {
	if (!this.writable) {
		return;
	}
	this.connection.send(JSON.stringify(message));
};

exports.createSocket = function(transport, options) {
	return new JSONSocket(transport, typeof options === 'boolean' ? {open:options} : options);
};
exports.connect = function(destination) {
	if (!/:\/\//.test(destination)) {
		destination = 'json://'+destination;
	}

	var host = parseURL(destination);

	if (host.protocol === 'ws:' || host.protocol === 'wss:') {
		return new JSONSocket(websock.connect(host), {destination:destination});
	}

	var transport = delimited.create();
	var socket = new JSONSocket(transport, {destination:destination});
	var req = (host.protocol === 'jsons:' ? https : http).request({
		agent: false,
		port: host.port,
		host: host.hostname,
		path: host.path,
		headers: {
			'Connection': 'Upgrade',
			'Upgrade': 'jsonsocket'
		}
	});

	req.on('upgrade', function(response, connection, head) {
		transport.open(connection, head);
	});

	req.end();

	return socket;
};
exports.listen = function(options, onsocket, callback) {
	if (typeof options === 'number') {
		options = {port:options};
	} else if (typeof options.listen === 'function') {
		options = {server:options};
	}

	callback = common.once(callback || noop);

	var server = options.server;
	var sockets = {};

	if (!server) {
		server = http.createServer();
		server.on('error', callback);
		server.listen(options.port, callback);
	}

	var ontransport = function(transport) {
		var socket = new JSONSocket(transport, {open:true});

		socket.ping();
		onsocket(socket);
	};
	var onwebsock = websock.onupgrade(ontransport);

	server.on('upgrade', function(request, connection, head) {
		var upgrade = request.headers.upgrade;

		if (upgrade !== 'jsonsocket' && upgrade !== 'socket') {
			onwebsock(request, connection, head);
			return;
		}
		var transport = delimited.create();

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
	});
};