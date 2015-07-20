'use strict'

var net = require('net')
var QrpcResponse = require('./qrpc-response.js')

function QrpcServer( options ) {
    this.options = options || {}
}

QrpcServer.prototype = {
    options: {},
    handlers: {},
    server: null,
    data: null,
    _port: null,
    _listening: false,

    addHandler:
    function addHandler( name, func ) {
        if (typeof func !== 'function') throw new Error("handler must be a function")
        this.handlers[name] = func
    },

    removeHandler:
    function removeHandler( name ) {
        if (this.handlers[name]) delete this.handlers[name]
    },

    createServer:
    function createServer( options, connectListener ) {
        var self = this
        if (!connectListener && typeof options === 'function') {
            connectListener = options
            options = {}
        }
        options = options || {}
        var server = net.createServer(options, function(socket) {
            var data = null
            socket.on('data', function(chunk) {
                data = data ? data + chunk.toString() : chunk.toString()
                var calls = new Array()
                data = self._decodeCalls(data, calls)
                self._dispatchCalls(calls, socket)
            })
            socket.on('error', function(err) {
                // TODO: socket died, now what?
                if (!socket.destroyed) socket.destroy()
            })
            // FIXME: do we really want to expose the socket to the caller?
            if (connectListener) connectListener(socket)
        })
        server.once('error', function(err) {
            return self._throwError(err)
        })
        server.once('close', function() {
        })
        self.server = server
        return server
    },

    listen:
    function listen( port, callback ) {
        if (!port) return this._throwError(new Error("port required"), callback)
        if (!this.server) return this._throwError(new Error("call createServer first"), callback)
        if (this._listening) return this._throwError(new Error("already listening on port " + this._port))
        var self = this
        this.server.listen(port, function() {
            self._listening = false
            self._port = port
            if (callback) callback()
        })
    },

    close:
    function close( callback ) {
        if (!this.server) return this._throwError(new Error("call createServer first"), callback)
        if (this._listening) {
            // tolerate duplicate close()
            this._listening = false
            this.server.close(callback)
        }
        else if (callback) return callback()
    },

    _dispatchCalls:
    function _dispatchCalls( calls, writable ) {
        var self = this
        var i, msg
        for (i in calls) {
            msg = calls[i]
            var version = msg.v
            var handler = self.handlers[msg.n]
            var argv = Array.isArray(msg.m) ? msg.m : [msg.m]
            var res = new QrpcResponse(msg.v, msg.id, writable)
            msg.body = msg.m
            if (handler) handler(msg, res, function(err, ret) {
                if (err) {
                    // convert the non-serializable Error into a plain object
                    err = this._copyError(err)
                }
                // TODO: delay response if writable buffering is full
                res._send(Qrpc.MSG_LAST, err, ret)
            })
        }
    },

    _decodeCalls:
    function _decodeCalls( data, calls ) {
        // TODO: v:1 is newline terminated lines, others may not be
        var start = 0, end, line, call
        while ((end = data.indexOf('\n', start)) >= 0) {
            line = data.slice(start, end)
            call = this._decodeCall(data.slice(start, end))
            if (call instanceof Error) {
                // TODO: pass decode errors to a configured error-reporting function
                this._logError(call, "error: unable to decode call: " + line)
            }
            else calls.push(call)
            start = end + 1
        }
        return start < data.length ?  data.slice(start) : ""
    },

    // decode a newline terminated call spec (json bundle)
    _decodeCall:
    function _decodeCall( line ) {
        if (line.indexOf('{"v":1,') === 0) {
            try { return JSON.parse(line) }
            catch (err) {
                if (line.indexOf(',"m":undefined') > 0) {
                    // JSON cannot pass undefined values, fix them here
                    line = line.replace(/,"m":undefined/, '')
                    return this._decodeCall(line)
                }
                return err
            }
        }
        else return new Error("unsupported call format")
    },

    _sendResponse:
    function _sendResponse( version, writable, response ) {
        if (version === 1) {
            writable.write(JSON.stringify(response) + "\n", self._logError)
        }
        else self._logError(new Error("unknown protocol version " + version))
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
        copy = {}
        copy.code = err.code
        copy.message = err.message
        copy.stack = err.stack
        for (var i in err) copy[i] = err[i]
        return copy
    },
}

module.exports = QrpcServer
