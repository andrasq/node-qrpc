Qrpc
====

Qrpc is a very fast remote procedure call package.

This code is functional, but it is very lightly tested, is still subject
to change, and needs unit tests.

For familiarity, the interface is the same `createSever` / `listen` / `connect`
that the node net and http servers use.  The implementation classes allow rpc
over pretty much anything that's readable / writable though.

Summary
-------

        var qrpc = require('qrpc')
        var server = qrpc.createServer()
        server.addHandler('test', function(req, res, next) {
            var err = null
            next(err, ['test ran!', req.m])
        })
        server.listen(1337, function() {
            console.log("qrpc listening on port 1337")
        })

        var client = qrpc.connect(1337, function() {
            client.call('test', {a: 1, b: 'test'}, function(err, ret) {
                console.log("reply from server:", ret)
                server.close()
                client.close()
            })
        })

        // => reply from server: [ 'test ran!', { a: 1, b: 'test' } ]


Installation
------------

        npm install qrpc
        npm test qrpc

Benchmark
---------

Qrpc can field bursts of calls at over 120k calls per second (not including the
time to build the call and append it to the send queue).  Full end-to-end
throughput measured at the client is around 60k calls / second.

        $ npm test/benchmark.js
        rpc: listening on 1337
        echo data: { a: 1, b: 2, c: 3, d: 4, e: 5 }
        parallel: 50000 calls in 842 ms
        series: 20000 calls in 1116 ms
        deliver to target: 100000 in 92 ms

The parallel rate is peak server processing speed -- the rpc server decodes the
calls, process them, and encodes and send the response.  The times shown above
include the client-side formatting and sending of the rpc messages; the time to
process the 50000 calls (reading request to writing response) is 240 ms.

The series time is all-inclusive back-to-back round-trip time; each call is
made only after the previous response has been received.


Qrpc Server
-----------

The server listens for incoming messages, processes them, and returns the
responses.

Calls are tagged with a the handler name string.  Each handler appears similar
to a framework middleware step, taking a request, response and next callback.

The response is returned via the next() callback, or via res.write() and
res.end().  Any number of write() calls may be used, each will send a response
message that will be pass to the client call's callback.  end() and next()
both send a final message and close the call.  Once the call is closed, no
more responses must be sent.

write() and end() return data.  Errors may be returned with next().  Qrpc
restores error objects so the client callback receives instanceof Error (note:
these errors occurred in the handler code on the server, not on the client)

Calls may be kept open indefinitely, but each open call uses memory while
holding on to the callback.

Calls do not time out.  Write errors on the server side will not be noticed by
the client.  Timeout-based error handling is up to the application.  (But see
the Todo list below)

### server = qrpc.createServer( [options][, callback(socket)] )

Create a new server.  Returns the QrpcServer object.

The callback, if specified, will be invoked on every connection to the rpc
server with the connected socket.  This makes it possible for the server to
tune the socket settings.

Options TBD.

### server.addHandler( handlerName, handlerFunction(req, res, next) )

Define the code that will handle calls of type _handlerName_

A handler receives 3 parameters just like a middleware stack function: the
call object (req), the response object (res), and a callback that can be used
to return errors and/or data.

The call object has a field .m that contains the object passed to the call, if
any, and a field .id that is the unique caller-side id of the call.

The response object has methods `write(data)` and `end([data])` that reply to
the caller with the provided data.  End() will also close the call.  After the
call is closed, no more replies can be sent.

### server.addEndpoint( handlerName, handlerFunction(req, res))

Define the code that will handle messages of type _handlerName_

Message endpoints process messages, but do not return a response to the caller.
This is a much more efficient way to push data for eg reporting or stats
delivery.  The handler function should not take a next function as a reminder
that no response will be returned to the caller.  A no-op next function is
passed to the call just in case, however.

NOTE:  The client _must_ _not_ pass a callback function when calling a message
endoint, because endpoint calls will never be closed by the sender.

### server.listen( port, [whenListening()] )

Start listening for calls.  Incoming calls will invoke the appropritae
handlers.

If the whenListening callback is provided, it will be invoked once the server
is listening for incoming calls.

### server.close( )

Stop listening for calls.

        var server = qrpc.createServer()
        server.addHandler('echo', function(req, res, next) {
            // echo server, return our arguments
            next(null, req.m)
        })
        server.listen(1337)


Qrpc Client
-----------

The client makes calls to the server, and consumes the responses.  A single
request can result in more than one response; qrpc sends all requests and
responses over a single socket (multiplexes) and steers each response to its
correct destination.

### client = qrpc.connect( port, [host,] whenConnected(clientSocket) )

