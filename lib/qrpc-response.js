/**
 * quick little rpc package
 *
 * Copyright (C) 2015-2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict'

var QrpcMessage = require('./qrpc-message.js')

var MSG_REPLY = QrpcMessage.MSG_REPLY
var MSG_ERROR = QrpcMessage.MSG_ERROR
var MSG_LAST = QrpcMessage.MSG_LAST

/*
Qrpc message format:
  v: 1,             // 1: json bundles
  b: 0000           // length of bson string w/o quotes at end, else omitted
  id: id,           // unique call id to tag replies
  n: name,          // call name, request only
  e: error          // response only
  s: status         // ok (write), end (end), err (server error; means end)
  m: message        // call payload, request and response
  b: buffer         // a binary blob (Buffer)
*/

function QrpcResponse( version, id, socket, message) {
    // ignore the version for now, has only ever been v:1
    //this.v = version            // protocol version, always 1
    //this.v = 1
    this.id = id                // request id.  A request may get multiple responses
    this.socket = socket        // any writable
    this.message = message
    this.ended = false
}

QrpcResponse.prototype = {
    _reportError: function(e) { console.log(e) },

    configure:
    function configure( options ) {
        this._reportError = options.reportError
        return this
    },

    write:
    function write( data, callback ) {
        if (data == null) return        // send no null/undefined responses unless end()
        return this._send(MSG_REPLY, undefined, data, callback)
    },

    end:
    function end( data, callback ) {
        if (!callback && typeof data === 'function') {
            var ret = this._send(MSG_LAST, undefined, undefined, data)
        } else {
            var ret = this._send(MSG_LAST, undefined, data, callback)
        }
        this.ended = true
        return ret
    },

    // TODO: maybe use for a _sendmb method to send both m and b

    _send:
    function _send( status, error, data, callback ) {
        if (this.ended) {
            return this._reportSendAfterEnd(status, error, data, callback)
        }
        var reply = (data instanceof Buffer)
            ? { v: 1, id: this.id, n: undefined, e: error, s: status, m: undefined, b: data }
            : { v: 1, id: this.id, n: undefined, e: error, s: status, m: data, b: undefined }
        return this.socket.write(this.message.encode(reply) + "\n", callback)
        // TODO: throttle the stream if write returned false, until drained
    },

    _reportSendAfterEnd:
    function _reportSendAfterEnd( status, error, data, callback ) {
        if ((status !== MSG_LAST || data !== undefined || error) && this._reportError) {
            // qrpc ignores it, but calling write/end after end() is a calling error, someone should know
            this._reportError(new Error("qrpc: handler tried to send after end()").stack)
        }
    },

// TODO: merge QrpcResponse into QrpcMessage, use message in both server and client

}

module.exports = QrpcResponse
