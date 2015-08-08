'use strict'

var net = require('net')
var EventEmitter = require('events').EventEmitter
var mongoid = require('mongoid-js')
var QrpcMessage = require('./qrpc-message.js')

var setImmediate = global.setImmediate || process.nextTick

function QrpcClient( options ) {
    this.options = options || {}
    // Options TBD.
    this.chunks = new Array()
    this.callbacks = {}
    this.message = new QrpcMessage({v: this.options.v || -1})
    if (this.options.socket) this.setTarget(socket, socket)
}

QrpcClient.prototype = {
    options: null,
    target: null,
    chunks: null,
    callbacks: null,
    message: null,

    setTarget:
    function setTarget( target, readable ) {
        var self = this
        this.target = target
        // TODO: fixme: this implementation requires target and readable to be event emitters
        // TODO: handle pipables with a pipe, not with pause / resume
        if (readable instanceof EventEmitter) {
            readable.on('data', function(chunk) {
                self.chunks.push(chunk.toString())
                if (self.chunks.length > 20) readable.pause()
                self._deliverResponses(function() {
                    readable.resume()
                })
            })
            readable.on('end', function() {
                // remote sent a FIN packet
                self._abortAllCalls(new Error("unexpected end"))
            })
            readable.on('error', function(err) {
                // socket error, close is called immediately after
                self._abortAllCalls(err)
            })
        }
        else {
            setImmediate(function pollResponses( ) {
                var chunk = readable.read(100000)
                if (chunk && chunk.length > 0) {
                    self.chunks.push(chunk.toString())
                    self._deliverResponses(function() {
                        setImmediate(pollResponses)
                    })
                }
                else {
                    var poller = setTimeout(pollResponses, 2)
                    if (poller.unref) poller.unref()
                }
            })
        }
        if (target instanceof EventEmitter) {
            target.on('error', function(err) {
                // sockets do not report write errors in the callback, listen for them
                self._abortAllCalls(err)
            })
            target.on('drain', function() {
                // write buffer empty
                // TODO: throttle buffering here, or let socket take care of it?
            })
        }
        return this
    },

    close:
    function close( ) {
        // send a FIN packet
        // TODO: check that FIN is sent after all pending data is written
        if (typeof this.target.end === 'function') this.target.end()
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
        var envelope = { v: 1, id: id, n: handlerName, m: data }
        return this.target.write(this.message.encode(envelope) + "\n")
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
            message = this.message.decode(line)
            callback = this.callbacks[message.id]
            if (message instanceof Error) {
                // skip lines that fail the json decode
                // TODO: log bad lines
                console.log(new Date().toISOString(), "garbled response, could not decode")
            }
            else if (callback) {
                if (message.e) message.e = this._extractError(message.e)
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
        if (start < data.length) this.chunks.unshift(start > 0 ? data.slice(start) : data)
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

    // convert the object back into an Error instance
    _extractError:
    function _extractError( obj ) {
        var err = new Error()
        // FIXME: retain non-enumerable status of std error fields (and fix unit tests)
        // err.code = err.message = err.stack = undefined
        delete err.code
        delete err.message
        delete err.stack
        for (var i in obj) err[i] = obj[i]
        return err
    },
}

module.exports = QrpcClient
