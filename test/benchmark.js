// this script is not part of the unit tests
if (process.argv[1] && process.argv[1].indexOf('unit') > 0) return

cluster = require('cluster')
qrpc = require('../index')

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
    server = qrpc.createServer()
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
            for (var i in data) res.write(data[i])
            res.end()
        }
        else res.end(data)
    })
}

if (isWorker) {
    var client = qrpc.connect({port: 1337}, function() {
        data = 1 // 43k calls / sec
        data = [1, 2, 3, 4, 5]
        data = {a:1, b:2, c:3, d:4, e:5} // 39k calls / sec

        console.log("test data:", data, process.memoryUsage())
        testParallel(50000, function(err, ret) {
            testSeries(20000, function(err, ret) {
                client.call('quit')
                client.close()
                console.log("client done", process.memoryUsage())
            })
        })
    })

    function testParallel( n, cb ) {
        nreplies = 0
        var t1 = Date.now()
        function handleEchoResponse(err, ret) {
            nreplies += 1
// console.log("echo", ret)
// process.stdout.write(".")
            if (nreplies === n) {
                console.log("parallel: %d calls in %d ms", n, Date.now() - t1)
                cb()
            }
        }
        for (i=0; i<n; i++) {
            client.call('echo', data, handleEchoResponse)
        }
    }

    function testSeries( n, cb ) {
        ncalls = 0
        nreplies = 0
        var t1 = Date.now()
        function handleEchoResponse(err, ret) {
//process.stdout.write(err ? "X" : ".")
            nreplies += 1
            if (nreplies < n) {
                if (nreplies % 40 === 0) setImmediate(oneCall)
                else oneCall()
            }
            else {
                console.log("series: %d calls in %d ms", n, Date.now() - t1)
                cb()
            }
        }
        function oneCall() {
            ncalls += 1
            client.call('echo', data, handleEchoResponse)
        }
        oneCall()
    }
}

// 36k calls / sec parallel single process, 16.7k/s series
// 65k calls / sec parallel two processes, 18k/s series (73k/s single int arg parallel, 20k/s series)
// server burst peak is about 300k calls / sec (single client, in parallel, w/o req time, tiny response, meas 100k)
// server throughput is about 100k calls served / sec (multiple clients, in parallel, w/o req time) (cpu caching effects?)
