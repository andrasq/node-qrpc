/**
 * quick little rpc package
 *
 * Copyright (C) 2015-2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict'

var qinvoke = require('qinvoke');

/**
 * qrpc message coder
 * Options:
 *   - json_encode      - json stringify
 *   - json_decode      - json parse
 */
function QrpcMessage( options ) {
    options = options || {}
    if (options.json_encode) this.json_encode = options.json_encode
    if (options.json_decode) this.json_decode = options.json_decode

    //this.v = options.v || 1
    this.v = 1
    this.encode = this.encodeV1
    this.decode = this.decodeV1
}

// fast json stringification, based on `json-simple`
function json_string(s) {
    if (s.length > 75) return JSON.stringify(s).slice(1, -1);
    for (var i=0; i<s.length; i++) {
        var code = s.charCodeAt(i);
        if (code < 0x20 || code >= 127 || code === 0x5c || code === 0x22) return JSON.stringify(s).slice(1, -1);
    }
    return s;
}

QrpcMessage.prototype = {
    v: null,
    id: null,

    encode: null,
    decode: null,
    // json-simple is 5-10% faster for some use cases
    json_encode: JSON.stringify,
    json_decode: JSON.parse,

    // convert the error with its non-enumerable fields into a serializable object
    _copyError: function _copyError( err ) {
        return qinvoke.errorToObject(err, true);
    },

    // convert the error object back into an Error instance
    _extractError: function _extractError( obj ) {
        return qinvoke.objectToError(obj, true);
    },

    // faster to string concat than to json encode a temp object
    // Buffer passing is 50% faster with this hand-crafted bundle
    // blob base64 string length is sent early, with blob as the last field
    // blob itself is sent as the very last field
    // must deliver `null errors for correct last-response detection
    encodeV1:
    function encodeV1( obj ) {
        var e, b
        if (obj.e !== undefined) e = this.json_encode(this._copyError(obj.e))
        if (obj.b) b = obj.b.toString('base64')

        var s = '{"v":1'

        if (b) s += ',"b":' + b.length
        if (obj.id !== undefined) s += ',"id":"' + obj.id + '"'
        if (obj.n !== undefined) s += ',"n":"' + json_string(obj.n) + '"'
        if (e) s += ',"e":' + e
        if (obj.s) s += ',"s":"' + obj.s + '"'
        if (obj.m !== undefined) s += ',"m":' + this.json_encode(obj.m)
        if (b) s += ',"b":"' + b + '"'
        s += '}'

        return s
    },

    decodeV1:
    function decodeV1( str ) {
        var ret, b, m
        // faster to detach the blob before json decoding
        if (str.slice(0, 11) === '{"v":1,"b":') {
            // json strings containing blobs start as {"v":1,"b":NNNNN... }
            // blob is at the very end of the json string
            var blobLength = scanInt(str, 11)               // extract NN from '{"v":1,"b":NN'
            var blobStart = str.length - 2 - blobLength     // blob always at end of bundle
            var end = blobStart - 6                         // blob always prefaced with ',"b":"'
            if (end > 0) {
                b = str.slice(blobStart, blobStart + blobLength)
                str = str.slice(0, end) + '}'
            }
        }
        else {
            // opportunistically decode m as if it were the last field
            // slightly faster to decode the message separately from the envelope (parallel 3% faster, series 1.5% slower)
            var mStart = str.indexOf(',"m":')
            if (mStart > 0) {
                m = this._decodeJson(str.slice(mStart + 5, -1))
                // if error decoding, try again as part of the bundle
                if (m instanceof Error) m = undefined
                else str = str.slice(0, mStart) + "}"
            }
        }
        ret = this._decodeJson(str)
        if (ret instanceof Error) return ret
        if (ret.e) ret.e = this._extractError(ret.e)
        if (m !== undefined) ret.m = m
        if (b) ret.b = b
        if (ret.b) ret.b = new Buffer(ret.b, 'base64')
        return ret
    },

    _decodeJson:
    function _decodeJson( str ) {
        try { return this.json_decode(str) }
        catch (err) {
            if (str.indexOf(',"m":undefined') > 0) {
                // JSON cannot pass undefined values, fix them here
                str = str.replace(',"m":undefined', '')
                return this._decodeJson(str)
            }
            err.message = "qrpc: json parse error: " + err.message
            return err
        }
    },
}

function scanInt( str, p ) {
    var n = 0, ch
    while ((ch = str.charCodeAt(p)) >= 0x30 && ch <= 0x39) {
        n = n * 10 + (ch - 0x30)
        p++
    }
    return n
}

QrpcMessage.MSG_REPLY = 'ok'
QrpcMessage.MSG_LAST = 'end'
QrpcMessage.MSG_ERROR = 'err'

module.exports = QrpcMessage
