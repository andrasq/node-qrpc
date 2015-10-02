/**
 * quick little rpc package
 *
 * Copyright (C) 2015 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict'

var QrpcMessage = require('./qrpc-message.js')

/*
Qrpc message format:
  v: 1,             // 1: json bundles
  id: id,           // unique call id to tag replies
  n: name,          // call name, request only
  m: message        // call payload, request and response
  e: error          // response only
  s: status         // ok (write), end (end), err (server error; means end)
*/

function QrpcResponse( version, id, socket, message) {
    this.v = version            // protocol version, always 1
    this.id = id                // request id.  A request may get multiple responses
    this.socket = socket        // any writable
    // TODO: handle unsupported protocol version more gracefully...
    if (this.v != 1) this.v = 1
    this.message = message
    // this._reportError = null // TODO: send errors back to server for logging/reporting
}

QrpcResponse.prototype = {
    v: 1,
    id: null,
    socket: null,
    message: null,
    ended: false,
    MSG_REPLY: QrpcMessage.MSG_REPLY,
    MSG_ERROR: QrpcMessage.MSG_ERROR,
    MSG_LAST: QrpcMessage.MSG_LAST,
    _reportError: function(e) { console.log(e) },

    configure:
    function configure( options ) {
        if (options.reportError !== undefined) this._reportError = options.reportError
        return this
    },

    write:
    function write( data, callback ) {
        if (data === undefined || data === null) return         // no empty responses unless LAST
        return this._send(this.MSG_REPLY, undefined, data, callback)
    },

    end:
    function end( data, callback ) {
        if (!callback && typeof data === 'function') {
            callback = data
            data = undefined
        }
        var ret = this._send(this.MSG_LAST, undefined, data, callback)
        this.ended = true
        return ret
    },

    _send:
    function _send( status, error, data, callback ) {
        if (this.ended) {
            if (status !== this.MSG_LAST || data !== undefined || error) {
                // qrpc doesn't care, but it's a bug in the code
                if (this._reportError) this._reportError(new Error("qrpc: handler tried to send after end()").stack)
            }
            return
        }
        var reply = { v: this.v, id: this.id, m: undefined, b: undefined, e: error, s: status }
        Buffer.isBuffer(data) ? reply.b = data : reply.m = data
        return this.socket.write(this.message.encode(reply) + "\n", callback)
        // TODO: throttle the stream if write returned false, until drained
    },

// TODO: merge QrpcResponse into QrpcMessage, use message in both server and client

}

module.exports = QrpcResponse
