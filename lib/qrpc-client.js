'use strict'

var net = require('net')
var mongoid = require('mongoid-js')
var QrpcMessage = require('./qrpc-message.js')

function QrpcClient( options ) {
    this.options = options
    this.chunks = new Array()
}

QrpcClient.prototype = {
    options: null,
    socket: null,
    chunks: null,
    dataLengthCap: 400000,
    callbacks: {},

    setSocket:
    function setSocket( socket ) {
        var self = this
        this.socket = socket
        socket.on('data', function(chunk) {
            self.chunks.push(chunk.toString())
            if (self.chunks.length > 20) socket.pause()
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
        socket.on('drain', function() {
            // write buffer empty
            // TODO: throttle buffering here, or let socket take care of it?
        })
        socket.once('close', function(hadError) {
            self.callbacks = {}
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
        if (typeof handlerName === 'object') {
            // TODO: support options, eg message encoding (json vs http vs csv, etc)
            handlerName = handlerName.handlerName
        }
        if (!callback && typeof data === 'function') {
            callback = data
            data = undefined
        }
        if (!handlerName) return callback(new Error("missing handler name"))
        if (callback) {
            if (typeof callback !== 'function') return callback(new Error("callback must be a function"))
            this.callbacks[id] = callback
        }
        // var envelope = { v: 1, id: id, n: handlerName, m: data }
        // this.socket.write(JSON.stringify(envelope) + "\n")
        // 4% faster to omit the envelope and encode just the payload
        this.socket.write('{"v":1,"id":"' + id + '","n":"' + handlerName + '","m":' + JSON.stringify(data) + '}\n')
        // note: writes are buffered, write/socket errors show up at socket.on('error') and not here
    },

    _deliverResponses:
    function _deliverResponses( doneDelivering ) {
        var start = 0, end = 0, data = this.chunks.splice(0).join('')
        // TODO: decode chunks more cleverly than by concatenating all of them
        // TODO: decode length-counted binary responses too, not just newline-delimited text
        var message, callback
        while ((end = data.indexOf('\n', start)) >= start) {
            var line = data.slice(start, end)
            start = end + 1
            message = this._decodeResponse(line)
            callback = this.callbacks[message.id]
            if (message instanceof Error) {
                // skip lines that fail the json decode
                // TODO: log bad lines
                console.log(new Date().toISOString(), "garbled response, could not decode")
            }
            else if (callback) {
                if (message.s === QrpcMessage.MSG_LAST) {
                    // end() leaves .m undefined, just close out the request
                    if (message.e || message.m !== undefined) callback(message.e, message.m)
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
        if (start < data.length) this.chunks.unshift(data.slice(start))
        doneDelivering()
    },

    // connection error, send it to all waiting callbacks and clear callbacks
    _abortAllCalls:
    function _abortAllCalls( err ) {
        for (var i in this.callbacks) {
            var cb = this.callbacks[i]
            delete this.callbacks[i]
            cb(err)
        }
    },

    _decodeResponse:
    function _decodeResponse( str ) {
        try {
            var msg = JSON.parse(str)
            if (msg.e) msg.e = this._extractError(msg.e)
            return msg
        }
        catch (err) { return err }
    },

    // convert the object back into an Error instance
    _extractError:
    function _extractError( obj ) {
        var err = new Error()
        delete err.code
        delete err.message
        delete err.stack
        for (var i in obj) err[i] = obj[i]
        return err
    },
}

module.exports = QrpcClient
