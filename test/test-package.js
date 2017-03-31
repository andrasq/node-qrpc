/**
 * quick little rpc package
 *
 * Copyright (C) 2015-2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict'

var assert = require('assert')

module.exports = {
    'package should parse': function(t) {
        require('../package.json')
        t.done()
    },

    'package should load': function(t) {
        var rpc = require('../index.js')
        t.done()
    },

    'package should export expected functions': function(t) {
        var qrpc = require('../index.js')
        assert.equal(typeof qrpc.createServer, 'function')
        assert.equal(typeof qrpc.connect, 'function')
        t.done()
    }
}
