Qrpc
====

Qrpc is a very fast remote procedure call package.

This is still an early version of the code:  it is fully functional and it is
fast, but it is very lightly tested, is still subject to change, and needs
unit tests.


Summary
-------

        qrpc = require('qrpc')
        server = qrpc.createServer()
        server.addHandler('test', function(req, res, next) {
            err = null
            next(err, ['test ran!', req.m])
        })
        server.listen(1337, function() {
            console.log("qrpc listening on port 1337")
        })

        client = qrpc.connect(1337, function() {
            client.call('test', {a: 1, b: 'test'}, function(err, ret) {
                console.log("reply from server:", ret)
                server.close()
                client.close()
            })
        })

        // => reply from server: [ 'test ran!', { a: 1, b: 'test' } ]


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

### qrpc.createServer( [options] )

Create a new server

### server.addHandler( handlerName, handlerFunction(req, res, next) )

Define the code that will handle calls of type _handlerName_

The handler function receives 3 parameters

### server.listen( port )

Start listening for calls.

### server.close( )

Stop listening for calls.


        server = qrpc.createServer()
        server.addHandler('echo', function(req, res, next) {
            // echo server, return our arguments
            next(null, req.m)
        })
        server.listen(1337)


Qrpc Client
-----------

The client makes calls to the server, and consumes the responses.  A single
request can result in more than response; qrpc sends all requests and
responses over a single socket (multiplexes) and steers each response to its
correct destination.

### qrpc.connect( port, [host,] whenConnected )

Connect to the qrpc server listening on host:port (or 'localhost':port if host
is not specified).  Returns the client object

Once connected, calls may be made with client.call()

### client.call( handlerName, [data,] [callback(err, replyData)] )

Invoke the handler named _handlerName_ on the server, and present the server
response via the callback.  Data is optional; if any data is specified, it is
passed in the call to the server in `req.m`.

Omitting the callback sends a one-way message to the server.  Any returned
response will be ignored.

### client.close( )

Disconnect from the qrpc server.  Any subsequent calls will return a "write
after end" error to their callback.


        client = qrpc.connect(1337, 'localhost', function whenConnected() {
            client.call('echo', {i: 123, t: 'test'}, function(err, ret) {
                console.log("echo =>", err, ret)
            })
        }

        // produces "echo => null, { i: 123, t: 'test' }"


Message Format
--------------

Qrpc requests and responses are both simple json objects:

        {
             v: 1,             // protocol version, 1: this json bundle
             id: id,           // unique id passed in to match calls to replies
             n: name,          // call name string, in request only
             m: message        // call payload
             e: error          // returned error, in response only
             s: status         // response status, one of
                               //     ok (on write()),
                               //     end (on end()),
                               //     err (server error; means end)
        }


Todo
----

- support non-json (plaintext) payloads too (ie, bypass json coding)
- support call timeouts for more convenient error detection and cleanup
