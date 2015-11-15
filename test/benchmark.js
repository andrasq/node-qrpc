/**
 * quick little rpc package
 *
 * Copyright (C) 2015 Andras Radics
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
        cluster.disconnect()
    }
}

if (isMaster) {
    server = qrpc.createServer({
        json_encode: json.encode || null,
        json_decode: json.decode || null,
    }, function onConnection(socket) {
        //socket.setNoDelay(true)
    })
    server.listen(1337, function() {
        console.log("rpc: listening on 1337")
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
    var nendpoints = 0
    server.addEndpoint('deliver', function(req, res, next) {
        // endpoints accept data, but do not reply to the caller
        // if (++nendpoints % 1000 === 0) process.stdout.write(".")
    })
}

var data = 1
var data = [1, 2, 3, 4, 5]
var data = {a:1, b:2, c:3, d:4, e:5}
var buf = new Buffer(4000)

if (isWorker) {
    var client = qrpc.connect({
        port: 1337,
        host: 'localhost',
        json_encode: json.encode || null,
        json_decode: json.decode || null,
    }, function whenConnected(socket) {
        // note: writing buffers to the socket trips the Nagle algorithm; turn it off
        //socket.setNoDelay()
        // note: parallel calls are 30% faster with Nagle write combining, 45% for blobs,
        // but serial calls are 1000 x faster without!

        console.log("echo data:", data, process.memoryUsage())
        var t1 = Date.now()
        var n = 50000
        testParallel(n, data, function(err, ret) {
            t1 = Date.now()
            n = 20000
            testSeries(client, n, data, function(err, ret) {
                console.log("series: %d calls in %d ms", n, Date.now() - t1)
                n = 100000
                testDeliver(client, n, data, function(e) {
                    n = 100000
                    t1 = Date.now()
                    testRetrieve(client, n, data, function(e) {
                        console.log("retrieved %d data in %d ms", n, Date.now() - t1)
                        n = 20000
                        t1 = Date.now()
                        testRetrieve(client, n, buf.slice(0, 1000), function(e) {
                            console.log("retrieved %d 1k Buffers in %d ms", n, Date.now() - t1)
                            n = 20000
                            // note: encoding buffers is linear in buf.length
                            testBuffers(client, n, buf.slice(0, 1000), function(err, ret) {
                                client.call('quit')
                                client.close()
                                console.log("client done", process.memoryUsage())
                            })
                        })
                    })
                })
            })
        })
    })

    function testParallel( n, data, cb ) {
        ndone = 0
        var t1 = Date.now()
        function handleEchoResponse(err, ret) {
            if (++ndone === n) {
                console.log("parallel: %d calls in %d ms", n, Date.now() - t1)
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
                if (err) return cb(err)
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
            console.log("send to endpoint: %d in %d ms", n, Date.now() - t1)
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
}

// 36k calls / sec parallel single process, 16.7k/s series
// 65k calls / sec parallel two processes, 18k/s series (73k/s single int arg parallel, 20k/s series)
// server burst peak is about 300k calls / sec (single client, in parallel, w/o req time, tiny response, meas 100k)
// server throughput is about 100k calls served / sec (multiple clients, in parallel, w/o req time) (cpu caching effects?)

// reply-less localhost calls are 23% faster (addEndpoint vs addHandler), and much faster on the server side
// (1e6 deliveries / sec vs 120k calls / s, not including caller-side data prep and formatting)
// (2e6 deliveries / sec from 2 client processes)
