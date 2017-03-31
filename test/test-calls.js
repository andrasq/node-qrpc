/**
 * quick little rpc package
 *
 * Copyright (C) 2015-2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

qrpc = require('../index')

module.exports = {
    beforeEach: function(done) {
        var self = this
        self.server = qrpc.createServer(function(socket) {
            socket.setNoDelay()
        })
        self.server.listen(1337, function(err) {
            if (err) throw err
            self.client = qrpc.connect({port: 1337}, function(socket) {
                self.socket = socket
                socket.setNoDelay()
                done()
            })
        })
    },

    afterEach: function(done) {
        var self = this
        self.client.close(function() {
            self.server.close(function() {
                done()
            })
        })
    },

    'handler': {
        'should invoke method': function(t) {
            return t.done()
            var self = this
            var pingCount = 0
            self.server.addHandler('ping', function(req, res, next) {
                pingCount += 1
                next()
            })
            for (var i=0; i<3; i++) self.client.call('ping', function(err, ret) {
            })
            setTimeout(function() {
                t.equal(pingCount, 3)
                t.done()
            }, 5)
        },

        'next() should return response': function(t) {
            var self = this
            var echoCount = 0
            self.server.addHandler('echo', function(req, res, next) {
                echoCount += 1
                next(null, req.m)
            })
            var data = {a:1, b:"two", c:[1,2,3]}
            for (var i=0; i<3; i++) self.client.call('echo', data, function(err, ret) {
                t.ifError(err)
                t.deepEqual(ret, data)
            })
            setTimeout(function() {
                t.equal(echoCount, 3)
                t.done()
            }, 5)
        },

        'addHandlerNoResponse should not invoke the callback': function(t) {
            var self = this
            var sendCount = 0
            self.server.addHandlerNoResponse('send', function(req, res, next) {
                sendCount += 1
                next(null, 1)
            })
            t.expect(1)
            for (var i=0; i<3; i++) self.client.call('send', function(err, ret) {
                t.fail()
            })
            setTimeout(function(){
                t.equal(sendCount, 3)
                t.done()
            }, 5)
        },
    },

    'data passing': {
        before: function(done) {
            this.echoTest = function(t, data, cb) {
                this.server.addHandler('echo', function(req, res, next) {
                    t.deepEqual(req.m, data)
                    res.end(data)
                })
                t.expect(4)
                this.client.call('echo', data, function(err, ret) {
                    t.ifError(err)
                    t.equal(typeof ret, typeof data)
                    t.deepEqual(ret, data)
                    cb()
                })
            }
            done()
        },

        'should send and receive number as number': function(t) {
            var data = 1234321
            this.echoTest(t, data, function() {
                t.done()
            })
        },

        'should send and receive string as string': function(t) {
            var data = "test string"
            this.echoTest(t, data, function() {
                t.done()
            })
        },

        'should send and receive object as object': function(t) {
            var data = { a: 1, b: 2.5, c: "three", d: [1,2,3], e: { f: 1 } }
            this.echoTest(t, data, function() {
                t.done()
            })
        },

        'should send and receive Buffer as Buffer': function(t) {
            var data = new Buffer(256)
            for (var i=0; i<256; i++) data[i] = i
            this.echoTest(t, data, function() {
                t.done()
            })
        },

        'should return empty response': function(t) {
            var self = this
            var pingCount = 0
            self.server.addHandler('ping', function(req, res, next) {
                pingCount += 1
                next()
            })
            self.client.call('ping', {}, function(err, ret) {
                t.ifError(err)
                t.equal(ret, undefined)
                t.equal(pingCount, 1)
                t.done()
            })
        },

        'should send falsy message and receive falsy reply': function(t) {
            var self = this
            messages = []
            self.server.addHandler('echo', function(req, res, next) {
                messages.push(req.m)
                next(undefined, req.m)
            })
            self.client.call('echo', function(err, ret) {
                t.ifError(err)
                t.strictEqual(messages[0], undefined)
                t.strictEqual(ret, undefined)
                self.client.call('echo', "", function(err, ret) {
                    t.ifError(err)
                    t.strictEqual(messages[1], "")
                    t.strictEqual(ret, "")
                    self.client.call('echo', null, function(err, ret) {
                        t.ifError(err)
                        t.equal(messages[2], null)
                        t.equal(ret, null)
                        self.client.call('echo', 0, function(err, ret) {
                            t.ifError(err)
                            t.equal(messages[3], 0)
                            t.equal(ret, 0)
                            t.done()
                        })
                    })
                })
            })
        },
    },

    'flow control': {
        'next() should return data and close the call': function(t) {
            var data = Math.random() * 0x1000000 >>> 0
            this.server.addHandler('ping', function(req, res, next) {
                next(null, data)
                res.write(1)
                res.end(2)
            })
            var received = []
            this.client.call('ping', function(err, ret) {
                t.ifError(err)
                received.push(ret)
                if (received.length > 1) t.fail()
            })
            setTimeout(function() { t.done() }, 2)
        },

        'next() should return error': function(t) {
            var data = new Error(Math.random() * 0x1000000 >>> 0)
            this.server.addHandler('ping', function(req, res, next) {
                next(data)
            })
            this.client.call('ping', function(err, ret) {
                t.assert(err instanceof Error)
                // Error objects are not iterable, cannot be compared with deepEqual
                t.equal(err.message, data.message)
                t.equal(err.stack, data.stack)
                t.done()
            })
        },

        'end() should return data': function(t) {
            var data = Math.random() * 0x1000000 >>> 0
            this.server.addHandler('ping', function(req, res, next) {
                res.end(data)
            })
            this.client.call('ping', function(err, ret) {
                t.ifError(err)
                t.deepEqual(ret, data)
                t.done()
            })
        },

        'end() should return just one data item': function(t) {
            var data = Math.random() * 0x1000000 >>> 0
            this.server.addHandler('ping', function(req, res, next) {
                if (res.configure) res.configure({reportError: false})     // suppress "send after end()" warning
                res.end(data)
                res.write(1)
                res.end(2)
            })
            var i, received = []
            this.client.call('ping', function(err, ret) {
                t.ifError(err)
                t.deepEqual(ret, data)
                received.push(ret)
                if (received.length > 1) t.fail()
            })
            setTimeout(function(){ t.done() }, 2)
        },

        'write() should return data': function(t) {
            var data = Math.random() * 0x1000000 >>> 0
            this.server.addHandler('ping', function(req, res, next) {
                res.write(data)
                res.end()
            })
            this.client.call('ping', function(err, ret) {
                t.ifError(err)
                t.deepEqual(ret, data)
                t.done()
            })
        },

        'write should return multiple data items': function(t) {
            var data = Math.random() * 0x1000000 >>> 0
            this.server.addHandler('ping', function(req, res, next) {
                res.write(data)
                res.write(data)
                res.write(data)
                res.end()
            })
            var i, received = []
            this.client.call('ping', function(err, ret) {
                t.ifError(err)
                t.deepEqual(ret, data)
                received.push(ret)
                if (received.length === 3) {
                    t.done()
                }
            })
        }
    },
}
