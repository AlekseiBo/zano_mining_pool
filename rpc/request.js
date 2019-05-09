const http = require('http');

function jsonRequest(host, port, data) {
    return new Promise((resolve, reject) => {
        var options = {
            hostname: host,
            port: port,
            path: '/json_rpc',
            method: data ? 'POST' : 'GET',
            headers: {
                'Content-Length': data.length,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        var req = http.request(options, (res) => {
            var replyData = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                replyData += chunk;
            });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(replyData));
                }
                catch (err) {
                    reject(err);
                }
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        req.end(data);
    });
}

function binRequest(host, port, uri) {
    return new Promise((resolve, reject) => {
        var options = {
            hostname: host,
            port: port,
            path: uri,
            method: 'POST',
            encoding: null,
            headers: {
                'Content-Length': 0,
                'Content-Type': 'application/json',
                'Accept': 'application/alternative'
            }
        };

        var req = http.request(options, (res) => {
            var data = [];
            res.on('data', (chunk) => {
                data.push(chunk);
            });
            res.on('end', () => {
                try {
                    data = Buffer.concat(data);
                    resolve(data);
                }
                catch (err) {
                    reject(err);
                }
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        req.end();
    });
}

exports.jsonRequest = jsonRequest;
exports.binRequest = binRequest;