const cluster = require('cluster');
const logger = require('../log');
const config = require('../config');
const BlockTemplate = require('./blocktemplate');
const server = require('../server');
const db = require('../db');

(async function init() {
    if (cluster.isMaster) {
        await db.block.init();
        db.balance.paymentRoutine();
        db.stats.statsChecpointRoutine();
        unlockBlockRoutine();
        cluster.fork();
        cluster.on('exit', (worker, code, signal) => {
            logger.error('Cluster worker', worker.process.pid, 'has died');
            logger.error('Code:', code, 'Signal:', signal);
            cluster.fork();
        });
    } else {
        await refreshBlockRoutine();
        server.start();
        server.router();
    }
})();

async function refreshBlockRoutine() {
    await BlockTemplate.refresh();
    setTimeout(refreshBlockRoutine, config.pool.refreshBlockInterval);
}

async function unlockBlockRoutine() {
    await db.block.unlock();
    setTimeout(unlockBlockRoutine, config.pool.block.unlockInterval);
}

