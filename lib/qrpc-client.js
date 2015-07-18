'use strict'

var net = require('net')
var mongoid = require('mongoid-js')
var QrpcMessage = require('./qrpc-message.js')

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
            self._deliverResponses(function() {
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

        return socket
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
        this.socket.write(JSON.stringify(message) + "\n", this._noop)
    },

    _noop:
    function _noop( ) {
    },

    _deliverResponses:
    function _deliverResponses( doneDelivering ) {
        var start = 0, end = 0, data = this.data
        var message, callback
        while ((end = data.indexOf('\n', start)) >= start) {
            var line = data.slice(start, end)
            start = end + 1
            message = this._jsonDecode(line)
            callback = this.callbacks[message.id]
            if (message instanceof Error) {
                // let json coding errors be fatal to all
                this._abortAllCalls(err)
                break
            }
            else if (callback) {
                if (message.s === QrpcMessage.MSG_LAST) {
                    // end() leaves .m undefined, just close out the request
                    if (message.m !== undefined) callback(message.e, message.m)
                    delete this.callbacks[message.id]
                }
                else if (message.s === QrpcMessage.MSG_REPLY) {
                    callback(message.e, message.m)
                }
                else /* (message.s === QrpcMessage.MSG_ERROR) */ {
                    callback(message.e, message.m)
                    // no more replies after a server error 
                    delete this.callbacks[message.id]
                }
            }
        }
        if (end > start) this.data = data.slice(end + 1)
        doneDelivering()
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
