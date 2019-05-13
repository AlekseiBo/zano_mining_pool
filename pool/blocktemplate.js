const events = require('events');
const rpc = require('../rpc');
const logger = require('../log');
const config = require('../config');
const alias = require('./alias');
const crypto = require('crypto');
const crUtil = require('zano-util');
const instanceId = crypto.randomBytes(4);

const blockTemplateCount = 3;
var currentBlockTemplate;
var validBlockTemplates = [];
var newBlockTemplate = new events.EventEmitter();

var info = {};
info.last_block_hash = '';
info.tx_count = -1;

class BlockTemplate {
    constructor(template) {
        this.blob = template.blocktemplate_blob;
        this.idHash = crypto.createHash('md5').update(template.blocktemplate_blob).digest('hex');
        this.difficulty = template.difficulty;
        this.height = template.height;
        this.seed = template.seed;
        this.buffer = Buffer.from(this.blob, 'hex');
        this.previousBlockHash = template.prev_hash;
    }

    static notifier() {
        return newBlockTemplate;
    }

    static current() {
        return currentBlockTemplate;
    }

    static validBlocks() {
        return validBlockTemplates;
    }

    static getInfo() {
        return info;
    }

    static async refresh() {
        let res = await rpc.getInfo();
        //logger.debug(JSON.stringify(res));
        if (res.error || res.result.status !== 'OK') {
            logger.error('Unable to get blockchain info', JSON.stringify(res.error));
        } else {
            if ((res.result.last_block_hash != info.last_block_hash) ||
                res.result.tx_count > info.tx_count) {
                let response = await rpc.getBlockTemplate();
                if (response.error) {
                    logger.error('Unable to get blocktemplate', JSON.stringify(response.error));
                    return;
                }

                if (currentBlockTemplate &&
                    validBlockTemplates.push(currentBlockTemplate) > blockTemplateCount) {
                    validBlockTemplates.shift();
                }
                PushBlockTemlate(response.result);
            }
            info = res.result;
        }
    }

    static async getBlockHeader(height = null) {
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

    nextBlob() {
        let extraNonce = crypto.pseudoRandomBytes(8);
        return '0x' + crUtil.get_hash_from_block_template_with_extra(this.buffer, extraNonce).toString('hex');
    }
}

function PushBlockTemlate(template) {
    currentBlockTemplate = new BlockTemplate(template);
    logger.log(`New block template loaded with height: ${currentBlockTemplate.height}, diff: ${currentBlockTemplate.difficulty}`);
    startTime = new Date();
    newBlockTemplate.emit('NewTemplate');
}

module.exports = BlockTemplate;