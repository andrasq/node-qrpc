'use strict'

var assert = require('assert')
var QrpcClient = require('../lib/qrpc-client.js')

module.exports ={
    'beforeEach': function(done) {
        this.client = new QrpcClient()
        done()
    },

    'call method': {
        'should write newline terminated v1 JSON message to socket': function(t) {
            var socket = new MockSocket()
            this.client.setSocket(socket)
            this.client.call('test', {a:1, b:2})
            assert.equal(socket._written[0].slice(-1), "\n")
            var msg = JSON.parse(socket._written[0])
            assert(msg.id.match(/[0-9a-fA-F]{24}/))
            delete msg.id
            assert.deepEqual(msg, {v: 1, n: 'test', m: {a:1, b:2}})
            assert.equal(msg.v, 1)
            assert.equal(msg.n, 'test')
            t.done()
        },

        'should invoke callback on response': function(t) {
            var socket = new MockSocket()
            this.client.setSocket(socket)
            this.client.call('test', {a:2}, function(err, reply) {
                assert.deepEqual(reply, {reply: 'ok'})
                t.done()
            })
            var msg = JSON.parse(socket._written[0])
            var reply = { v: 1, id: msg.id, m: {reply: 'ok'} }
            socket.emit('data', JSON.stringify(reply) + "\n")
        },

        'should return Error on error response': function(t) {
            var socket = new MockSocket()
            this.client.setSocket(socket)
            var errorObject = {message: 'oops', code: 123, stack: 'lines', other: 'yes'}
            this.client.call('test', {a:3}, function(err, reply) {
                assert(err instanceof Error)
                assert.deepEqual(err, errorObject)
                t.done()
            })
            var msg = JSON.parse(socket._written[0])
            var reply = { v: 1, id: msg.id, e: errorObject }
            socket.emit('data', JSON.stringify(reply) + "\n")
        },

        'should return Error to all calls on socket error': function(t) {
            var client = new QrpcClient()
            var socket = new MockSocket()
            client.setSocket(socket)
            var test1err, test2err
            client.call('test1', function(err, reply) {
                assert(err instanceof Error)
                test1err = err
            })
            client.call('test2', function(err, reply) {
                // event listeners are invoked in the order added
                test2err = err
                assert(test1err instanceof Error)
                assert(test2err instanceof Error)
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
