// this script is not part of the unit tests
if (process.argv[1] && process.argv[1].indexOf('unit') > 0) return

cluster = require('cluster')
qrpc = require('../index')

isCluster = false
if (!isCluster) {
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
    if (1) server.listen(1337, function() {
        console.log("rpc: listening on 1337")
    })
    server.addHandler('quit', function(req, res, next) {
console.log("AR: quit")
        res.end()
        server.close()
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

        testParallel(20000, function(err, ret) {
            testSeries(20000, function(err, ret) {
                client.call('quit')
                client.close()
// cluster master does not exit until worker does too? (even though disconnected)
process.exit()
            })
        })
    })

    function testParallel( n, cb ) {
        ncalls = 0
        nreplies = 0
        t1 = Date.now()
        function handleEchoResponse(err, ret) {
            nreplies += 1
// console.log("echo", ret)
// process.stdout.write(".")
            if (nreplies === n) {
                console.log("parallel: %d calls in %d ms", ncalls, Date.now() - t1)
                cb()
            }
        }
        for (i=0; i<n; i++) {
            ncalls += 1
            client.call('echo', data, handleEchoResponse)
        }
    }

    function testSeries( n, cb ) {
        ncalls = 0
        nreplies = 0
        t1 = Date.now()
        function handleEchoResponse(err, ret) {
//process.stdout.write(err ? "X" : ".")
            nreplies += 1
            if (nreplies < n) {
                if (nreplies % 10 === 0) setImmediate(oneCall)
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

// 36k calls / sec single process parallel, 16.7k/s series
// 64.7k calls / sec two processes parallel obj[5] arg, 17.6k/s series (71k/s single int arg)

// 36k/s same-process (20k calls), 60k/s inter-process; 80k/s responses at 5+1x response rate
// profile shows json parse as 60+% of time
