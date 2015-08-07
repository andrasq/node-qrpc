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
            'should throw error if no callback': function(t) {
                try { this.server.listen(); t.fail() }
                catch (e) { t.ok(true) }
                t.done()
            },

            'should return error if no port passed': function(t) {
                // WRITEME
                t.done()
            },

            'should return error if already listening': function(t) {
                // WRITEME
                t.done()
            },
        },

        'should call server.listen': function(t) {
            // WRITEME
            t.done()
        },
    },

    'close method': {
        'should call server.close if listening': function(t) {
            // WRITEME
            t.done()
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
