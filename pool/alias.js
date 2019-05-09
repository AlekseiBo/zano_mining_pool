const crUtil = require('zano-util');
const logger = require('../log');
const rpc = require('../rpc');
const config = require('../config');
const Redis = require('ioredis');
const redis = new Redis();

const addressBase58Prefix = crUtil.address_decode(Buffer.from(config.pool.address));

var getNext = true;
var current = {
    alias: '',
    address: '',
    tracking_key: '',
    comment: 'alias created by hyle team'
};

async function getDetails(alias) {
    let response = await rpc.getAliasDetails(alias);
    if (!response.result || response.result.status !== "OK") {
        logger.error('Invalid alias', alias, response.result.status);
        return null;
    }
    return response.result;
}

async function isAvailable(alias) {
    let response = await rpc.getAliasDetails(alias);
    if (response.result && response.result.status.includes('Alias not found')) {
        return true;
    } else {
        return false;
    }
}

async function request(address, alias) {
    if (addressBase58Prefix == crUtil.address_decode(Buffer.from(address))) {
        if (await isAvailable(alias)) {
            let shares = await redis.hget('miners:' + address, 'total-shares') || 0;
            await redis.zadd('aliases:queue', shares, [address, alias].join(':'));
            return true;
        }
    }
}

async function getCurrent() {
    if (getNext) {
        let nextAlias = await redis.zrevrangebyscore('aliases:queue', '+inf', '-inf', ['LIMIT', '0', '1']);
        nextAlias = nextAlias.toString().split(':');
        if (nextAlias.length > 0) {
            current.address = nextAlias[0];
            current.alias = nextAlias[1];
        } else {
            current.alias = '';
            current.address = '';
        }
        getNext = false;
    }
    return current;
}

async function updateQueue() {
    await redis.zrem('aliases:queue', [current.address, current.alias].join(':'))
    getNext = true;
}

async function getQueue() {
    let aliases = await redis.zrevrangebyscore('aliases:queue', '+inf', '-inf');
    let list = [];
    for (let i = 0, aLen = aliases.length; i < aLen; i++) {
        let alias = aliases[i].split(':');
        list.push({
            address: alias[0],
            alias: alias[1]
        });
    } 
    return list;
}

module.exports = {
    getDetails: getDetails,
    isAvailable: isAvailable,
    request: request,
    getCurrent: getCurrent,
    updateQueue: updateQueue,
    getQueue: getQueue
}