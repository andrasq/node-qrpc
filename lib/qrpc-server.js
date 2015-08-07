'use strict'

var net = require('net')
var EventEmitter = require('events').EventEmitter
var QrpcResponse = require('./qrpc-response.js')
var QrpcMessage = require('./qrpc-message.js')

function QrpcServer( options ) {
    this.options = options || {}
    this.handlers = {}
    this.message = new QrpcMessage()
}

var setImmediate = global.setImmediate || process.nextTick

QrpcServer.prototype = {
    options: null,
    handlers: null,
    message: null,
    _port: null,
    _listening: false,
    _listenFunc: null,
    _closeFunc: null,

    addHandler:
    function addHandler( name, func ) {
        if (typeof func !== 'function') throw new Error("handler must be a function")
        this.handlers[name] = func
        return this
    },

    removeHandler:
    function removeHandler( name ) {
        if (this.handlers[name]) delete this.handlers[name]
        return this
    },

    onData:
    function onData( oldData, chunk, writeStream ) {
        var data = oldData ? oldData + chunk.toString() : chunk.toString()
        var calls = new Array()
        data = this._decodeCalls(data, calls)
        this._dispatchCalls(calls, writeStream)
        return data
    },

    setSource:
    function setSource( source, output ) {
        var self = this
        var data = ""
        if (source instanceof EventEmitter) {
            // TODO: if source can pipe then hook to the pipe and process on write()
            // (which would also transparently support throttling the source)
            var dataListener
            source.on('data', dataListener = function(chunk) {
                data = self.onData(data, chunk, output)
            })
            var errorListener
            source.on('error', errorListener = function(err) {
                // TODO: abort/log socket errors
            })
            var closeListener, endListener
            source.on('close', endListener = closeListener = function() {
                source.removeListener('data', dataListener)
                source.removeListener('error', errorListener)
                source.removeListener('close', closeListener)
                source.removeListener('end', endListener)
            })
            source.on('end', endListener)
        }
        else if (typeof source.read === 'function') {
            setImmediate(function pollSource( ) {
                var chunk = source.read()
                if (chunk && chunk.length > 0) {
                    data = self.onData(data, chunk, output)
                    setImmediate(pollSource)
                }
                else {
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
        var self = this
        this._listenFunc(port, function() {
            self._listening = true
            self._port = port
            if (callback) callback()
        })
        return this
    },

    close:
    function close( callback ) {
        if (!this._closeFunc) return this._throwError(new Error("call setCloseFunc first"), callback)
        var self = this
        if (this._listening) {
            this._listening = false
            this._closeFunc(callback)
        }
        else if (callback) callback()
    },

    _dispatchCalls:
    function _dispatchCalls( calls, writable ) {
        var self = this
        var i, msg
        // run up to 40 calls now, the rest after yielding to the event loop
        var ncalls = Math.min(calls.length, 40)
        for (i=0; i<ncalls; i++) {
            msg = calls.shift()
            var version = msg.v
            var handler = self.handlers[msg.n]
            var argv = Array.isArray(msg.m) ? msg.m : [msg.m]
            var res = new QrpcResponse(msg.v, msg.id, writable, this.message)
            msg.body = msg.m
            if (handler) handler(msg, res, function(err, ret) {
                if (err) {
                    // convert the non-serializable Error into a plain object
                    err = self._copyError(err)
                }
                // TODO: delay response if writable buffering is full
                res._send(res.MSG_LAST, err, ret)
            })
        }
        if (calls.length > 0) setImmediate(function() { self._dispatchCalls(calls, writable) })
    },

    _decodeCalls:
    function _decodeCalls( data, calls ) {
        // TODO: v:1 is newline terminated lines, others may not be
        var start = 0, end, line, call
        while ((end = data.indexOf('\n', start)) >= 0) {
            line = data.slice(start, end)
            call = this.message.decode(data.slice(start, end))
            if (call instanceof Error) {
                // TODO: pass decode errors to a configured error-reporting function
                this._logError(call, "error: unable to decode call: " + line)
            }
            else calls.push(call)
            start = end + 1
        }
        return start < data.length ?  data.slice(start) : ""
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

    // convert the error with its non-iterable fields a serializable object
    _copyError:
    function _copyError( err ) {
        var copy = {}
        copy.code = err.code
        copy.message = err.message
        copy.stack = err.stack
        for (var i in err) copy[i] = err[i]
        return copy
    },
}

module.exports = QrpcServer
