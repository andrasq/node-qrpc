
'use strict'

try { var json = require('json-simple') } catch (err) { }
//var qhttp = require('qhttp')

function QrpcMessage( options ) {
    options = options || {}

    //this.v = options.v || 1
    this.v = 1
    this.encode = this.encodeV1
    this.decode = this.decodeV1

    return

    //this.json_encode = options.json_encode || JSON.stringify
    //this.json_decode = options.json_decode || JSON.parse
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

QrpcMessage.prototype = {
    v: null,
    id: null,

    encode: null,
    decode: null,
    // TBD: pass in json coder (eg json-simple)
    // json-simple is 5-10% faster for some use cases
    json_encode: JSON.stringify,
    json_decode: JSON.parse,
    http_build_query: null,
    http_parse_query: null,

    // convert the error with its non-iterable fields into a serializable object
    _copyError:
    function _copyError( err ) {
        var copy = {}
        copy.code = err.code
        copy.message = err.message
        copy.stack = err.stack
        for (var i in err) copy[i] = err[i]
        return copy
    },

    // convert the object back into an Error instance
    _extractError:
    function _extractError( obj ) {
        var err = new Error()
        // FIXME: retain non-enumerable status of std error fields (and fix unit tests)
        // err.code = err.message = err.stack = undefined
        delete err.code
        delete err.message
        delete err.stack
        for (var i in obj) err[i] = obj[i]
        return err
    },

    encodeV1:
    function encodeV1( obj ) {
        var m, b, e
        if (obj.b) b = obj.b.toString('base64')
        if (obj.m) m = this.json_encode(obj.m)
        if (obj.e) e = this.json_encode(this._copyError(obj.e))

        // Buffer passing is 50% faster with this hand-crafted bundle
        var s = 
            '{"v":' + this.v +
            // blob base64 length is sent as the second field
            (b ? ',"b":' + b.length : '') +
            (obj.id !== undefined ? ',"id":"' + obj.id + '"' : '') +
            (obj.n ? ',"n":"' + obj.n + '"' : '') +
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
        ret = this.decodeJson(str)
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

    encodeJson:
    function encodeJson( obj ) {
        return JSON.stringify(obj)
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
