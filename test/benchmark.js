/**
 * quick little rpc package
 *
 * Copyright (C) 2015-2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

// this script is not part of the unit tests
if (process.argv[1] && process.argv[1].indexOf('nit') > 0) return

assert = require('assert')
cluster = require('cluster')
qrpc = require('../index')
json = { }
//try { json = require('json-simple') } catch (err) { }

setImmediate = global.setImmediate || process.nextTick

useCluster = true
if (!useCluster) {
    isMaster = true
    isWorker = true
}
else {
    isMaster = cluster.isMaster
    isWorker = cluster.isWorker
    if (isMaster) {
        cluster.fork()
//        cluster.fork()
//        cluster.fork()
        cluster.disconnect()
    }
}

// Master is the server
if (isMaster) {
    server = qrpc.createServer({
        // options
    },
    function onConnection(socket) {
        // Nagle does not seem to be enabled on the server ("listen") end
        //socket.setNoDelay(true)
    })
    server.listen(1337, function() {
        console.log("rpc: listening on 1337", process.memoryUsage())
    })
    server.addHandler('quit', function(req, res, next) {
        console.log("server quit", process.memoryUsage())
        res.end()
        server.close()
    })
    server.addHandler('ping', function(req, res, next) {
        res.end(null)
    })
    server.addHandler('echo', function(req, res, next) {
        var data = req.m
        if (Array.isArray(data)) {
            for (var i=0; i<data.length; i++) res.write(data[i])
            res.end()
        }
        else res.end(data)
    })
    server.addHandler('echo10k', function(req, res, next) {
        var i, data = req.m
        for (i=0; i<10000; i++) {
            res.write(data)
        }
        res.end()
    })
    server.wrap({wrappedEcho: function(a, cb) {
        cb(null, a)
    }})
    server.wrap({wrappedEcho2: function(a, b, cb) {
        cb(null, a, b)
    }})
    server.wrap({wrappedEcho3: function(a, b, c, cb) {
        cb(null, a, b, c)
    }})
    var nendpoints = 0
    server.addEndpoint('deliver', function(req, res) {
        // endpoints accept data, but do not reply to the caller
        // if (++nendpoints % 1000 === 0) process.stdout.write(".")
    })
    server.addEndpoint('logline', function(req, res) {
        // log line received, append it to the logfile
        // qlogger.info(req.m)
    })
    server.addHandler('syncLog', function(req, res, next) {
        // fflush the logs, ack back to the caller
        // qlogger.fflush(next)
        next()
    })
}

var data = 1
var data = [1, 2, 3, 4, 5]
var data = {a:1, b:2, c:3, d:4, e:5}
var buf = new Buffer(4000)
var data1k = {}; for (var i=1; i<122; i++) data1k[i] = i;       // 1002 byte json string
var logline200 = "200 byte logline string xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n"
var logline2000 = new Array(10+1).join(logline200)

// Workers are the clients
if (isWorker) {
    var client = qrpc.connect({
        port: 1337,
        host: 'localhost',
    },
    function whenConnected(socket) {
        // note: writing buffers to the socket trips the Nagle algorithm; turn it off
        //socket.setNoDelay()
        // note: parallel calls are 30% faster with Nagle write combining, 45% for blobs,
        // but serial calls are 1000 x faster without!
        // but node-v6.7.0 is slower with setNoDelay than without
        // on Skylake i7-6700k, parallel calls are 35% slower with NoDelay (50k in 425ms vs 315ms),
        // but endpoint is 35% faster (100k in 27ms vs 37ms); series is not affected (20k in 670ms)
        // The logging benchmark REQUIRES nodelay, else it is limited to 25.00 batches / sec

        console.log("echo data:", data, process.memoryUsage())
        var n, t1, t2, batchSize, line

        n = 50000; t1 = Date.now()
        testParallel(n, data, function(err, ret) {
            // already printed timings

        n = 20000; t1 = Date.now()
        testSeries(client, n, data, function(err, ret) {
            console.log("series: %d calls in %d ms", n, Date.now() - t1)

        n = 100000; t1 = Date.now()
        testDeliver(client, n, data, function(e) {
            // already printed

        n = 100000; t1 = Date.now()
        testRetrieve(client, n, data, function(e) {
            t2 = Date.now()
            console.log("retrieved %d data in %d ms", n, t2 - t1)

        n = 20000; t1 = Date.now()
        testRetrieve(client, n, buf.slice(0, 1000), function(e) {
            console.log("retrieved %d 1k Buffers in %d ms", n, Date.now() - t1)

            // note: encoding buffers is linear in buf.length
        n = 20000; t1 = Date.now()
        testBuffers(client, n, buf.slice(0, 1000), function(err, ret) {
            // already printed

        n = 50000; t1 = Date.now()
        testWrapped(client, n, data, function(err, ret) {
            t2 = Date.now()
            console.log("wrapped parallel: %d calls in %d ms", n, t2 - t1)

        n = 20000; t1 = Date.now()
        testData1K(client, n, data1k, function(err, ret) {
            var t2 = Date.now();

        // logging is *much* faster with noDelay (32x faster: 250*25 = 6.25k lines/sec vs 200k lines/sec)
        socket.setNoDelay()
        n = 100000; line = logline200; batchSize = 250; t1 = Date.now()
        testLogging(client, n, line, batchSize, function(e) {
            t2 = Date.now()
            console.log("logged %d %dB lines in %d ms syncing every %d lines", n, line.length, t2-t1, batchSize)

        // Done.
        client.call('quit')
        client.close()
        console.log("client done", process.memoryUsage())

        }) }) }) }) }) }) }) }) })
    })

    function testParallel( n, data, cb ) {
        ndone = 0
        var t1 = Date.now()
        function handleEchoResponse(err, ret) {
            if (++ndone === n) {
                var t2 = Date.now()
                console.log("parallel: %d calls in %d ms", n, t2 - t1)
                assert.deepEqual(ret, data)
                return cb()
            }
        }
        for (i=0; i<n; i++) {
            client.call('echo', data, handleEchoResponse)
        }
    }

    function testSeries( client, n, data, cb ) {
        (function makeCall() {
            client.call('echo', data, function(err, ret) {
                if (err) throw err
                if (--n <= 0) {
                    assert.deepEqual(ret, data)
                    return cb();
                }
                else if (n % 40 === 0) setImmediate(makeCall)
                else makeCall()
            })
        })()
    }

    function testDeliver( client, n, data, cb ) {
        for (var i=0; i<n; i++) client.call('deliver', data)
        var t1 = Date.now()
        // the server runs calls in order, and since deliver does not yield,
        // all deliver calls will have completed by the time this trailing echo runs
        client.call('echo', data, function(err, ret) {
            var t2 = Date.now()
            console.log("send to endpoint: %d in %d ms", n, t2 - t1)
            cb()
        })
    }

    //
    function testRetrieve( client, n, data, cb ) {
        var i, itemCount = 0
        var t1 = Date.now()
        for (i=0; i<n; i+=10000) client.call('echo10k', data, function(err, ret) {
            if (err) throw err
            itemCount += 1
            if (itemCount === n) {
                assert.deepEqual(data, ret)
                return cb()
            }
        })
    }

    function testBuffers( client, n, data, cb ) {
        var i, itemCount = 0
        var t1 = Date.now()
        for (i=0; i<n; i++) client.call('echo', data, function(err, ret) {
            if (err) throw err
            itemCount += 1
            if (itemCount === n) {
                console.log("parallel 1k buffers: %d in %d ms", n, Date.now() - t1)
                assert.deepEqual(ret, data)
                return cb()
            }
        })
    }

    function testWrapped( client, n, data, cb ) {
        var ndone = 0;
        function handleResponse(err, ret) {
            if (err) throw err
            if (++ndone >= n) {
                assert.deepEqual(ret.a, data)
                assert.deepEqual(ret.b, data)
                return cb()
            }
        }
        if (0) {
            var data2 = {a: data, b: data}
            for (var i=0; i<n; i++) {
                // 'echo' returns its arguments singly, so pass just 1
                client.call('echo', data2, handleResponse)
            }
            return
        }

        // FIXME: should not need a dummy object to wrap methods by name...
        var caller = client.wrap({dummyObject: true}, ['wrappedEcho', 'wrappedEcho2', 'wrappedEcho3'])
        for (var i=0; i<n; i++) {
            caller.wrappedEcho2(data, data, function(err, ret1, ret2) {
                if (err) throw err
                if (++ndone >= n) {
                    assert.deepEqual(ret1, data)
                    assert.deepEqual(ret2, data)
                    return cb()
                }
            })
        }
    }

    function testData1K( client, n, data, cb ) {
        ndone = 0
        var t1 = Date.now()
        function handleEchoResponse(err, ret) {
            if (++ndone === n) {
                var t2 = Date.now()
                console.log("parallel 1K object: %d calls in %d ms", n, t2 - t1)
                assert.deepEqual(ret, data)
                return cb()
            }
        }
        for (i=0; i<n; i++) {
            client.call('echo', data, handleEchoResponse)
        }
    }

    function testLogging( client, n, data, batchSize, cb ) {
        var nsent = 0;
        function uploadLoop() {
            do {
                for (i=0; i<10; i++) client.call('logline', data);
                nsent += 10;
            } while (nsent % batchSize !== 0 && nsent < n)
            client.call('syncLog', function(err, ret) {
                if (nsent < n) setImmediate(uploadLoop);
                else cb()
            })
        }
        uploadLoop()
    }
}

// 36k calls / sec parallel single process, 16.7k/s series
// 65k calls / sec parallel two processes, 18k/s series (73k/s single int arg parallel, 20k/s series)
// server burst peak is about 300k calls / sec (single client, in parallel, w/o req time, tiny response, meas 100k)
// server throughput is about 100k calls served / sec (multiple clients, in parallel, w/o req time) (cpu caching effects?)

// reply-less localhost calls are 23% faster (addEndpoint vs addHandler), and much faster on the server side
// (1e6 deliveries / sec vs 120k calls / s, not including caller-side data prep and formatting)
// (2e6 deliveries / sec from 2 client processes)
