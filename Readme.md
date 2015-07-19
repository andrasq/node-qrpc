Qrpc
====

Placeholder.

This will be the home of the qrpc very fast remote procedure package.

Work in progress, please check back soon.

Summary
-------

        qrpc = require('qrpc')
        server = qrpc.createServer()
        server.addHandler('test', function(req, res, next) {
            res.end(['test ran!', req.m])
        })
        server.listen(1337)

        client = qrpc.connect(1337, function() {
            client.call('test', {a: 1, b: 'test'}, function(err, ret) {
                console.log("reply from server:", ret)
                server.close()
                client.close()
            })
        })

        // => [ 'test ran!', { a: 1, b: 'test' } ]

Todo
----

- support non-json (plaintext) payloads too (ie, bypass json coding)
