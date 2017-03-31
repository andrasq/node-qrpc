/**
 * quick little rpc package
 *
 * Copyright (C) 2015-2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict'

var net = require('net')
var StringDecoder = require('string_decoder').StringDecoder
var EventEmitter = require('events').EventEmitter
var mongoid = require('mongoid-js')
var invoke = require('qinvoke').invoke
var interceptCall = require('qinvoke').interceptCall
var QrpcMessage = require('./qrpc-message.js')

var setImmediate = global.setImmediate || process.nextTick

/**
 * Create a qrpc client.
 * Options:
 *   - json_encode      - json stringify
 *   - json_decode      - json parse
*/
function QrpcClient( options ) {
    options = options || {}
    this.chunks = new Array()
    this.callbacks = {}
    this.message = new QrpcMessage({
        v: options.v || 1,
        json_encode: options.json_encode,
        json_decode: options.json_decode,
    })
    if (options.socket) this.setTarget(socket, socket)
}

QrpcClient.prototype = {
    target: null,
    readable: null,
    chunks: null,
    callbacks: null,
    message: null,
    _connected: false,
    _closeFunc: null,

    setTarget:
    function setTarget( target, readable ) {
        var self = this
        var decoder = new StringDecoder()
        if (!target || !readable) throw new Error("setTarget requires both target and readable")
        this.target = target
        this.readable = readable
        this._connected = true
        // TODO: handle pipables with a pipe, not with pause / resume
        if (typeof readable.setEncoding === 'function') readable.setEncoding('utf8')
        if (readable instanceof EventEmitter) {
            var onData = function(chunk) {
                if (typeof chunk !== 'string') chunk = decoder.write(chunk)
                self.chunks.push(chunk)
                if (self.chunks.length > 5) readable.pause()
                self._deliverResponses(function() {
                    readable.resume()
                })
            }
            readable.on('data', onData)

            var onEnd = function() {
                // remote sent a FIN packet
                self._abortAllCalls(new Error("unexpected end on response channel"))
// FIXME: this is an error, no more replies can be received
            }
            readable.on('end', onEnd)

            var onError = function(err) {
                // socket error, close is called immediately after
                self._abortAllCalls(err)
            }
            readable.on('error', onError)

            var onClose = function() {
                if (self._connected) self._abortAllCalls(new Error("unexpected close of reply stream"))
                readable.emit('qrpcDetach')
// FIXME: this is an error, no more replies can be received
            }
            readable.on('close', onClose)

            var onQrpcDetach = function() {
                readable.removeListener('data', onData)
                readable.removeListener('end', onEnd)
                readable.removeListener('error', onError)
                readable.removeListener('close', onClose)
                readable.removeListener('qrpcDetach', onQrpcDetach)
            }
            readable.on('qrpcDetach', onQrpcDetach)
        }
        else {
            setImmediate(function pollResponses( ) {
                var chunk = readable.read(100000)
                if (chunk && chunk.length > 0) {
                    if (typeof chunk !== 'string') chunk = decoder.write(chunk)
                    self.chunks.push(chunk)
                    self._deliverResponses(function() {
                        setImmediate(pollResponses)
                    })
                }
                else if (this._connected) {
                    var poller = setTimeout(pollResponses, 2)
                    if (poller.unref) poller.unref()
                }
            })
        }
        if (target instanceof EventEmitter) {
            var onError = function(err) {
                // sockets do not report write errors in the callback, listen for them
                self._abortAllCalls(err)
            }
            target.on('error', onError)

            var onDrain = function() {
                // write buffer empty
                // TODO: throttle buffering here, or let socket take care of it?
            }
            target.on('drain', onDrain)

            var onClose = function() {
                target.emit('qrpcDetach')
            }
            target.on('close', onClose)

            var onQrpcDetach = function() {
                target.removeListener('error', onError)
                target.removeListener('drain', onDrain)
                target.removeListener('close', onClose)
                target.removeListener('qrpcDetach', onQrpcDetach)
            }
            target.on('qrpcDetach', onQrpcDetach)
        }
        return this
    },

    setCloseFunc:
    function setCloseFunc( closeFunc ) {
        this._closeFunc = closeFunc
        return this
    },

    close:
    function close( callback ) {
        // TODO: deal only with event emitters
        if (this._connected) {
            this._connected = false
            if (this.target instanceof EventEmitter) this.target.emit('qrpcDetach')
            if (this.target.end === 'function') this.target.end()
            if (this.readable instanceof EventEmitter) this.readable.emit('qrpcDetach')
            if (typeof this.readable.end === 'function') this.readable.end()

            // send a FIN packet
            // TODO: check that FIN is sent only after all pending data is written
            if (this._closeFunc) this._closeFunc()
        }
        if (callback) callback()
    },

    call:
    function call( handlerName, data, callback ) {
        var id = mongoid()
        if (typeof handlerName !== 'string') {
            return callback(new Error("handler name must be a string"))
        }
        if (!callback) {
            if (typeof data === 'function') {
                callback = data; data = undefined
                this.callbacks[id] = callback
            }
        } else {
            if (typeof callback !== 'function') throw new Error("callback must be a function")
            this.callbacks[id] = callback
        }
        var envelope = { v: 1, id: id, n: String(handlerName), m: undefined, b: undefined, e: undefined, s: undefined }
        data instanceof Buffer ? envelope.b = data : envelope.m = data
        return this.target.write(this.message.encode(envelope) + "\n")
        // note: writes are buffered, write/socket errors show up at socket.on('error') and not here
    },

    wrap:
    function wrap( object, methods, options ) {
        if (options === undefined && methods && !Array.isArray(methods)) { options = methods ; methods = null }
        if (typeof object !== 'object') throw new Error("not an object")
        if (!options) options = {}
        if (!methods) methods = Object.keys(object)

        var self = this, caller = {}
        for (var i=0; i<methods.length; i++) {
            var method = methods[i]
            var prefix = options.prefix || ''
            caller[method] = (function(method) {
                return interceptCall(method, function(func, selfContext, av) {
                    if (av[0]) av[0] = self.message._extractError(av[0])
                    var cb = (av.length > 0 && typeof av[av.length-1] === 'function') ? av.pop() : null
                    self.call(method, av, function(err, args) {
                        if (cb) err ? cb(err) : invoke(cb, args)
                    })
                })
            })(prefix + method)
        }
        return caller

        function hashToStruct( hash ) {
            // assigning to a function prototype converts the hash to a struct
            // a try-catch block disables optimization, to prevent these statements from being optimized away
            // newer V8 optimizes even with try/catch, so pass arguments to a function too
            function f () {}
            f.prototype = Array.prototype.slice.call(arguments, 0) && hash
            try { return f.prototype } catch (err) { }
        }
    },

    _deliverResponses:
    function _deliverResponses( doneDelivering ) {
        var start = 0, end = 0
        // faster to string concat than to join
        // TODO: concat chunks as they arrive, not here
        var data = this.chunks.length ? this.chunks[0] : ""
        for (var i=1; i<this.chunks.length; i++) data += this.chunks[i]
        this.chunks = new Array()

        // TODO: yield to event loop during delivery, eg repeatUntil(...)
        var message, callback
        while ((end = data.indexOf('\n', start)) >= start) {
            var line = data.slice(start, end)
            start = end + 1
            message = this.message.decode(line)
            if (message.b) { message.m = message.b; message.b = undefined }
            callback = this.callbacks[message.id]
            if (message instanceof Error) {
                // skip lines that fail the json decode
                // TODO: log bad lines
                console.log(new Date().toISOString(), "garbled response, could not decode: ", message)
            }
            else if (callback) {
                if (message.s === QrpcMessage.MSG_LAST) {
                    // end() leaves .m undefined, just close out the request
                    // a server-side empty cb() passes (null, undefined) to invoke client-side callback
                    if (message.e !== undefined || message.m !== undefined) callback(message.e, message.m)
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
}

module.exports = QrpcClient
