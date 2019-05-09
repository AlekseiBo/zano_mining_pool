const logger = require('../log');
const config = require('../config');
const rpc = require('../rpc');
const Redis = require('ioredis');
const redis = new Redis();

const units = config.pool.payment.units;
const threshold = config.pool.payment.threshold;
const denomination = config.pool.payment.denomination;
const maxlen = config.pool.stats.history;

async function getLastTransactions(account, sum24h = false, timeStamp = '0') {
    let h24 = Date.now() - 24 * 60 * 60 * 1000;
    let h24_payments = 0;
    let tx = await redis.xrevrange(
        'transactions:' + account,
        Date.now(), timeStamp);

    for (let i = 0, length = tx.length; i < length; i++) {
        tx[i][0] = parseInt(tx[i][0].split('-')[0]);
        tx[i][1][1] /= units;
        if(sum24h && tx[i][0] > h24) {
            h24_payments += tx[i][1][1];
        }
    }

    return (sum24h) ? {tx: tx, h24_payments: h24_payments.toFixed(2)} : tx;
}

async function getBalance(account) {
    let balance = await redis.zscore('balances:confirmed', account);
    return balance / units;
}

async function getUnconfirmedBalance(account) {
    let balance = await redis.zscore('balances:unconfirmed', account);
    return balance / units;
}

async function paymentRoutine() {
    let commands = [];
    let balances = await redis.zrevrange('balances:confirmed', 0, -1, 'WITHSCORES');

    for (let i = 0, bLen = balances.length; i < bLen; i += 2) {
        let account = balances[i];
        let balance = balances[i + 1];

        if (balance >= threshold) {
            let remainder = balance % denomination;
            let payout = balance - remainder;
            if (payout > 0) {
                let destination = [{
                    address: account,
                    amount: payout
                }];
                let logBalance = payout / units;
                let response = await rpc.transfer(destination);
                if (!response.error) {
                    let transaction = ['amount', payout, 'tx', response.result.tx_hash];
                    logger.log('Transfered', logBalance, 'BBR to', account);

                    commands.push(['xadd', 'transactions:' + account, 'maxlen', '~', maxlen, '*', transaction]);
                    commands.push(['hincrby', 'miners:' + account, 'total_payments', payout]);
                    commands.push(['zincrby', 'balances:confirmed', -payout, account]);
                    commands.push(['hmset', 'transactions:' + account, transaction])
                } else {
                    logger.error(response.error.message, 'for payment of', logBalance, 'BBR to', account);
                }
            }
        }
    }
    await redis.pipeline(commands).exec();
    setTimeout(paymentRoutine, config.pool.payment.interval);
}

async function updateUnconfirmedBalance() {
    let candidates = await redis.keys('candidates:*');
    let totalScore = totalReward = 0;
    let accountScore = {};
    let commands = [];
    commands.push(['del', 'balances:unconfirmed']);
    for (let i = 0, cLen = candidates.length; i < cLen; i++) {
        let block = await redis.hmget(candidates[i], ['score', 'reward']);
        totalScore += parseFloat(block[0]);
        totalReward += parseInt(block[1]);

        let shares = await redis.smembers('shares:' + candidates[i].split(':')[1]);
        for (let i = 0, sLen = shares.length; i < sLen; i++) {
            let share = shares[i].split(':');
            if (accountScore[share[0]]) {
                accountScore[share[0]] += parseFloat(share[2]);
            } else {
                accountScore[share[0]] = parseFloat(share[2]);
            }
        }
    }
    let feePercent = config.pool.fee / 100;
    totalReward = Math.round(totalReward - (totalReward * feePercent));
    for (let id in accountScore) {
        let percent = accountScore[id] / totalScore;
        let reward = Math.round(totalReward * percent);
        commands.push(['zadd', 'balances:unconfirmed', reward, id]);
    }

    await redis.pipeline(commands).exec();
}

module.exports = {
    getLastTransactions: getLastTransactions,
    getBalance: getBalance,
    getUnconfirmedBalance: getUnconfirmedBalance,
    paymentRoutine: paymentRoutine,
    updateUnconfirmedBalance: updateUnconfirmedBalance,
}