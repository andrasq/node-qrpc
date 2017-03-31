/**
 * quick little rpc package
 *
 * Copyright (C) 2015-2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict'

var QrpcClient = require('../lib/qrpc-client.js')

module.exports ={
    'setUp': function(done) {
        this.client = new QrpcClient()
        this.socket = new MockSocket()
        this.client.setTarget(this.socket, this.socket)
        done()
    },

    'methods': function(t) {
        t.assert(this.client.setTarget)
        t.assert(this.client.setCloseFunc)
        t.assert(this.client.close)
        t.assert(this.client.call)
        t.done()
    },

    'setTarget': {
        'should return self': function(t) {
            var fakeTarget = { write: function(s, cb) { cb() } }
            var fakeReadable = { read: function(n, cb) { if (!cb && typeof n === 'function') cb = n; if (cb) cb() } }
            var ret = this.client.setTarget(fakeTarget, fakeReadable)
            t.equal(ret, this.client)
            t.done()
        },
    },

    'setCloseFunc': {
        'should return self': function(t) {
            var ret = this.client.setCloseFunc(function(){})
            t.equal(ret, this.client)
            t.done()
        },
    },

    'call method': {
        'should write newline terminated v1 JSON message to socket': function(t) {
            var socket = new MockSocket()
            this.client.setTarget(socket, socket)
            this.client.call('test', {a:1, b:2})
            t.equal(socket._written[0].slice(-1), "\n")
            var msg = JSON.parse(socket._written[0])
            t.assert(msg.id.match(/[0-9a-fA-F]{24}/))
            delete msg.id
            t.deepEqual(msg, {v: 1, n: 'test', m: {a:1, b:2}})
            t.equal(msg.v, 1)
            t.equal(msg.n, 'test')
            t.done()
        },

        'should invoke callback on response': function(t) {
            var socket = new MockSocket()
            this.client.setTarget(socket, socket)
            this.client.call('test', {a:2}, function(err, reply) {
                t.deepEqual(reply, {reply: 'ok'})
                t.done()
            })
            socket.emit('data', createReplyChunk(socket._written[0], {reply: 'ok'}))
        },

        'should return Error on error response': function(t) {
            var self = this
            var socket = new MockSocket()
            this.client.setTarget(socket, socket)
            var errorObject = new Error("oops")
            var props = {message: 'oops', code: 123, stack: 'lines', other: 'yes'}
            for (var k in props) errorObject[k] = props[k]
            this.client.call('test', {a:3}, function(err, reply) {
                t.assert(err instanceof Error)
                t.deepEqual(Object.getOwnPropertyNames(errorObject), Object.getOwnPropertyNames(err));
                for (var i in props) t.equal(err[i], errorObject[i])
                t.done()
            })
            socket.emit('data', createReplyChunk(socket._written[0], undefined, this.client.message._copyError(errorObject)))
        },

        'should return Error to all calls on socket error': function(t) {
            var client = new QrpcClient()
            var socket = new MockSocket()
            client.setTarget(socket, socket)
            var test1err, test2err
            client.call('test1', function(err, reply) {
                t.assert(err instanceof Error)
                test1err = err
            })
            client.call('test2', function(err, reply) {
                // event listeners are invoked in the order added
                test2err = err
                t.assert(test1err instanceof Error)
                t.equal(test1err.message, "socket error")
                t.assert(test2err instanceof Error)
                t.equal(test2err.message, "socket error")
                t.done()
            })
            socket.emit('error', new Error("socket error"))
        },
    },

    'wrap method': {
        'should only wrap the specified methods': function(t) {
            var wrapped = this.client.wrap({test1: function(){}, test2: function(){}}, ['test1'])
            t.deepEqual(Object.keys(wrapped), ['test1'])
            t.done()
        },

        'should prefix called rpc function names': function(t) {
            var wrapped = this.client.wrap({test: function(){}}, {prefix: 'xy_'});
            wrapped.test()
            var msg = JSON.parse(this.socket._written[0])
            t.equal(msg.n, 'xy_test')
            t.done()
        },

        'should pass args as an array': function(t) {
            var wrapped = this.client.wrap({test: function(){}});
            wrapped.test()
            t.deepEqual(JSON.parse(this.socket._written[0]).m, [])
            wrapped.test(1)
            t.deepEqual(JSON.parse(this.socket._written[1]).m, [1])
            wrapped.test(1,2)
            t.deepEqual(JSON.parse(this.socket._written[2]).m, [1,2])
            wrapped.test(1,2,3)
            t.deepEqual(JSON.parse(this.socket._written[3]).m, [1,2,3])
            t.done()
        },

        'should not pass the callback': function(t) {
            var wrapped = this.client.wrap({test: function(){}});
            wrapped.test(1, 2, function cb(){ })
            t.deepEqual(JSON.parse(this.socket._written[0]).m, [1, 2])
            t.done()
        },

        'should return all arguments of response callback': function(t) {
            var wrapped = this.client.wrap({test: function(){}});
            wrapped.test(1, 2, 3, function(err, a, b, c) {
                t.equal(arguments.length, 4)
                t.equal(err, 0)
                t.equal(a, 1)
                t.equal(b, 2)
                t.equal(c, 3)
                t.done()
            })
            this.socket.emit('data', createReplyChunk(this.socket._written[0], [0, 1, 2, 3]))
        },

        'should return error on comms error': function(t) {
            var wrapped = this.client.wrap({test: function(){}});
            wrapped.test(1, 2, 3, function(err, a, b, c) {
                t.ok(err)
                t.equal(err.message, "oops")
                t.done()
            })
            this.socket.emit('error', new Error("oops"))
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

function createReplyChunk( written, reply, error ) {
    var msg = JSON.parse(written)
    var data = { v: 1, id: msg.id, m: reply, e: error }
    return JSON.stringify(data) + "\n"
}
