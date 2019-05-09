const cluster = require('cluster');
const login = require('./login');
const config = require('../config');
const logger = require('../log');
const share = require('../pool/share');
const BlockTemplate = require('../pool/blocktemplate');

const validJobsCount = 5;

var connectedMiners = {};
var bannedMiners = {};
var statsPerIP = {};
var doRetarget = true;

Buffer.prototype.toByteArray = function () {
    return Array.prototype.slice.call(this, 0)
}

class Miner {
    constructor(id, login, pass, address, difficulty, pushMessage) {
        this.id = id;
        this.login = login;
        this.pass = (pass.match(/^[a-z0-9]+$/i) !== null) ? pass : '';
        this.address = address;
        this.pushMessage = pushMessage;
        this.difficulty = difficulty;
        this.timeStamp = Date.now();
        this.validJobs = [];
        this.account = this.login;
        this.cachedJob = null;

        this.listener = this.newTemplate.bind(this);
        BlockTemplate.notifier().on('NewTemplate', this.listener);
    }

    static minersCount() {
        return Object.keys(connectedMiners).length;
    }

    static async executeMethod(method, params, address, reply, message) {
        if (checkBan(address)) {
            logger.log('Banned IP', address);
            reply('your IP is banned');
            return;
        }

        switch (method) {
            case 'eth_submitLogin':
                let loggedIn = await login(params, reply);
                if (loggedIn) {
                    let difficulty = config.pool.server.difficulty;
                    let id = uid();
                    var miner = new Miner(id, params.login, params.pass, address, difficulty, message);
                    connectedMiners[id] = miner;
                    logger.log('Miner logged in', miner.address, ':', miner.account);
                    reply(null, miner.getJob());
                }
                break;
            case 'eth_getwork':
                var miner = connectedMiners[params.id];
                if (miner) {
                    reply(null, miner.getJob());
                } else {
                    reply('Unauthenticated');
                }
                break;
            case 'eth_submitwork':
                var miner = connectedMiners[params.id];
                if (miner) {
                    if (share.validate(miner, params, reply)) {
                        reply(null, { status: 'OK' });
                        if (doRetarget) {
                            share.retarget(miner, params.job_id);
                        }
                    }
                } else {
                    logger.log('Miner unauthenticated');
                    reply('Unauthenticated');
                }
                break;
            case 'keepalived':
                reply(null, { status: 'KEEPALIVED' });
                break;
        }
    }

    getJob() {
        const currentTemplate = BlockTemplate.current()
        let blob = currentTemplate.nextBlob();
        let target = share.getTargetHex(this);
        let heightBuffer = Buffer.alloc(8);
        heightBuffer.writeUInt32BE(currentTemplate.height, 4);

        var newJob = {
            id: uid(),
            extraNonce: currentTemplate.extraNonce,
            height: currentTemplate.height,
            difficulty: this.difficulty,
            submissions: [],
            blockHash: currentTemplate.idHash,
            seed: currentTemplate.seed,
            timeStamp: Date.now()
        };

        if (this.validJobs.push(newJob) > validJobsCount)
            this.validJobs.shift();

        this.cachedJob = [
            blob,
            '0x' + currentTemplate.seed,
            '0x' + target,
            '0x' + heightBuffer.toString('hex'),
        ];

        let reply = this.cachedJob

        return reply;
    }

    async newTemplate() {
        var job = this.getJob().job;
        this.pushMessage('job', job);

        if (doRetarget) {
            setTimeout(() => {
                share.retarget(this, job.job_id);
            }, config.pool.share.targetTime + config.pool.share.targetTimeSpan + 1000);
        }
    }

    getBanStats() {
        return { bannedMiners: bannedMiners, perIP: statsPerIP };
    }

    remove() {
        BlockTemplate.notifier().removeListener('NewTemplate', this.listener);
        this.validJobs = [];
        delete connectedMiners[this.id];
    }
}

function uid() {
    var min = 100000000000000;
    var max = 999999999999999;
    var id = Math.floor(Math.random() * (max - min + 1)) + min;
    return id.toString();
}

function checkBan(address) {
    if (config.pool.ban.percent <= 0 || !bannedMiners[address])
        return false;

    var banTime = Date.now() - bannedMiners[address];
    if (config.pool.ban.time - banTime > 0) {
        return true;
    } else {
        delete bannedMiners[address];
        delete statsPerIP[address];
        logger.log('Ban has expired for', address);
        return false;
    }
}

if (cluster.isWorker) {
    setInterval(() => {
        var now = Date.now();
        let timeout = config.pool.share.timeout;

        for (let id in connectedMiners) {
            let miner = connectedMiners[id];
            let timeGap = now - miner.timeStamp;
            if (timeGap > timeout) {
                logger.log(`Miner was idle for ${timeGap / 1000} and now removed ${miner.account}`);
                miner.remove();
            }
        }
        logger.log(`Pool has ${Object.keys(connectedMiners).length} active miners`);

    }, config.pool.share.timeout);
}

module.exports = Miner;