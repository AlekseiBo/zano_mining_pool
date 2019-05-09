const logger = require('../log');
const rpc = require('../rpc');
const config = require('../config');
const balance = require('./balance');
const Redis = require('ioredis');
const redis = new Redis();

const units = config.pool.payment.units;
const maxlen = config.pool.stats.history;

async function getLastBlocks(count = null, offset = '0') {
    let candidateList = await redis.keys('candidates:*');
    candidateList.sort();
    candidateList.reverse();
    let blockList;
    if (count) {
        blockList = await redis.zrevrangebyscore(
            'pool:block-list', '+inf', '-inf',
            ['LIMIT', offset, count]);
    } else {
        blockList = await redis.zrevrangebyscore('pool:block-list', '+inf', '-inf');
    }

    let commands = [];
    for (let i = 0, length = candidateList.length; i < length; i++) {
        commands.push(['hgetall', candidateList[i]]);
    }
    for (let i = 0, length = blockList.length; i < length; i++) {
        commands.push(['hgetall', blockList[i]]);
    }
    let blocks = await redis.pipeline(commands).exec();
    for (let i = 0, length = blocks.length; i < length; i++) {
        blocks[i].shift();
        blocks[i][0].reward /= units;
    }

    return blocks;
}

async function getDashboard() {
    let promises = [];
    promises.push(rpc.getInfo());
    promises.push(rpc.getLastBlockHeader());
    promises.push(getCurrentPoolStats());
    let data = await Promise.all(promises);
    let info = data[0];
    let header = data[1];
    let pool = data[2];

    let network = {};

    if (info.result) {
        info = info.result;
        network.current_hasrate = info.current_network_hashrate_50;
        network.difficulty = info.difficulty;
        network.height = info.height;
        network.last_hash = info.last_block_hash;
    }
    if (header.result) {
        network.last_reward = header.result.block_header.reward / units;
        network.last_block_found = Math.round(Date.now() / 1000 - header.result.block_header.timestamp);
    }

    pool.current_effort = Math.round(100 * pool.round_shares / info.difficulty);

    return {
        network: network,
        pool: pool
    }
}

async function getCurrentPoolStats(miners = false) {
    let now = Date.now();
    let timeDepth = now - config.pool.stats.frame;
    let roundStart = await redis.get('pool:round:start');
    roundStart = (roundStart) ? roundStart.split('-')[0] : 0;
    let hashesDepth = Math.min(roundStart, timeDepth);
    let hashes = await redis.xrevrange('hashes', now, hashesDepth);
    let sumShares = roundShares = 0;
    let accounts = {};

    for (let i = 0, length = hashes.length; i < length; i++) {
        let timeStamp = hashes[i][0].split('-')[0];
        let entry = hashes[i][1];
        if (timeDepth < timeStamp) {
            sumShares += parseFloat(entry[7]);
        }
        if (roundStart < timeStamp) {
            roundShares += parseFloat(entry[7]);
        }
        if (miners) {
            if (miners && timeDepth < timeStamp) {
                if (accounts[entry[3]] && accounts[entry[3]][entry[5]]) {
                    accounts[entry[3]][entry[5]] += parseFloat(entry[7]);
                } else if (accounts[entry[3]]) {
                    accounts[entry[3]][entry[5]] = parseFloat(entry[7]);
                } else {
                    let tempWorker = {};
                    tempWorker[entry[5]] = parseFloat(entry[7]);
                    accounts[entry[3]] = tempWorker;
                }
            }
        } else {
            accounts[entry[3]] = 1;
        }
    }

    timeDepth = now - 30 * 24 * 3600 * 1000;
    let stats = await redis.xrevrange('pool:stats', now, timeDepth);
    for (let i = 0; i < stats.length; i++) {
        stats[i][0] = parseInt(stats[i][0].split('-')[0]);
    }

    var pool = {};
    pool.current_hashrate = Math.round(sumShares / (config.pool.stats.frame / 1000));
    pool.last_block_found = Math.round((now - roundStart) / 1000);
    pool.fee = config.pool.fee;
    pool.round_shares = roundShares;
    pool.miner_count = Object.keys(accounts).length;
    if (miners) {
        for (let acc in accounts) {
            let total = 0;
            for (let worker in accounts[acc]) {
                accounts[acc][worker] /= (config.pool.stats.frame / 1000);
                total += accounts[acc][worker];
            }
            accounts[acc].___total = total;
        }
        pool.accounts = accounts;
    }
    pool.stats = stats;
    return pool;
}

async function statsChecpointRoutine() {
    let promises = [];
    let commands = [];
    promises.push(rpc.getInfo());
    promises.push(getCurrentPoolStats(true));
    let data = await Promise.all(promises);
    let info = data[0];
    let pool = data[1];

    if (info.result) {
        info = info.result;
    }

    commands.push(['xadd', 'pool:stats', 'maxlen', '~', maxlen, '*',
        'difficulty', info.difficulty,
        'pool_hashrate', pool.current_hashrate,
        'miner_count', pool.miner_count
    ]);

    for (let account in pool.accounts) {
        let hasrates = ['xadd', 'stats:' + account, 'maxlen', '~', maxlen, '*'];
        for (let worker in pool.accounts[account]) {
            if (worker === '___total') {
                hasrates.push('total');
            } else {
                hasrates.push([account, worker].join(':'));
            }
            hasrates.push(Math.round(pool.accounts[account][worker]));
        }
        commands.push(hasrates);
    }

    await redis.pipeline(commands).exec();
    redis.bgsave();
    setTimeout(statsChecpointRoutine, config.pool.stats.interval);
}

async function getFullMinerStats(account, timeDepth = null) {
    let now = Date.now();
    let output = {};

    if (!timeDepth) timeDepth = 30 * 24 * 3600 * 1000;
    timeDepth = (now - timeDepth);
    let stats = await redis.xrevrange('stats:' + account, now, timeDepth);

    let workers = await redis.hgetall('miners:' + account);
    for (let id in workers) {
        if(id.startsWith('last_')) {
            workers[id] = Math.round((now - workers[id]) / 1000);
        }
    }

    for (let i = 0; i < stats.length; i++) {
        stats[i][0] = parseInt(stats[i][0].split('-')[0]);
    }

    output.current_hashrate = (stats.length > 0) ? stats[0][1][stats[0][1].length - 1] : null;
    output.worker_stats = workers;
    output.hasrate_chart = stats;
    return output;    
}

async function getCurrentMinerStats(account) {
    let promises = [];
    promises.push(redis.hgetall('miners:' + account));
    promises.push(balance.getBalance(account));
    promises.push(balance.getUnconfirmedBalance(account));
    promises.push(balance.getLastTransactions(account, true));
    promises.push(getFullMinerStats(account));
    let data = await Promise.all(promises);
    let miner = data[0];
    let confirmed = data[1];
    let unconfirmed = data[2];
    let transactions = data[3];
    let stats = data[4];

    let overview = {};
    overview.unconfirmed_balance = unconfirmed;
    overview.confirmed_balance = confirmed;
    overview.total_payments = miner.total_payments / units;
    overview.h24_payments = transactions.h24_payments;
    overview.total_shares = miner.total_shares;
    overview.payout_threshold = config.pool.payment.threshold / units;
    overview.current_hashrate = stats.current_hashrate;

    let output = {};
    output.overview = overview;
    output.payments = transactions.tx;
    output.workers = stats;

    return output;
}

module.exports = {
    getLastBlocks: getLastBlocks,
    getDashboard: getDashboard,
    statsChecpointRoutine: statsChecpointRoutine,
    getCurrentMinerStats: getCurrentMinerStats
};
