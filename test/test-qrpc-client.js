/**
 * quick little rpc package
 *
 * Copyright (C) 2015 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict'

var QrpcClient = require('../lib/qrpc-client.js')

module.exports ={
    'beforeEach': function(done) {
        this.client = new QrpcClient()
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
            var msg = JSON.parse(socket._written[0])
            var reply = { v: 1, id: msg.id, m: {reply: 'ok'} }
            socket.emit('data', JSON.stringify(reply) + "\n")
        },

        'should return Error on error response': function(t) {
            var socket = new MockSocket()
            this.client.setTarget(socket, socket)
            var errorObject = {message: 'oops', code: 123, stack: 'lines', other: 'yes'}
            this.client.call('test', {a:3}, function(err, reply) {
                t.assert(err instanceof Error)
                t.deepEqual(err, errorObject)
                t.done()
            })
            var msg = JSON.parse(socket._written[0])
            var reply = { v: 1, id: msg.id, e: errorObject }
            socket.emit('data', JSON.stringify(reply) + "\n")
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
