const poolServer = require('./stratum');
const webServer = require('./express');

exports.start = poolServer;
exports.router = webServer;