/**
 * quick little rpc package
 *
 * Copyright (C) 2015 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict'

//var json = require('json-simple')
//var qhttp = require('qhttp')

/**
 * qrpc message coder
 * Options:
 *   - json_encode      - json stringify
 *   - json_decode      - json parse
 *   - http_build_query - http query stringify
 *   - http_parse_query - http query string parse
 */
function QrpcMessage( options ) {
    options = options || {}
    if (options.json_encode) this.json_encode = options.json_encode
    if (options.json_decode) this.json_decode = options.json_decode

    //this.v = options.v || 1
    this.v = 1
    this.encode = this.encodeV1
    this.decode = this.decodeV1

    return

    this.json_encode = options.json_encode || JSON.stringify
    this.json_decode = options.json_decode || JSON.parse
    this.http_build_query = options.http_build_query || qhttp.http_build_query
    this.http_parse_query = options.http_parse_query || qhttp.http_parse_query

    // to support alternate encodings:
    switch (options.v) {
    case 1:
        this.v = 1
        this.encode = this.encodeV1
        this.decode = this.decodeV1
        break
    case 2:
        this.v = 2
        this.encode = this.encodeHttpQuery
        this.decode = this.decodeHttpQuery
        break
    default:
        this.v = 1
        this.http_build_query = options.http_build_query || qhttp.http_build_query
        this.http_parse_query = options.http_parse_query || qhttp.http_parse_query
        this.encode = this.encodeAuto
        this.decode = this.decodeAuto
    }
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
    http_build_query: null,
    http_parse_query: null,

    // convert the error with its non-iterable fields into a serializable object
    _copyError:
    function _copyError( err ) {
        if (!err || typeof err !== 'object') return err
        var copy = {}
        copy.code = err.code
        copy.message = err.message
        copy.stack = err.stack
        for (var i in err) copy[i] = err[i]
        copy._isQrpcError__ = true
        return copy
    },

    // convert the object back into an Error instance
    _extractError:
    function _extractError( obj ) {
        if (!obj || !obj._isQrpcError__) return obj
        var err = new Error()
        // retain non-enumerable status of std error fields
        err.code = err.message = err.stack = undefined
        for (var i in obj) err[i] = obj[i]
        delete err._isQrpcError__
        return err
    },

    encodeV1:
    function encodeV1( obj ) {
        var m, b, e
        if (obj.b) b = obj.b.toString('base64')
        if (obj.m !== undefined) m = this.json_encode(obj.m)
        if (obj.e !== undefined) e = this.json_encode(this._copyError(obj.e))

        // Buffer passing is 50% faster with this hand-crafted bundle
        var s = 
            '{"v":' + this.v +
            // blob base64 length is sent as the second field
            (b ? ',"b":' + b.length : '') +
            (obj.id !== undefined ? ',"id":"' + obj.id + '"' : '') +
            (obj.n ? ',"n":"' + json_string(obj.n) + '"' : '') +
            (m ? ',"m":' + m : '') +
            (e ? ',"e":' + e : '') +
            (obj.s ? ',"s":"' + obj.s + '"' : '') +
            // blob itself is sent as the very last field
            (b ? ',"b":"' + b + '"' : '') +
            '}'
        return s
    },

    decodeV1:
    function decodeV1( str ) {
        var ret, b
        // faster to detach the blob before json decoding
        if (str.slice(0, 11) === '{"v":1,"b":') {
            // json strings containing blobs start as {"v":1,"b":NNNNN... }
            // blob is at the very end of the json string
            var blobLength = parseInt(str.slice(11, 41), 10)        // extract NN from '{"v":1,"b":NN'
            var blobStart = str.length - 2 - blobLength             // blob always at end of bundle
            var end = blobStart - 6                                 // blob always prefaced with ',"b":"'
            if (end > 0) {
                b = str.slice(blobStart, blobStart + blobLength)
                str = str.slice(0, end) + '}'
            }
        }
        ret = this._decodeJson(str)
        if (ret instanceof Error) return ret
        if (ret.e) ret.e = this._extractError(ret.e)
        // b is from hand-crafted bundle, ret.b could be from generic json
        if (b) ret.b = b
        if (ret.b) ret.b = new Buffer(ret.b, 'base64')
        return ret
    },

    encodeAuto:
    function encodeAuto( obj ) {
        // auto-detect encoding to use
        if (obj.v === 2 || obj.v === '2') return this.encodeHttpQuery(obj)
        else return this.encodeV1(obj)
        return new Error("unrecognized message format " + obj.v + "(" + (typeof obj.v) + ")")
    },

    decodeAuto:
    function decodeAuto( str ) {
        // auto-detect decoding to use
        var s = str.slice(0, 6)
        if (s === '{"v":1') return this.decodeV1(str)
        if (s === 'v=2&id' || s === 'v=2&b=') return this.decodeHttpQuery(str)
        return new Error("unrecognized message format '" + str[0] + "'")
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

    encodeHttpQuery:
    function encodeHttpQuery( obj ) {
        return this.http_build_query(obj, {leave_brackets: true})
    },

    decodeHttpQuery:
    function decodeHttpQuery( str ) {
        try { return this.http_parse_query(str) }
        catch (err) { return err }
    }
}

QrpcMessage.MSG_REPLY = 'ok'
QrpcMessage.MSG_LAST = 'end'
QrpcMessage.MSG_ERROR = 'err'

module.exports = QrpcMessage
