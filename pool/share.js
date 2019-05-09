const crUtil = require('zano-util');
const rpc = require('../rpc');
const config = require('../config');
const logger = require('../log');
const BlockTemplate = require('./blocktemplate');
const db = require('../db');
const alias = require('./alias');
const bignum = require('bignum');

const diffOne = bignum('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', 16);
const noncePattern = new RegExp("^[0-9a-f]{8}$");

async function validateShare(miner, params, reply) {
    var job = miner.validJobs.find(function (job) { return job.id === params.job_id; });
    if (!job) {
        reply('Invalid job id');
        logger.error('Invalid job id');
        db.block.updateShareStats(miner.account, miner.pass, 'invalid');
        return false;
    }

    params.nonce = params.nonce.substr(0, 8).toLowerCase();
    if (!noncePattern.test(params.nonce)) {
        updateStats(miner, false);
        reply('Invalid nonce');
        logger.error('Invalid nonce');
        db.block.updateShareStats(miner.account, miner.pass, 'invalid');
        return false;
    }

    if (job.submissions.includes(params.nonce)) {
        updateStats(miner, false);
        reply('Duplicate share');
        logger.error('Duplicate share');
        db.block.updateShareStats(miner.account, miner.pass, 'invalid');
        return false;
    }
    job.submissions.push(params.nonce);

    const current = BlockTemplate.current();
    const blockTemplate = current.height === job.height ? current
        : BlockTemplate.validBlocks().find((t) => { return t.height === job.height; });

    if (!blockTemplate) {
        reply('Block expired');
        logger.error('Block expired');
        db.block.updateShareStats(miner.account, miner.pass, 'stale');
        return false;
    }

    let shareBuffer = Buffer.alloc(blockTemplate.buffer.length);
    blockTemplate.buffer.copy(shareBuffer);
    shareBuffer.writeUInt32BE(job.extraNonce, blockTemplate.reserveOffset);
    if (typeof (params.nonce) === 'number' && params.nonce % 1 === 0) {
        let nonceBuf = bignum(params.nonce, 10).toBuffer();
        let bufReversed = Buffer.from(nonceBuf.toJSON().reverse());
        bufReversed.copy(shareBuffer, 1);
    } else {
        Buffer.from(params.nonce, 'hex').copy(shareBuffer, 1);
    }

    let convertedBlob = crUtil.convert_blob(shareBuffer);
    let hash = crUtil.get_pow_hash(convertedBlob, 'Nonce', job.height);

    if (hash.toString('hex') !== params.result) {
        logger.log('Bad hash from miner ' + miner.account + '@' + miner.address);
        reply(null, { status: 'OK' });
        db.block.updateShareStats(miner.account, miner.pass, 'stale');
        return false;
    }

    updateStats(miner, true);

    let hashArray = hash.toByteArray().reverse();
    let hashNum = bignum.fromBuffer(Buffer.from(hashArray));
    let hashDiff = diffOne.div(hashNum);

    logger.log(`Share with diff ${hashDiff} when block diff is ${current.difficulty} from ${miner.account}`);
    if (hashDiff.ge(current.difficulty)) {
        let response = await rpc.submitBlock([shareBuffer.toString('hex')]);
        if (response.error) {
            logger.error('Error submitting block:', JSON.stringify(response.error));
            storeMinerShare(false, current.height, miner, job);
            db.block.updateShareStats(miner.account, miner.pass, 'valid');
        } else {
            logger.log('BLOCK SUBMITED', JSON.stringify(response.result));
            let blockHash = crUtil.get_id_hash(Buffer.concat([Buffer.from([convertedBlob.length]), convertedBlob])).toString('hex');
            await storeMinerShare(true, current.height, miner, job);
            await db.block.storeCandidate(current.height, blockHash);
            await alias.updateQueue();
            db.block.updateShareStats(miner.account, miner.pass, 'block');
        }
    } else if (hashDiff.lt(job.difficulty) && (hashDiff / job.difficulty) < 0.995) {
        logger.log('Block rejected due low diff, found by', miner.account);
        reply('Low difficulty share');
        db.block.updateShareStats(miner.account, miner.pass, 'invalid');
        return false;
    } else {
        storeMinerShare(false, current.height, miner, job);
        db.block.updateShareStats(miner.account, miner.pass, 'valid');
    }
    return true;
}

async function storeMinerShare (candidate, height, miner, job) {
    let diff = job.difficulty;
    let roundStart = await db.block.roundStart();
    let score = diff * Math.pow(Math.E, ((roundStart - Date.now()) / config.pool.share.weight));
    await db.block.storeMinerShare(candidate, height, miner.account, miner.pass, diff, score);
}

function getTargetHex(miner) {
    let padded = Buffer.alloc(32);
    padded.fill(0);

    let diffBuff = diffOne.div(miner.difficulty).toBuffer();
    diffBuff.copy(padded, 32 - diffBuff.length);

    let buff = padded.slice(0, 4);
    let buffArray = buff.toByteArray().reverse();
    let buffReversed = Buffer.from(buffArray);
    miner.target = buffReversed.readUInt32BE(0);
    let hex = buffReversed.toString('hex');
    return hex;
}

function retargetDifficulty(miner, jobId) {
    if (miner.validJobs.length === 0)
        return;

    let job = miner.validJobs[miner.validJobs.length - 1];
    if (job.id === jobId) {
        let time = Date.now();
        let retarget = false;

        if (time - job.timeStamp < config.pool.share.targetTime - config.pool.share.targetTimeSpan) {
            miner.difficulty = Math.round(miner.difficulty * 1.1);
            retarget = true;
            miner.timeStamp = time;

        } else if (time - job.timeStamp > config.pool.share.targetTime + config.pool.share.targetTimeSpan) {
            miner.difficulty = Math.round(miner.difficulty * 0.9);
            retarget = true;
        }

        if (retarget) {
            var newJob = miner.getJob().job;
            miner.pushMessage('job', newJob);
            jobId = newJob.job_id;
            logger.log(`${time - job.timeStamp} msecs from last share, new miner diff set to ${miner.difficulty} for ${miner.account}`);
        } else {
            logger.log(`${time - job.timeStamp} msecs from last share, continue with current diff for ${miner.account}`);
            job.timeStamp = time;
            miner.timeStamp = time;
        }

        setTimeout(() => {
            retargetDifficulty(miner, jobId);
        }, config.pool.share.targetTime + config.pool.share.targetTimeSpan + 1000);
    }
}

function updateStats(miner, valid) {
    let banPercent = config.pool.ban.percent / 100;
    if (banPercent <= 0) return;

    let stats = miner.getBanStats();
    if (!stats.perIP[miner.address]) {
        stats.perIP[miner.address] = { valid: 0, invalid: 0 };
    }
    var minerShares = stats.perIP[miner.address];
    (valid) ? minerShares.valid++ : minerShares.invalid++;

    if (minerShares.valid + minerShares.invalid >= config.pool.ban.checkpoint) {
        if (minerShares.invalid / minerShares.valid >= banPercent) {
            logger.log('Miner banned', miner.address, ':', miner.account);
            stats.bannedMiners[miner.address] = Date.now();
            miner.remove();
        } else {
            minerShares.invalid = minerShares.valid = 0;
        }
    }
}

exports.getTargetHex = getTargetHex;
exports.retarget = retargetDifficulty;
exports.validate = validateShare;