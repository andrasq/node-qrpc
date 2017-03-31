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
var QrpcResponse = require('./qrpc-response.js')
var QrpcMessage = require('./qrpc-message.js')
var invoke2 = require('qinvoke').invoke2

/**
 * Create a qrpc server.
 * Options:
 *   - json_encode      - json stringify
 *   - json_decode      - json parse
 */
function QrpcServer( options ) {
    options = options || {}
    this.handlers = {}                  // handler that send a response
    this.endpoints = {}                 // handlers that do not send a response
    this.message = new QrpcMessage({    // message coder
        json_encode: options.json_encode,
        json_decode: options.json_decode,
    })
    this.fakeWritable = { write: function(s, cb) { cb() } }
}

var setImmediate = global.setImmediate || process.nextTick

QrpcServer.prototype = {
    handlers: null,
    endpoints: null,
    message: null,
    fakeWritable: null,
    _port: null,
    _listening: false,
    _closed: false,                     // default to not closed, for testing
    _listenFunc: null,
    _closeFunc: null,

    addHandler:
    function addHandler( name, func ) {
        if (typeof func !== 'function') throw new Error("handler must be a function")
        this.handlers[name] = func
        return this
    },

    addHandlerNoResponse:
    function addHandlerNoResponse( name, func ) {
        if (typeof func !== 'function') throw new Error("handler must be a function")
        this.endpoints[name] = func
        return this
        // FIXME: caller must *not* provide a callback when sending to an endpoint,
        // else will leak the callback structure for the call will never be closed
        // Would be better to use a different method
    },

    addEndpoint: null,

    removeHandler:
    function removeHandler( name ) {
        if (this.handlers[name]) delete this.handlers[name]
        if (this.endpoints[name]) delete this.endpoints[name]
        return this
    },

    onData:
    function onData( oldData, chunk, writeStream ) {
        var data = oldData ? oldData + chunk : chunk;
        if (data) {
            var calls = new Array()
            data = this._decodeCalls(data, calls)
            this._dispatchCalls(calls, writeStream)
        }
        return data
    },

    setSource:
    function setSource( source, output ) {
        var self = this
        var data = ""
        var decoder = new StringDecoder()

        if (output instanceof EventEmitter) {
            var onError = function(err) {
                console.log(new Date().toISOString(), "qrpc server error writing response:", err.message)
            }
            output.on('error', onError)

            var onClose = function() {
                output.removeListener('error', onError)
                output.removeListener('close', onClose)
            }
            output.on('close', onClose)
        }

        if (typeof source.setEncoding === 'function') {
            // ask for utf8 chunks that will not split up multi-byte chars
            source.setEncoding('utf8')
            data = ""
        }
        if (source instanceof EventEmitter) {
            // TODO: if source can pipe then hook to the pipe and process on write()
            // (which would also transparently support throttling the source)
            var onData = function(chunk) {
                if (typeof chunk !== 'string') chunk = decoder.write(chunk)
                data = self.onData(data, chunk, output)
            }
            source.on('data', onData)

            var onError = function(err) {
                // TODO: abort/log socket errors
                source.emit('qrpcDetach')
            }
            source.on('error', onError)

            var onClose = function() {
                source.emit('qrpcDetach')
            }
            source.on('close', onClose)

            var onEnd = function() {
                self.onData(data, decoder.end(), output)
                source.emit('qrpcDetach')
            }
            source.on('end', onEnd)

            var onQrpcDetach = function() {
                source.removeListener('data', onData)
                source.removeListener('error', onError)
                source.removeListener('close', onClose)
                source.removeListener('end', onEnd)
                source.removeListener('qrpcDetach', onQrpcDetach)
            }
            source.on('qrpcDetach', onQrpcDetach)

        }
        else if (typeof source.read === 'function') {
            setImmediate(function pollSource( ) {
                var chunk = source.read(100000)
                if (chunk && chunk.length > 0) {
                    if (typeof chunk !== 'string') chunk = decoder.write(chunk)
                    data = self.onData(data, chunk, output)
                    setImmediate(pollSource)
                }
                else if (!self._closed) {
                    var poller = setTimeout(pollSource, 2)
                    if (poller.unref) poller.unref()
                }
            })
        }
        else return this._throwError(new Error("unable to use the source"))
        return self
    },

    pipe:
    function pipeFromTo( sourceStream, outputStream ) {
        // WRITEME: variant of setSource, pipe source to self and write results to output
        // since a pipe reads just one source and writes just one output,
        // a server cannot use the streams pipe() call and still talk over multiple sockets
        this.setSource(sourceStream, outputStream)
    },

    setListenFunc:
    function setListenFunc( listenFunc ) {
        this._listenFunc = listenFunc
        return this
    },

    setCloseFunc:
    function setCloseFunc( closeFunc ) {
        this._closeFunc = closeFunc
        return this
    },

    listen:
    function listen( port, callback ) {
        // TODO: support full set of net.listen params: port, host, backlog, cb
        if (!this._listenFunc) return this._throwError(new Error("call setListenFunc first"), callback)
        if (this._listening) return this._throwError(new Error("already listening"), callback)
        var self = this
        this._listenFunc(port, function() {
            self._listening = true
            self._port = port
            if (callback) callback()
        })
        self._closed = false
        return this
    },

    close:
    function close( callback ) {
        if (!this._closeFunc) return this._throwError(new Error("call setCloseFunc first"), callback)
        var self = this
        if (this._listening) {
            this._listening = false
            this._closeFunc()
        }
        self._closed = true
        if (callback) callback()
    },

    wrap:
    function wrap( object, methods, options ) {
        if (options === undefined && methods && !Array.isArray(methods)) { options = methods ; methods = null }
        if (typeof object !== 'object') throw new Error("not an object")
        if (!options) options = {}
        if (!methods) methods = Object.keys(object)

        var self = this, prefix = options.prefix || ""
        for (var i=0; i<methods.length; i++) {
            if (typeof object[methods[i]] === 'function') {
                var name = prefix + methods[i]
                self.addHandler(name, wrapMethod(object, methods[i]))
            }
        }

        function wrapMethod( object, methodName ) {
            return function(req, res, next) {
                var av = req.b ? [req.b] : req.m
                av.push(function() {
                    // method callback will be re-invoked on the client
                    var av = new Array(arguments.length)
                    for (var i=0; i<av.length; i++) av[i] = arguments[i]
                    if (av[0]) av[0] = self.message._copyError(av[0])
                    next(null, av)
                })
                invoke2(object, methodName, av)
            }
        }
    },

    _runHandler:
    function _runHandler( handler, req, res, next ) {
        try { handler(req, res, next) }
        catch (err) { next(err) }
    },

    _dispatchCalls:
    function _dispatchCalls( calls, writable ) {
        var self = this
        var i, msg
        // run up to 10 calls now, the rest after yielding to the event loop
        var ncalls = calls.length >= 10 ? 10 : calls.length
        for (i=0; i<ncalls; i++) {
            msg = calls.shift()
            var version = msg.v
            var handler, endpoint
            var argv = Array.isArray(msg.m) ? msg.m : [msg.m]
            if ((handler = self.handlers[msg.n])) {
                // handlers send a response
                var res = new QrpcResponse(msg.v, msg.id, writable, this.message)
                self._runHandler(handler, msg, res, function(err, ret) {
                    // TODO: delay response if writable buffering is full
                    // do not return (undefined, undefined), that would bypass the callback
                    if (err === undefined) err = null
                    res._send(res.MSG_LAST, err, ret)
                })
            }
            else if (endpoint = self.endpoints[msg.n]) {
                // endpoints process the message, but do not send a response
                var res = new QrpcResponse(msg.v, msg.id, this.fakeWritable, this.message)
                self._runHandler(endpoint, msg, res, function() {
                    // endpoints are called for their side-effects, they do not return data
                    // think reporting, stats delivery
                })
            }
            else {
                // no handler for call, return an error response
                var res = new QrpcResponse(msg.v, msg.id, writable, this.message)
                var err = new Error(msg.n + ": no handler")
                res._send(res.MSG_LAST, err)
                // TODO: log it?
            }
        }
        if (calls.length > 0) setImmediate(function() { self._dispatchCalls(calls, writable) })
    },

    _decodeCalls:
    function _decodeCalls( data, calls ) {
        // TODO: v:1 is newline terminated lines, others may not be
        var start = 0, end, line, call
        while ((end = data.indexOf('\n', start)) >= 0) {
            line = data.slice(start, end)
            call = this.message.decode(line)
            if (call.b) { call.m = call.b; call.b = undefined }
            if (call instanceof Error) {
                // TODO: pass decode errors to a configured error-reporting function
                this._logError(call, "error: unable to decode call: " + line)
            }
            else calls.push(call)
            start = end + 1
        }
        return start < data.length ?  data.slice(start) : ""
    },

    _indexOf:
    function _indexOf( buf, ch, start ) {
        start = start || 0
        var i, c = ch.charCodeAt(0)
        for (i=start; i<buf.length; i++) if (buf[i] === c) return i
        return -1
    },

    // return an error via the callback, or throw the error if no callback given
    _throwError:
    function _throwError( err, callback ) {
        if (callback) callback(err)
        else throw err
    },

    _logError:
    function _logError( err, message ) {
        if (err) console.log(new Date().toISOString(), message)
    },
}

// alias the original 0.8 name
QrpcServer.prototype.addEndpoint = QrpcServer.prototype.addHandlerNoResponse

module.exports = QrpcServer
