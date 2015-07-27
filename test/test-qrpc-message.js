
'use strict'

var QrpcMessage = require('../lib/qrpc-message.js')

module.exports = {
    'json format v=1': {
        setUp: function(done) {
            this.message = new QrpcMessage({ v: 1 })
            done()
        },

        'should encode': function(t) {
            var str = this.message.encode({x: {a: 1, b: 2}})
            t.equal(str, '{"x":{"a":1,"b":2}}')
            t.done()
        },

        'should decode': function(t) {
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

/***
    'query string format v=2': {
        setUp: function(done) {
            this.message = new QrpcMessage({ v: 2 })
            done()
        },

        'should encode': function(t) {
            var str = this.message.encode({x: {a: 1, b: 2}})
            t.equal(str, 'x[a]=1&x[b]=2')
            t.done()
        },

        'should decode': function(t) {
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

        'should use passed-in http encode/decode functions': function(t) {
            // WRITEME
            t.done()
        },
    },
***/

    'auto-detect format': {
        setUp: function(done) {
            this.message = new QrpcMessage({ v: -1 })
            done()
        },

        'should encode as json': function(t) {
            var str = this.message.encode({v:1, a:1})
            t.equal(str, '{"v":1,"a":1}')
            t.done()
        },

        'should decode json': function(t) {
            var obj = this.message.decode('{"a":1,"b":2}')
            t.deepEqual(obj, {a:1, b:2})
            t.done()
        },

/***
        'should encode query string': function(t) {
            var str = this.message.encode({v:2, a:1})
            t.equal(str, 'v=2&a=1')
            t.done()
        },

        'should decode query string': function(t) {
            var obj = this.message.decode('v=2&a=1&b=2')
            t.deepEqual(obj, {v:2, a:1, b:2})
            t.done()
        },
***/
    },
}
