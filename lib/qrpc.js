/**
 * quick little rpc package
 *
 * Copyright (C) 2015-2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

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

    QrpcServer: QrpcServer,
    QrpcClient: QrpcClient,

    /*
     * build an rpc server
     */
    createServer:
    function createServer( options, onConnection ) {
        options = options || {}
        if (!onConnection && typeof options === 'function') {
            onConnection = options
            options = {}
        }
        // TODO: if caller closes the socket, still write all responses
        // TODO: must track whether closed, and end()-ing it after all responses have been sent
        // if (options.allowHalfOpen === undefined) options.allowHalfOpen = true
        var server = new this.QrpcServer(options)
        var netServer = net.createServer(options, function(socket) {
            // pipe data to the server for processing, writing responses back to socket
            server.setSource(socket, socket)
            // return the socket to the caller for socket config and tuning
            if (onConnection) onConnection(socket)
        })
        server.setListenFunc(function(port, cb) { netServer.listen(port, cb) })
        server.setCloseFunc(function() { netServer.close() })
        netServer.on('error', function(err) {
            throw err
        })
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
        var socket = net.connect(options)
        var client = new this.QrpcClient(options)
            .setTarget(socket, socket)
            .setCloseFunc(function() { socket.end() })
        // return the socket to the caller for socket config and tuning
        if (callback) socket.once('connect', function() {
            callback(socket)
        })
        return client
    },
}
