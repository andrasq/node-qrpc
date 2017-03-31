/**
 * quick little rpc package
 *
 * Copyright (C) 2015-2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict'

var assert = require('assert')
var QrpcServer = require('../lib/qrpc-server.js')
var QrpcClient = require('../lib/qrpc-client.js')

var qrpc = require('../lib/qrpc.js')

module.exports = {
    'should export createServer and connect': function(t) {
        var qrpc = require('../lib/qrpc.js')
        assert.equal(typeof qrpc.createServer, 'function')
        assert.equal(typeof qrpc.connect, 'function')
        t.done()
    },

    'createServer': {
        'setUp': function(done) {
            this.server = qrpc.createServer()
            done()
        },

        'should return a QrpcServer having the expected methods': function(t) {
            var server = qrpc.createServer()
            assert(server instanceof QrpcServer)
            var expectedMethods = ['listen', 'addHandler', 'close', 'setSource']
            for (var i in expectedMethods) {
                assert.equal(typeof this.server[expectedMethods[i]], 'function')
            }
            t.done()
        },
    },

    'connect': {
        'setUp': function(done) {
            this.client = qrpc.connect(80, 'localhost')
            done()
        },

        'should return a QrpcClient having the expected methods': function(t) {
            var client = qrpc.connect(80, 'localhost')
            assert(client instanceof QrpcClient)
            var expectedMethods = ['call', 'close', 'setTarget']
            for (var i in expectedMethods) {
                assert.equal(typeof this.client[expectedMethods[i]], 'function')
            }
            t.done()
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
