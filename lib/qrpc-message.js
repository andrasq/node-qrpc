
'use strict'

//var json = require('json-simple')
//var qhttp = require('qhttp')

function QrpcMessage( options ) {
    if (!options) {
        // fast path: all defaults
        this.v = 1
        this.encode = this.encodeJson
        this.decode = this.decodeJson
    }
    else {
        this.v = 1
        this.encode = this.encodeJson
        this.decode = this.decodeJson
        return

        options = options || {}
        switch (options.v) {
        case 1:
            this.v = 1
            this.encode = options.encodeJson || this.encodeJson
            this.decode = options.decodeJson || this.decodeJson
            break
        case 2:
            this.v = 2
            this.http_build_query = options.http_build_query || qhttp.http_build_query
            this.http_parse_query = options.http_parse_query || qhttp.http_parse_query
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
}

QrpcMessage.prototype = {
    v: null,
    encode: null,
    decode: null,
    http_build_query: null,
    http_parse_query: null,

    encodeAuto:
    function encodeAuto( obj ) {
        // auto-detect encoding to use
        if (obj.v === 2 || obj.v === '2') return this.encodeHttpQuery(obj)
        else return this.encodeJson(obj)
        return new Error("unrecognized message format " + obj.v + "(" + (typeof obj.v) + ")")
    },

    decodeAuto:
    function decodeAuto( str ) {
        // auto-detect decoding to use
        if (str[0] === '{') return this.decodeJson(str)
        // TODO: better heuristic for distinguishing query string format
        // TODO: maybe str[0] === 'v'
        // if (Buffer.isBuffer(str)) return str
        if (str[0] !== '{') return this.decodeHttpQuery(str)
        return new Error("unrecognized message format '" + str[0] + "'")
    },

    encodeJson:
    function encodeJson( obj ) {
        //return json.encode(obj)
        return JSON.stringify(obj)
        //return '{"v":' + this.v + ',"id":"' + obj.id + '","n":"' + obj.n + '","m":' + JSON.stringify(obj.m) + '}'
    },

    decodeJson:
    function decodeJson( str ) {
        try { return JSON.parse(str) }
        catch (err) {
            if (str.indexOf(',"m":undefined') > 0) {
                // JSON cannot pass undefined values, fix them here
                str = str.replace(',"m":undefined', '')
                return this.decodeJson(str)
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
