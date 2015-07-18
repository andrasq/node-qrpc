assert = require('assert')

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
        var rpc = require('../index.js')
        assert.equal(typeof rpc.createServer, 'function')
        assert.equal(typeof rpc.connect, 'function')
        t.done()
    }
}
