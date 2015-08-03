

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

    /*
     * build an rpc server
     */
    createServer:
    function createServer( options, callback ) {
        if (!callback && typeof options === 'function') {
            callback = options
            options = {}
        }
        var server = new QrpcServer(options)
        var netServer = net.createServer(options, function(socket) {
            server.setSocket(socket)
            // return the socket to the caller for socket config and tuning
            if (callback) callback(socket)
        })
        server.setServer(netServer)
        return server
    },

    /*
     * build an rpc client
     */
    connect:
    function connect( port, host, callback ) {
        if (!callback && typeof host === 'function') {
            callback = host
            host = undefined
        }
        var options = (typeof port === 'object') ? port : { port: port, host: host }
        // try to handle pending replies before acting on server disconnect
        if (options.allowHalfOpen === undefined) options.allowHalfOpen = true
        var client = new QrpcClient(options)
        var socket = net.connect(options)
        client.setSocket(socket)
        // return the socket to the caller for socket config and tuning
        if (callback) socket.once('connect', function() {
            callback(socket)
        })
        return client
    },
}
