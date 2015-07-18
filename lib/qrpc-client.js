'use strict'

var mongoid = require('mongoid')
var net = require('net')

function QrpcClient( options ) {
    this.options = options
}

QrpcClient.prototype = {
    options: null,
    socket: null,
    data: "",
    dataLengthCap: 400000,
    callbacks: {},

    connect:
    function connect( connectListener ) {
        var options = {
            host: this.options.host,
            port: this.options.port,
            family: this.options.family
        }
        var self = this
        var socket = net.connect(options)
        self.socket = socket

        if (typeof self.options.set === 'object') {
            var set = self.options.set
            if (set.noDelay) socket.setNoDelay(set.noDelay)
            if (set.keepAlive) socket.setKeepAlive()
            if (set.allowHalfOpen !== undefined) socket.allowHalfOpen(set.allowHalfOpen)
            if (set.timeout) socket.setTimeout(set.timeout, function() {
                // TODO: how to act on timeout callback?
            })
            // TODO: ?? expose all socket config settings?
            // if (set.encoding !== undefined) socket.setEncoding(set.encoding) 
        }

        socket.on('connect', function(){
            if (connectListener) connectListener()
        })
        socket.on('data', function(chunk) {
            if (!self.data) self.data = chunk.toString()
            else self.data += chunk.toString()
            if (self.data.length > self.dataLengthCap && self.data.indexOf('\n') >= 0) socket.pause()
            self._sendResponse(function() {
                socket.resume()
            })
        })
        socket.on('end', function() {
            // remote sent a FIN packet
        })
        socket.on('error', function(err) {
            // socket error, close is called immediately after
            self._abortAllCalls(err)
        })
        socket.on('close', function(hadError) {
            self.callbacks = {}
        })
        socket.on('drain', function() {
            // write buffer empty
        })

        socket.once('error', function(err) {
            self._abortAllCalls(err)
        })
    },

    close:
    function close( ) {
        var socket = this.socket
        // send a FIN packet
        // TODO: check that FIN is sent after all pending data is written
        this.socket.end()
    },

    destroy:
    function destroy( ) {
        this.socket.destroy()
    },

    call:
    function call( handlerName, data, callback ) {
        var id = mongoid()
        var message = {
            v: 1,
            id: id,
            n: handlerName,
            m: data
        }
        this.callbacks[id] = callback
        this.socket.write(JSON.stringify(message) + "\n")
    },

    _sendResponse:
    function _sendResponse( callback ) {
        var start = 0, end = 0;
        while ((end = this.data.indexOf('\n')) >= start) {
            var line = this.data.slice(start, end)
            start = end + 1
            var msg = this._jsonDecode(line)
            // let json coding errors be fatal to all
            if (msg instanceof Error) this._abortAllCalls(err)
            var callback = this.callbacks[msg.id]
            if (callback) callback(msg.e, msg.m)
        }
        if (end > start) this.data = this.data.slice(end + 1)
    },

    // connection error, send it to all waiting callbacks and clear callbacks
    _abortAllCalls:
    function _abortAllCalls( err ) {
        for (var i in this.callbacks) {
            this.callbacks[i](err)
        }
        this.callbacks = {}
    },

    _jsonDecode:
    function _jsonDecode( str ) {
        try { return JSON.parse(str) }
        catch (err) { return err }
    },

}

module.exports = QrpcClient
