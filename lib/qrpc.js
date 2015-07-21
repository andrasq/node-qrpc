

'use strict'

var net = require('net')

var QrpcMessage = require('./qrpc-message.js')
var QrpcServer = require('./qrpc-server.js')
var QrpcClient = require('./qrpc-client.js')
var QrpcResponse = require('./qrpc-response.js')

/*
 * the qrpc package
 */
module.exports = {
    MSG_REPLY: QrpcMessage.MSG_REPLY,
    MSG_LAST: QrpcMessage.MSG_LAST,
    MSG_ERROR: QrpcMessage.MSG_ERROR,

    createServer:
    function createServer( options, callback ) {
        if (!callback && typeof options === 'function') {
            callback = options
            options = {}
        }
        var qrpcServer = new QrpcServer(options)
        var netServer = net.createServer(options, function(socket) {
            qrpcServer.setSocket(socket)
            // FIXME: do we really want to expose the socket to the caller?
            if (callback) callback(socket)
        })
        qrpcServer.setServer(netServer)
        return qrpcServer
    },

    connect:
    function connect( port, host, callback ) {
        if (!callback && typeof host === 'function') {
            callback = host
            host = undefined
        }
        var options = (typeof port === 'object') ? port : { port: port, host: host }
        var client = new QrpcClient(options)
        // we pass the options to the object, not to connect()
        client.connect(function() {
            if (callback) callback()
        })
        return client
    },
}
