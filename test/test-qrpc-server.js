/**
 * quick little rpc package
 *
 * Copyright (C) 2015 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict'

var QrpcServer = require('../lib/qrpc-server.js')

module.exports ={
    'beforeEach': function(done) {
        this.server = new QrpcServer()
        this.socket = new MockSocket()
        done()
    },

    'listen method': {
        'error handling': {
            'should throw error without listenFunc if no callback': function(t) {
                try { this.server.listen(); t.fail() }
                catch (e) { t.ok(true) }
                t.done()
            },

            'should return error without listenFunc with callback': function(t) {
                t.expect(1)
                this.server.listen(null, function(err) {
                    t.assert(err instanceof Error)
                    t.done()
                })
            },

            'should return error if already listening': function(t) {
                this.server.setListenFunc(function(port, cb){ return cb() })
                t.expect(2)
                var self = this
                this.server.listen(0, function(err) {
                    t.ifError(err)
                    self.server.listen(0, function(err) {
                        t.assert(err instanceof Error)
                        t.done()
                    })
                })
            },

            'should return error if no handler defined': function(t) {
                var call = { v: 1, id: 1, n: 'nonesuch' }
                var written = null
                var source = { read: function(){ return written ? null : JSON.stringify(call) + "\n" } }
                var writable = { write: function(s, cb) { written = s; cb && cb() } }
                this.server.setSource(source, writable)
                var self = this
                setTimeout(function() {
                    t.assert(written)
                    t.assert(JSON.parse(written).e.message.indexOf('no handler') > 0)
                    self.server.setCloseFunc(function(){})
                    self.server.close()
                    t.done()
                }, 5)
            },
        },

        'should call listenFunc': function(t) {
            var called = false
            var listenFunc = function(port, cb) { called = true; cb() }
            this.server.setListenFunc(listenFunc)
            this.server.listen(0, function(err) {
                t.equal(called, true)
                t.done()
            })
        },
    },

    'close method': {
        'should return error without closeFunc': function(t) {
            this.server.close(function(err) {
                t.assert(err instanceof Error)
                t.done()
            })
        },

        'should call server.close if listening': function(t) {
            var closed = false
            var closeFunc = function(cb) { closed = true }
            var listenFunc = function(port, cb) { cb() }
            var server = this.server
            server.setListenFunc(listenFunc)
            server.setCloseFunc(closeFunc)
            server.listen(0, function(err) {
                server.close();
                t.equal(closed, true)
                t.done()
            })
        },
    },

    'addHandler method': {
        'should accept name and function': function(t) {
            t.equal(this.server.handlers['test1'], undefined)
            var fn = function(){}
            this.server.addHandler('test1', fn)
            t.equal(this.server.handlers['test1'], fn)
            t.done()
        },

        'should throw error if not a function': function(t) {
            try { this.server.addHandler('test', 1); t.fail() }
            catch (err) { t.ok(true) }
            t.done()
        },

        'should consume newline terminated JSON messages': function(t) {
            t.expect(1)
            this.server.addHandler('test', function(req, res, next) {
                t.deepEqual(req.m, {a:1, b:2})
                t.done()
            })
            var msg = JSON.stringify({v: 1, id: 1, n: 'test', m: {a:1, b:2}}) + "\n"
            this.server.onData('', msg)
        },
    },

    'addHandlerNoResponse method': {
        'should accept name and function': function(t) {
            t.equal(this.server.handlers['test1'], undefined)
            var fn = function(){}
            this.server.addHandler('test1', fn)
            t.equal(this.server.handlers['test1'], fn)
            t.done()
        },

        'should throw error if not a function': function(t) {
            try { this.server.addHandler('test', 1); t.fail() }
            catch (err) { t.ok(true) }
            t.done()
        },

        'should consume newline terminated JSON messages': function(t) {
            t.expect(1)
            this.server.addHandler('test', function(req, res, next) {
                t.deepEqual(req.m, {a:1, b:2})
                t.done()
            })
            var msg = JSON.stringify({v: 1, id: 1, n: 'test', m: {a:1, b:2}}) + "\n"
            this.server.onData('', msg)
        },

    },
}

var util = require('util')
var EventEmitter = require('events').EventEmitter
function MockSocket( ) {
    EventEmitter.call(this)
    var self = this
    this._written = []
    this.write = function(s) { self._written.push(s) }
    this.pause = function() { }
    this.resume = function() { }
    return this
}
util.inherits(MockSocket, EventEmitter)

function createReplyChunk( written, reply ) {
    var msg = JSON.parse(written)
    var data = {v: 1, id: msg.id, m: reply}
    return JSON.stringify(data) + "\n"
}
