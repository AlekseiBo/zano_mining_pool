const net = require('net');
const config = require('../config');
const logger = require('../log');
const Miner = require('../miner');

function startPoolServer() {
    var handleMessage = function (socket, jsonData, pushMessage) {
        if (!jsonData.id) {
            logger.log('Miner RPC request missing RPC id');
            return;
        }
        else if (!jsonData.method) {
            logger.log('Miner RPC request missing RPC method');
            return;
        }
        else if (!jsonData.params) {
            logger.log('Miner RPC request missing RPC params');
            return;
        }

        var sendReply = function (error, result) {
            if (!socket.writable) {
                logger.log('Socket is not writable');
                return;
            }
            var sendData = JSON.stringify({
                id: jsonData.id,
                jsonrpc: "2.0",
                error: error ? { code: -1, message: error } : null,
                result: result
            }) + "\n";
            socket.write(sendData);
        };
        let address = socket.remoteAddress.split(':').pop();
        Miner.executeMethod(jsonData.method, jsonData.params, address, sendReply, pushMessage);
    };

    var httpResponse = ' 200 OK\nContent-Type: text/plain\nContent-Length: 20\n\nmining server online';

    net.createServer(function (socket) {

        socket.setKeepAlive(true);
        socket.setEncoding('utf8');

        var dataBuffer = '';

        var pushMessage = function (method, params) {
            if (!socket.writable) return;
            var sendData = JSON.stringify({
                jsonrpc: "2.0",
                method: method,
                params: params
            }) + "\n";
            socket.write(sendData);
        };

        socket.on('data', function (d) {
            dataBuffer += d;
            let address = socket.remoteAddress.split(':').pop();
            if (Buffer.byteLength(dataBuffer, 'utf8') > 10240) { //10KB
                dataBuffer = null;
                logger.log('Socket flooding detected and prevented from', address);
                socket.destroy();
                return;
            }
            if (dataBuffer.includes('\n')) {
                var messages = dataBuffer.split('\n');
                var incomplete = dataBuffer.slice(-1) === '\n' ? '' : messages.pop();
                for (var i = 0; i < messages.length; i++) {
                    var message = messages[i];
                    if (message.trim() === '') continue;
                    var jsonData;
                    try {
                        jsonData = JSON.parse(message);
                    }
                    catch (error) {
                        if (message.indexOf('GET /') === 0) {
                            if (message.includes('HTTP/1.1')) {
                                socket.end('HTTP/1.1' + httpResponse);
                                break;
                            }
                            else if (message.includes('HTTP/1.0')) {
                                socket.end('HTTP/1.0' + httpResponse);
                                break;
                            }
                        }
                        logger.error('Malformed message from', address, ':', error);
                        socket.destroy();
                        break;
                    }
                    logger.log('Server received', jsonData.method, 'message from', address);
                    logger.log('Data:', JSON.stringify(jsonData));
                    handleMessage(socket, jsonData, pushMessage);
                }
                dataBuffer = incomplete;
            }
        }).on('error', (error) => {
            if (error.code !== 'ECONNRESET') {
                let address = socket.remoteAddress.split(':').pop();
                logger.error('Socket error from', address, ':', error);
            }
        }).on('close', () => {
            pushMessage = function () { };
        });

    }).listen(config.pool.server.port, (error, result) => {
        if (error) {
            logger.error('Could not start server: ' + error);
            return;
        }
        logger.log('Pool server started at port ' + config.pool.server.port);
    });
}

module.exports = startPoolServer;
