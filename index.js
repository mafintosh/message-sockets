var delimited = require('./delimited');
var websock = require('websock');
var common = require('common');
var http = require('http');
var parseURL = require('url').parse;

var noop = function() {};

var JSONSocket = common.emitter(function(connection, open) {
	var self = this;

	this.connection = connection;

	this._buffer = [];
	this._ping = null;

	if (open) {
		self.send = self._send;
	}

	connection.on('open', function() {
		self.send = self._send;

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
			return;
		}
		self.emit('message', JSON.parse(message));
	});
	connection.on('close', function() {
		clearInterval(self._ping);
		self.emit('close');
	});
});

JSONSocket.prototype.send = function(message) {
	this._buffer.push(message);
};
JSONSocket.prototype.destroy = function() {
	this.connection.destroy();
};
JSONSocket.prototype.end = function() {
	this.connection.end();	
};
JSONSocket.prototype.ping = function() {
	this._ping = setInterval(this.connection.send.bind(this.connection, 'ping'), 60*1000);
};

JSONSocket.prototype._send = function(message) {
	this.connection.send(JSON.stringify(message));
};

exports.connect = function(host) {
	if (!/:\/\//.test(host)) {
		host = 'json://'+host;
	}
	host = parseURL(host);

	if (host.protocol === 'ws:') {
		return new JSONSocket(websock.connect(host), false);
	}

	var transport = delimited.create();
	var socket = new JSONSocket(transport, false);
	var req = http.request({
		agent: false,
		port: host.port,
		host: host.hostname,
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
exports.listen = function(port, onsocket, callback) {
	var server = http.createServer();

	callback = common.once(callback || noop);

	var ontransport = function(transport) {
		var socket = new JSONSocket(transport, true);

		socket.ping();
		onsocket(socket);		
	};
	var onwebsock = websock.onupgrade(ontransport);

	server.on('upgrade', function(request, connection, head) {
		if (request.headers.upgrade !== 'jsonsocket') {
			onwebsock(request, connection, head);
			return;
		}
		var transport = delimited.create();

		connection.write(''+
			'HTTP/1.1 101 Switching Protocols\r\n'+
			'Upgrade: jsonsocket\r\n'+
			'Connection: Upgrade\r\n'+
			'\r\n'
		);

		transport.once('open', function() {
			ontransport(transport);
		});

		transport.open(connection, head);
	});

	server.on('error', callback);
	server.listen(port, callback);	

	return server;
};