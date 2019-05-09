const request = require('./request');
const config = require('../config');

function DataBinary(method, params) {
    this.id = '0';
    this.jsonrpc = '2.0';
    this.method = method;
    this.params = params;
}

async function getBlockTemplate() {
    //const params = { reserve_size: 8, wallet_address: config.pool.address, alias_details: aliasInfo };
    const params = { reserve_size: 8, wallet_address: config.pool.address};
    let dataBinary = new DataBinary('getblocktemplate', params);
    let response = await request.jsonRequest(config.pool.daemon.host, config.pool.daemon.port, JSON.stringify(dataBinary))
        .catch((error) => {
            return ({ error: error });
        });
    return response;
}

async function submitBlock(block) {
    let dataBinary = new DataBinary('submitblock', block);
    let response = await request.jsonRequest(config.pool.daemon.host, config.pool.daemon.port, JSON.stringify(dataBinary))
        .catch((error) => {
            return ({ error: error });
        });
    return response;
}

async function getAliasDetails(alias) {
    let dataBinary = new DataBinary('get_alias_details', { alias: alias });
    let response = await request.jsonRequest(config.pool.daemon.host, config.pool.daemon.port, JSON.stringify(dataBinary))
        .catch((error) => {
            return ({ error: error });
        });
    return response;
}

async function getBalance() {
    let dataBinary = new DataBinary('getbalance', '');
    let response = await request.jsonRequest(config.pool.wallet.host, config.pool.wallet.port, JSON.stringify(dataBinary))
        .catch((error) => {
            return ({ error: error });
        });
    return response;
}

async function transfer(destinations) {
    let params = {
        destinations: destinations,
        fee: config.pool.payment.fee,
        mixin: config.pool.payment.mixin
    };
    let dataBinary = new DataBinary('transfer', params);
    let response = await request.jsonRequest(config.pool.wallet.host, config.pool.wallet.port, JSON.stringify(dataBinary))
        .catch((error) => {
            return ({ error: error });
        });
    return response;
}

/*
async function sweepBelow(address, amount) {
    let params = {
        address: address,
        amount: amount,
        fee: config.pool.payment.fee,
        mixin: config.pool.payment.mixin
    };
    let dataBinary = new DataBinary('sweep_below', params);
    let response = await request.jsonRequest(config.pool.wallet.host, config.pool.wallet.port, JSON.stringify(dataBinary))
        .catch((error) => {
            return ({ error: error });
        });
    return response;
} */

async function getBlockHeaderByHeight(height) {
    let dataBinary = new DataBinary('getblockheaderbyheight', { height: height });
    let response = await request.jsonRequest(config.pool.daemon.host, config.pool.daemon.port, JSON.stringify(dataBinary))
        .catch((error) => {
            return ({ error: error });
        });
    return response;
}

async function getLastBlockHeader() {
    let dataBinary = new DataBinary('getlastblockheader', '');
    let response = await request.jsonRequest(config.pool.daemon.host, config.pool.daemon.port, JSON.stringify(dataBinary))
        .catch((error) => {
            return ({ error: error });
        });
    return response;
}

async function getInfo() {
    let dataBinary = new DataBinary('getinfo', { flags: 4294967295 });
    let response = await request.jsonRequest(config.pool.daemon.host, config.pool.daemon.port, JSON.stringify(dataBinary))
        .catch((error) => {
            return ({ error: error });
        });
    return response;
}

module.exports = {
    getBlockTemplate: getBlockTemplate,
    submitBlock: submitBlock,
    getAliasDetails: getAliasDetails,
    getBalance: getBalance,
    transfer: transfer,
    getBlockHeaderByHeight: getBlockHeaderByHeight,
    getLastBlockHeader: getLastBlockHeader,
    getInfo: getInfo
};