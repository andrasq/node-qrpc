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
                t.ifError()
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
console.log("AR: unexpected response!!", err.stack, ret)
                t.fail()
            })
            setTimeout(function(){
                t.equal(sendCount, 3)
                t.done()
            }, 5)
        },
    },
}
