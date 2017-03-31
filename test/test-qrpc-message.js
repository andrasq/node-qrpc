/**
 * quick little rpc package
 *
 * Copyright (C) 2015 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict'

var QrpcMessage = require('../lib/qrpc-message.js')

module.exports = {
    'v1': {
        setUp: function(done) {
            this.data = { a:1, b:2.5, c:"three", d:[4,5,6], e:{a:1,b:2} }
            this.blob = new Buffer("blobblob")
            this.allFields = {
                id: "id-1234",
                n: "name",
                m: this.data,
                e: new Error("test error"),
                s: 'test',
                b: this.blob,
            }
            this.message = new QrpcMessage({ v: 1 })
            done()
        },

        'encode': {
            'should return versioned json bundle': function(t) {
                var bundle = this.message.encodeV1({m: {a:1, b:2}})
                t.assert(bundle.match(/^{.*}$/))
                t.assert(bundle.match(/"v":1/))
                t.done()
            },

            'should encode all data types': function(t) {
                var bundle = this.message.encodeV1({m: this.data})
                var json = JSON.parse(bundle)
                t.deepEqual(json.m, this.data)
                t.done()
            },

            'should encode very long method names': function(t) {
                var msg = {v:1, n:"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", m:null}
                var bundle = this.message.encodeV1(msg)
                var json = JSON.parse(bundle)
                t.deepEqual(json, msg)
                t.done()
            },

            'should encode utf8 method names': function(t) {
                var msg = {v:1, n:"Hello, \xff\xc8 world", m:null}
                var bundle = this.message.encodeV1(msg)
                var json = JSON.parse(bundle)
                t.deepEqual(json, msg)
                t.done()
            },

            'should include error': function(t) {
                var bundle = this.message.encodeV1({e: new Error("test error")})
                t.assert(bundle.match(/"message":"test error"/))
                t.assert(bundle.match(/"stack":"Error: test error\\n/))
                t.done()
            },

            'should encode blobs as base64': function(t) {
                var bundle = this.message.encodeV1({b: new Buffer("blobblob")})
                t.assert(bundle.match(/"b":"YmxvYmJsb2I="/))
                t.done()
            },

            'should include all fields': function(t) {
                var bundle = this.message.encodeV1(this.allFields)
                var json = JSON.parse(bundle)
                for (var i in this.allFields) {
                    if (i === 'e') {
                        t.equal(json.e.message, this.allFields.e.message)
                        t.equal(json.e.stack.slice(0, 18), "Error: test error\n")
                    }
                    else if (i === 'b') {
                        t.assert(typeof json.b === 'string')
                    }
                    else t.deepEqual(json[i], this.allFields[i], "field " + i)
                }
                t.equal(json.v, 1)
                t.equal(json.id, "id-1234")
                t.equal(json.n, "name")
                t.deepEqual(json.m, this.data)
                t.equal(json.e.message, "test error")
                t.equal(json.e.stack.slice(0, 18), "Error: test error\n")
                t.assert(json.b)
                t.done()
            },
        },

        'decode': {
            'should decode all data types': function(t) {
                var bundle = this.message.encodeV1({m: this.data})
                var json = this.message.decodeV1(bundle)
                t.deepEqual(json.m, this.data)
                t.done()
            },

            'should decode error to Error object': function(t) {
                var bundle = this.message.encodeV1({e: new Error("test error")})
                var json = this.message.decodeV1(bundle)
                t.assert(json.e instanceof Error)
                t.equal(json.e.message, "test error")
                t.equal(json.e.stack.slice(0, 18), "Error: test error\n")
                t.done()
            },

            'should decode blobs to Buffers': function(t) {
                var bundle = this.message.encodeV1({b: this.blob})
                var obj = this.message.decodeV1(bundle)
                t.deepEqual(obj.b, this.blob)
                t.done()
            },

            'should decode all fields': function(t) {
                var bundle = this.message.encodeV1(this.allFields)
                var json = this.message.decodeV1(bundle)
                for (var i in this.allFields) {
                    if (i === 'e') {
                        t.equal(json.e.message, this.allFields.e.message)
                        t.equal(json.e.stack.slice(0, 18), "Error: test error\n")
                    }
                    else t.deepEqual(json[i], this.allFields[i])
                }
                t.done()
            },

            'errors': {
                'should decode malformed blob-length': function(t) {
                    var bundle = '{"v":1,"b":999999,"m":{"a":123},"b":"////"}'
                    var json = this.message.decodeV1(bundle)
                    t.deepEqual(json.m, {a: 123})
                    t.deepEqual(json.b, new Buffer("\xff\xff\xff", 'binary'))
                    t.done()
                },

                'should return error on malformed m': function(t) {
                    var bundle = '{"v":1,"m":{a}}'
                    var json = this.message.decodeV1(bundle)
                    t.ok(json instanceof Error)
                    t.done();
                },

                'should tolerate "m":undefined': function(t) {
                    var json = this.message.decodeV1('{"v":1,"m":undefined,"e":{"err":1}}')
                    t.deepEqual(json.e, {err:1})
                    t.done()
                }
            }
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
            var str = this.message.encode({v:1, m:1})
            t.equal(str, '{"v":1,"m":1}')
            t.done()
        },

        'should decode json': function(t) {
            var obj = this.message.decode('{"m":{"a":1,"b":2}}')
            t.deepEqual(obj, {m: {a:1, b:2}})
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
