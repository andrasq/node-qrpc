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

function QrpcResponse( version, id, socket ) {
    this.v = version            // protocol version, always 1
    this.id = id                // request id.  A request may get multiple responses
    this.socket = socket        // any writable
}

QrpcResponse.prototype = {
    v: 1,
    id: null,
    socket: null,
    ended: false,
    REPLY: QrpcMessage.MSG_REPLY,
    ERROR: QrpcMessage.MSG_ERROR,
    LAST: QrpcMessage.MSG_LAST,

    write:
    function write( data, callback ) {
        if (data === undefined || data === null) return         // no empty responses unless LAST
        this._send(this.REPLY, undefined, data, callback)
    },

    end:
    function end( data, callback ) {
        if (!callback && typeof data === 'function') {
            callback = data
            data = undefined
        }
        this._send(this.LAST, undefined, data, callback)
        this.ended = true
    },

    _send:
    function _send( status, error, data, callback ) {
        if (this.ended) return
        if (this.v === 1 || this.v === '1') {
            var reply = { v: 1, id: this.id, m: data, e: error, s: status }
            this.socket.write(JSON.stringify(reply) + "\n", callback)
        }
        // else ... ? throw new Error("unknown response version " + this.v)
    },
}

module.exports = QrpcResponse
