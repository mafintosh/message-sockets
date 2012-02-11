var sockets = require('./index');

sockets.listen(15647, function(socket) {
	socket.send({server:'world'});

	socket.on('message', function(message) {
		socket.send(message);
	});
}, function() {
	var socket = sockets.connect('json://localhost:15647');

	socket.send({client:'world'});

	socket.on('message', function(message) {
		console.log(message);
	});
	socket.on('close', function() {
		console.log('client','close');
	});
});
