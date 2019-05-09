const config = require('../config');
const size = config.pool.logger.size;
var stack = [];

function log() {
    let message = `[${process.pid}][${new Date().toLocaleString()}]`;
    for (var i = 0; i < arguments.length; i++) {
        message += ' ' + arguments[i];
    }
    console.log(message);

    if (stack.unshift(message) > size) {
        stack.pop();
    }
};

function error() {
    log.apply(null, arguments);
};

function debug() {
    log.apply(null, arguments);
};

function read() {
    let output = JSON.stringify(stack)
    .replace(/","/g, '\n');
    output = output.slice(2, output.length - 2);
    return output;
}

module.exports = {
    log: log,
    error: error,
    debug: debug,
    read: read
}