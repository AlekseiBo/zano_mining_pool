const logger = require('../log');
const config = require('../config');
const rpc = require('../rpc');
const balance = require('./balance');
const Redis = require('ioredis');
const redis = new Redis();

const maxlen = config.pool.stats.history;

async function init() {
    await redis.set('pool:round:start', Date.now() + '-0');
}

async function storeMinerShare(candidate, height, account, worker, share, score) {
    let res = await redis.xadd('hashes', 'maxlen', '~', maxlen, '*', [
        'height', height,
        'account', account,
        'worker', worker,
        'share', share,
        'score', score
    ]);
    if (candidate) {
        await redis.set('pool:round:stop', res);
    }
    redis.hset('miners:' + account, 'last_' + worker, Date.now());
}

async function updateShareStats(account, worker, status) {
    let commands = [];
    commands.push(['hincrby', 'miners:' + account, 'total_' + worker, 1]);
    if (status === 'invalid') {
        commands.push(['hincrby', 'miners:' + account, 'invalid_' + worker, 1]);
    } else if (status === 'stale') {
        commands.push(['hincrby', 'miners:' + account, 'stale_' + worker, 1]);
    } else if (status === 'block') {
        commands.push(['hincrby', 'miners:' + account, 'blocks_' + worker, 1]);
        commands.push(['hincrby', 'miners:' + account, 'total_blocks', 1]);
    }
    redis.pipeline(commands).exec();
}

async function storeCandidate(height, hash) {
    let header = await getBlockHeader(height);
    if (header) {
        let roundStop = await redis.get('pool:round:stop');
        let nextStart = roundStop.split('-');
        nextStart[1]++;
        let roundStart = await redis.getset('pool:round:start', nextStart.join('-'));

        let hashes = await redis.xrevrange('hashes', roundStop, roundStart);
        let sumShares = 0;
        let sumScore = 0;
        let accountScore = {};
        let commands = [];

        for (let i = 0, hLen = hashes.length; i < hLen; i++) {
            let entry = hashes[i][1];
            sumShares += parseFloat(entry[7]);
            sumScore += parseFloat(entry[9]);

            if (accountScore[entry[3]]) {
                accountScore[entry[3]].shares += parseFloat(entry[7]);
                accountScore[entry[3]].score += parseFloat(entry[9]);
            }
            else {
                accountScore[entry[3]] = {
                    shares: parseFloat(entry[7]),
                    score: parseFloat(entry[9])
                }
            }
        }

        for (let account in accountScore) {
            let score = accountScore[account].score;
            let shares = accountScore[account].shares;
            commands.push(['sadd', 'shares:' + header.height, [account, shares, score].join(':')]);
            commands.push(['hincrby', 'miners:' + account, 'total_shares', shares]);
        }

        let sTime = roundStart.split('-')[0];
        let eTime = roundStop.split('-')[0];

        let candidate = {
            status: 'candidate',
            height: height,
            difficulty: header.difficulty,
            hash: hash,
            reward: header.reward,
            shares: sumShares,
            score: sumScore,
            effort: Math.round(100 * sumShares / header.difficulty),
            startTime: sTime,
            endTime: eTime,
            duration: Math.round((eTime - sTime) / 1000)
        }
        commands.push(['hmset', 'candidates:' + header.height, candidate]);

        await redis.pipeline(commands).exec();
    }
    balance.updateUnconfirmedBalance();
}

async function unlock() {
    let current = await getBlockHeader();
    if (!current) {
        return null;
    }

    let unlockHeight = current.height - config.pool.block.unlockDepth;
    let candidates = await redis.keys('candidates:*');
    for (let i = 0, cLen = candidates.length; i < cLen; i++) {
        let height = parseInt(candidates[i].split(':')[1]);
        if (height <= unlockHeight) {
            let block = await redis.hgetall(candidates[i]);
            let getHeader = await rpc.getBlockHeaderByHeight(height);
            if (!getHeader.error) {
                let header = getHeader.result.block_header;
                let logBalance = header.reward / config.pool.payment.units;
                let commands = [];
                let status = 'confirmed';
                orphan = header.hash != block.hash;
                logger.log(`Unlocking block ${height} with reward of ${logBalance} BBR (orphan: ${orphan})`);

                var shares = await redis.smembers('shares:' + height);
                if (orphan) {
                    status = 'orphan';
                    for (let i = 0, sLen = shares.length; i < sLen; i++) {
                        let share = shares[i].split(':');
                        storeMinerShare(false, height, share[0], '', share[1], share[2]);
                    }
                } else {
                    let feePercent = config.pool.fee / 100;
                    let totalReward = Math.round(header.reward - (header.reward * feePercent));

                    for (let i = 0, sLen = shares.length; i < sLen; i++) {
                        let share = shares[i].split(':');
                        let percent = share[2] / block.score;
                        let reward = Math.round(totalReward * percent);
                        commands.push(['zincrby', 'balances:confirmed', reward, share[0]]);
                    }
                }
                commands.push(['del', 'shares:' + height]);
                commands.push(['rename', 'candidates:' + height, 'blocks:' + height]);
                commands.push(['hset', 'blocks:' + height, 'status', status]);
                commands.push(['zadd', 'pool:block-list', [height, 'blocks:' + height]]);
                await redis.pipeline(commands).exec();
            }
        }
    }
    balance.updateUnconfirmedBalance();
}

async function roundStart() {
    let dbRoundStart = await redis.get('pool:round:start');
    if (dbRoundStart)
        return dbRoundStart.split('-')[0];
    else
        return Date.now();
}

async function getBlockHeader(height = null) {
    var response;
    if (height) {
        response = await rpc.getBlockHeaderByHeight(height);
    } else {
        response = await rpc.getLastBlockHeader();
    }
    if (response.error) {
        logger.error('Error receiving block header');
        return null;
    }
    return response.result.block_header;
}

module.exports = {
    init: init,
    storeMinerShare: storeMinerShare,
    updateShareStats: updateShareStats,
    storeCandidate: storeCandidate,
    unlock: unlock,
    roundStart: roundStart
}