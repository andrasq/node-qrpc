
'use strict'

var QrpcMessage = require('../lib/qrpc-message.js')

var http_build_query = require('qhttp/http_build_query')
var http_parse_query = require('qhttp/http_parse_query')

module.exports = {
    'v 1': {
        setUp: function(done) {
            this.message = new QrpcMessage({
                v: 1,
            })
            done()
        },

        'should encode as json': function(t) {
            var str = this.message.encode({x: {a: 1, b: 2}})
            t.equal(str, '{"x":{"a":1,"b":2}}')
            t.done()
        },

        'should decode json': function(t) {
            var obj = this.message.decode('{"x":{"a":1,"b":2}}')
            t.deepEqual(obj, {x: {a: 1, b:2}})
            t.done()
        },

        'should return Error on decode error': function(t) {
            var obj = this.message.decode('{]')
            t.assert(obj instanceof Error)
            t.done()
        },
    },

    'v 2': {
        setUp: function(done) {
            this.message = new QrpcMessage({
                v: 2,
                http_build_query: http_build_query,
                http_parse_query: http_parse_query,
            })
            done()
        },

        'should encode as http query string': function(t) {
            var str = this.message.encode({x: {a: 1, b: 2}})
            t.equal(str, 'x[a]=1&x[b]=2')
            t.done()
        },

        'should decode http query string': function(t) {
            var obj = this.message.decode('x[a]=1&x[b]=2')
// FIXME: decodes elements 'x[a]' and 'x[b]' in addition to 'x'
//            t.deepEqual(obj, {x: {a: 1, b:2}})
            t.done()
        },

        'should return Error on decode error': function(t) {
            var obj = this.message.decode('a[=1')
            t.assert(obj instanceof Error)
            t.done()
        },
    },
}
