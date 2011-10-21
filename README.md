# message-sockets

a simple socket transport for node.js. it should support websockets and a json protocol delimited by newlines

``` js
var sockets = require('message-sockets');

// use as a client
var socket = sockets.connect('json://myserver.com');

socket.send({from:'client'});
socket.on('message', function(message) {
	console.log(message);
});

// and as a server (80 could also be a server here)
sockets.listen(80, function(socket) {
	socket.send({from:'server'})
});

```