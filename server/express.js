const express = require('express');
const bodyParser = require('body-parser');
const logger = require('../log');
const db = require('../db');
const config = require('../config');
const alias = require('../pool/alias');

function startServer() {
  const app = express();
  app.listen(config.pool.server.api, () => {
    logger.log('Express server started on port', config.pool.server.api);
  });

  app.use(bodyParser.json());

  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
  });

  app.use((req, res, next) => {
    let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
    if (config.pool.server.remote || ip == '127.0.0.1' || ip == '::ffff:127.0.0.1' || ip == '::1') {
      next();
    } else if (req.path === '/scratchpad') {
      next();
    }
    else {
      res.end('Remote connection refused');
    }
  });

  app.get('/scratchpad', function (req, res) {
    var file = config.pool.scratchpad.path;
    res.download(file);
  });

  app.get('/log', async (req, res) => {
    res.end(logger.read());
  });

  app.get('/info', async (req, res) => {
    res.end(JSON.stringify(config.info));
  });

  app.get('/blocks', async (req, res) => {
    let blocks = await db.stats.getLastBlocks();
    res.send(blocks);
  });

  app.get('/blocks/:count', async (req, res) => {
    let blocks = await db.stats.getLastBlocks(req.params.count);
    res.send(blocks);
  });

  app.get('/blocks/:count/:offeset', async (req, res) => {
    let blocks = await db.stats.getLastBlocks(req.params.count, req.params.offset);
    res.send(blocks);
  });

  app.get('/tx/:account/', async (req, res) => {
    let transactions = await db.balance.getLastTransactions(req.params.account);
    res.send(transactions)
  });

  app.get('/tx/:account/:timeStamp', async (req, res) => {
    let transactions = await db.balance.getLastTransactions(req.params.account, req.params.timeStamp);
    res.send(transactions)
  });

  app.get('/balance/:account/', async (req, res) => {
    let balance = await db.balance.getBalance(req.params.account);
    res.send(balance.toString());
  });

  app.get('/alias/:address/:alias/', async (req, res) => {
    let request = await alias.request(req.params.address, req.params.alias);
    res.send((request) ? true : false);
  });

  app.get('/check/:alias/', async (req, res) => {
    let availability = await alias.isAvailable(req.params.alias);
    res.send(availability);
  });

  app.get('/queue', async (req, res) => {
    let requests = await alias.getQueue();
    res.send(requests)
  });

  app.get('/dashboard', async (req, res) => {
    let output = await db.stats.getDashboard()
    res.end(JSON.stringify(output));
  });

  app.get('/miner/:account', async (req, res) => {
    let output = await db.stats.getCurrentMinerStats(req.params.account);
    res.end(JSON.stringify(output));

    return;
  });
}

module.exports = startServer;