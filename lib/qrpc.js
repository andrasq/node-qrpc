'use strict'

var QrpcServer = require('.//qrpc-server.js')
var QrpcClient = require('./qrpc-client.js')
var QrpcResponse = require('./qrpc-response.js')

function Qrpc( options ) {
    this.options = options || {}
    this.data = ""
    this.dataLengthCap = 400000
    this.callbacks = {}
}

Qrpc.MSG_REPLY = 'ok'
Qrpc.MSG_LAST = 'eot'
Qrpc.MSG_ERROR = 'err'

Qrpc.prototype = {
    createServer:
    function createServer( options, callback ) {
        callback = callback || function() {}
        var server = new QrpcServer(options)
        server.createServer(options, function(svr) {
            if (callback) callback(server)
        })
        return server
    },

    connect:
    function connect( port, host, callback ) {
        if (!callback && typeof host === 'function') {
            callback = host
            host = undefined
        }
        var options = (typeof port === 'object') ? port : { port: port, host: host }
        var client = new QrpcClient(options)
        // we pass the options to the object, not to connect
        client.connect(function() {
            if (callback) callback()
        })
        return client
    },
}


// exports a singleton
module.exports = new Qrpc()
