'use strict'

var assert = require('assert')
var QrpcServer = require('../lib/qrpc-server.js')

module.exports ={
    'beforeEach': function(done) {
        this.server = new QrpcServer()
        this.socket = new MockSocket()
        this.server.setSocket(this.socket)
        done()
    },

    'listen method': {
        'error handling': {
            'should throw error if no callback': function(t) {
                try { this.server.listen(); t.fail() }
                catch (e) { t.ok(true) }
                t.done()
            },

            'should return error if no port passed': function(t) {
                t.done()
            },

            'should return error if no server set': function(t) {
                t.done()
            },

            'should return error if already listening': function(t) {
                t.done()
            },
        },

        'should call server.listen': function(t) {
            t.done()
        },
    },

    'close method': {
        'should call server.close if listening': function(t) {
            t.done()
        },
    },

    'addHandler method': {
        'should consume newline terminated JSON messages': function(t) {
            this.server.addHandler('test', function(req, res, next) {
                assert.deepEqual(req.m, {a:1, b:2})
                t.done()
            })
            var msg = JSON.stringify({v: 1, id: 1, n: 'test', m: {a:1, b:2}}) + "\n"
            this.socket.emit('data', msg)
        },
    }
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
