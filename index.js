var qrpc = require('./lib/qrpc.js')

module.exports = {
    createServer: qrpc.createServer,            // returns QrpcServer
    connect: qrpc.connect,                      // returns QrpcClient
}
