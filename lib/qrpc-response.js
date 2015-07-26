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
    // TODO: handle unsupported protocol version more gracefully...
    if (this.v != 1) this.v = 1
}

QrpcResponse.prototype = {
    v: 1,
    id: null,
    socket: null,
    ended: false,
    MSG_REPLY: QrpcMessage.MSG_REPLY,
    MSG_ERROR: QrpcMessage.MSG_ERROR,
    MSG_LAST: QrpcMessage.MSG_LAST,

    write:
    function write( data, callback ) {
        if (data === undefined || data === null) return         // no empty responses unless LAST
        this._send(this.MSG_REPLY, undefined, data, callback)
    },

    end:
    function end( data, callback ) {
        if (!callback && typeof data === 'function') {
            callback = data
            data = undefined
        }
        this._send(this.MSG_LAST, undefined, data, callback)
        this.ended = true
    },

    _send:
    function _send( status, error, data, callback ) {
        if (this.ended) {
            if (status !== this.MSG_LAST || data !== undefined || error) {
                // TODO: maybe handle this neater...
                // qrpc doesn't care, but it's a bug in the code
                console.log("tried to send after end:", err ? err : "")
            }
            return
        }
        if (this.v === 1 || this.v === '1') {
            // if data, error or status are undefined, they will be omitted
            var reply = { v: 1, id: this.id, m: data, e: error, s: status }
            this.socket.write(JSON.stringify(reply) + "\n", callback)
        }
    },

// TODO: merge QrpcResponse into QrpcMessage, use message in both server and client

}

module.exports = QrpcResponse
