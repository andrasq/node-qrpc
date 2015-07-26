
'use strict'

function QrpcMessage( options ) {
    if (!options) {
        // fast path: all defaults
        this.v = 1
        this.encode = this.encodeJson
        this.decode = this.decodeJson
    }
    else {
        options = options || {}
        switch (options.v) {
        case 1:
            this.v = 1
            this.encode = options.encodeJson || this.encodeJson
            this.decode = optoins.decodeJson || this.decodeJson
            break
        case 2:
            this.v = 2
            if (!options.http_build_query || !options.http_parse_query) {
                throw new Error("http_build_query and http_parse_query are requred")
            }
            this.http_build_query = options.http_build_query
            this.http_parse_query = options.http_parse_query
            this.encode = this.encodeHttpQuery
            this.decode = this.decodeHttpQuery
            break
        default:
            this.v = 1
            this.encode = this.encodeJson
            this.decode = this.decodeDetect
        }
    }
}

QrpcMessage.prototype = {
    v: null,
    encode: null,
    decode: null,
    http_build_query: null,
    http_parse_query: null,

    decodeDetect:
    function decodeDetect( str ) {
        if (str[0] === 'v') return this.decodeHttpQuery(str)
        if (str[0] === '{') return this.decodeJson(str)
        return new Error("unrecognized message format")
    },

    encodeJson:
    function encodeJson( obj ) {
        return JSON.stringify(obj)
    },

    decodeJson:
    function decodeJson( str ) {
        try { return JSON.parse(str) }
        catch (err) { return err }
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