Connect to the qrpc server listening on host:port (or 'localhost':port if host
is not specified).  Returns the QrpcClient object.  Port may also be an options
object to pass to `net.connect()` containing the required field `port`.

If provided, the newly created net.socket will be passed to the whenConnected
callback for socket configuration and tuning.

Once connected, calls may be made with client.call()

### client.call( handlerName, [data,] [callback(err, replyData)] )

Invoke the handler named _handlerName_, and return the server reply via the
callback.  Handlers are registered on the server with addHandler().  Data is
optional; if any data is specified, it is passed in the call to the server in
`req.m`.

Omitting the callback sends a one-way message to the server.  Any response
received from the server will be discarded.

### client.close( )

Disconnect from the qrpc server.  Any subsequent calls will return a "write
after end" error to their callback.


        client = qrpc.connect(1337, 'localhost', function whenConnected() {
            client.call('echo', {i: 123, t: 'test'}, function(err, ret) {
                console.log("echo =>", err, ret)
            })
        }

        // produces "echo => null, { i: 123, t: 'test' }"


Under The Hood
--------------

Qrpc is implemented as streaming message passing with call multiplexing.
Each message is a newline terminated string sent to the server.  Messages
are batched for efficiency, and arrive at the server in large chunks.  The
server splits the stream, decodes each message, and invokes each handler.

Messages are sent to named handlers; the handlers are registered with the
server using the `addHandler` method.  Every handler takes the same
arguments, a middleware stack-like `req, res, cb`:  the request bundle (the
message itself), the response object, and a callback that can return a
response and is used to return errors.

The response object can be used to send replies back to the caller.  The
`write` method sends a reply message and keeps the call open for more
replies later.  The `end` method sends an optional final reply and closes
the call.  End without an argument just closes the call by sending a special
empty message back to the client.  Calling the handler callback `cb(err,
data)` is equivalent to calling `end(data)`, except it will return the error
too, if any.  A single call can result in more than once response;
coordinating the responses is up to the application.

Responses arrive at the caller in the same newline terminated text format,
also in batches, over the same bidirectional connection.  The calling
library splits the batches, decodes the responses, demultiplexes the replies
to match them to their originating call, and invokes the call's callback
function with the error and data from reply message.

Calls are multiplexed, and may complete out of order.  Each message is
tagged with a unique call id to identify which call's callback is to process
the reply.

The RPC service is implemented using the `QrpcServer` and `QrpcClient` classes.
They communicate over any bidirectional EventEmitter
stream that supports a `write()` method.  A customized RPC can be built over
non-socket non-socket streams, which is how the unit tests work.

To build an rpc service on top of net sockets the way `qrpc` does:

        // create qrpc server
        var server = new qrpc.QrpcServer()
        var netServer = net.createServer(function(socket) {
            // have the server read rpc calls from the first arg
            // and write responses to the second arg
            server.setSource(socket, socket)
        })
        server.setListenFunc(function(port, cb){ netServer.listen(port, cb) })
        server.setCloseFunc(function(){ netServer.close() })


        // create qrpc client to talk to the server
        var client = new qrpc.QrpcClient()
        var socket = net.connect(1337, 'localhost')
        client.setTarget(socket, socket)

### Message Format

Qrpc requests and responses are both simple json objects:

        {
             v: 1,             // protocol version, 1: json bundle
             id: id,           // unique message id to match calls to replies
             n: name,          // call name string, in request only
             m: message        // call payload, reply data
             e: error          // returned error, in response only
             s: status         // response status, one of
                               //     'ok' (on write()),
                               //     'end' (on end()),
                               //     'err' (server error; means end)
        }


Related Work
------------

- qrpc - 60k calls / sec
- [rpc-stream](https://npmjs.com/package/rpc-stream) - 16k calls / sec
- [dnode](https://npmjs.com/package/dnode) - 14k calls / sec light load, throughput drops sharply with load
- [fast](https://npmjs.com/package/fast) - 12k calls / sec
- X [mrpc](https://www.npmjs.com/package/mrpc) - npm install failed (C++ compile errors)
- X [kamote](https://www.npmjs.com/package/kamote) - hangs on concurrent calls (v0.0.2)
        

Todo
----

- support non-json (plaintext) payloads too (ie, bypass json coding)
- support call timeouts for more convenient error detection and cleanup
- option to wrap the client into a "remote" object with callable methods
  that are transparently proxied to the remote service
- add support for one-way (no reply) calls to omit the callback handling (eg for pushing stats)
- think about how to gc or time out callbacks that have been abandoned by the server (call not closed)
- maybe make the the client and server pipable event emitters
