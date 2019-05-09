# Boolberry Mining Pool
Mining pool for Boolberry cryptocurrency.

## Structure Overview
- **pool/init.js**
This is pool initialisation script. Init.js relies on clusters to start mining system as fork and runs utility processes in the master thread. Among utility routines are payments processing, statistics, DB connection, scratchpad storage routine, block unlocking proccess.
- **pool/blocktemplate.js**
Refresh function handles blockchain scanning for new blocktemplate. It also includes blocktemplate utility functions. When new blocktemplate is received an event is emmited to send new jobs to connected miners.
- **pool/alias.js**
Functions to manage alias registration queue and check miners logins.
- **pool/scratchpad.js**
Stores current scratchpad to the given location with given interval. Also consists of addendum handle functions.
- **pool/share.js**
This script contains function to validate and store miners shares, update miners statistics and retarget difficulty based on miner performance.
- **miner/miner.js**
This is a miner object created for each miner connection. It stores miner details, create miners jobs and handles miners request (login, getjob, submit, keepalived). 
- **miner/login.js**
A helper script to verify miners login info.
- **rpc/request.js**
This is low-level wallet and daemon remote calls handler.
- **rpc/call.js**
Script contains all supported RPC calls.
- **server/stratum.js**
This is a stratum protocol implementation.
- **server/express.js**
Pool's web server is built on express.js and offers a list of API calls to monitor pools activity.
- **db/balance.js**
Script takes control of miner balances and reward payments.
- **db/block.js**
Miners shares and blocks are stored in DB with this script.
- **db/stat.js**
Statistic process uses this script to store pool stats.
- **log/logger.js**
A basic logging implementation.
- **config/pool.json**
Pool settings can be updated here.
- **web_gui**
Web interface source files
- **web_gui/info.json**
Content for Info section of the dashboard
- **web_gui/dist/frontend**
Compiled web interface. Your webserver can be configured to use this folder as a website.


## Installation
This is a complete installation guide for Ubuntu 18.04 LTS. It includes Boolberry daemon installation and basic setup. Before you start, log in with a user account for managing the pool. Open a terminal window and run following commands.

### Installing Boolberry
Update currently installed packages:
```
sudo apt update
```
Install Boolberry required packages:
```
sudo apt install -y build-essential g++ python-dev autotools-dev libicu-dev build-essential libbz2-dev cmake git libboost-all-dev screen
```
Navigate to user home directory:
```
cd ~/
```
Download latest Boolbery source files:
```
git clone https://github.com/cryptozoidberg/boolberry.git
```
Navigate to boolberry folder:
```
cd boolberry
```
Create build folder:
```
mkdir build
```
Navigate to build folder:
```
cd ./build
```
Build Boolberry daemon:
```
cmake ..
```
Build Boolberry wallet:
```
make daemon simplewallet
```
### Running Boolberry node
This guide uses [Screen](https://help.ubuntu.com/community/Screen) to run and manage pool required processes. Each process runs in a dedicated Screen session and thus doesn't depend on current terminal session. 
Navigate to boolberry build folder:
```
cd ./src
```
Run a new screen session:
```
screen -S daemon
```
Run Boolberry daemon:
```
./boolbd
```
Wait until Boolberry blockchain is synchronized and close current Screen session by pressing `Ctrl+a`, and then `d` button.
Run a new screen session:
```
screen -S wallet
```
Generate new Boolberry wallet with custom file name, e.g. "pool_wallet":
```
./simplewallet --generate-new-wallet pool_wallet
```
Enter new password and save given wallet address seed phrase in a secured place.
Run Boolberry wallet:
```
./simplewallet --wallet-file pool_wallet --password <WALLET PASSWORD> --rpc-bind-port 10103
```
Close current Screen session by pressing `Ctrl+a`, and then `d` button.
For more information please refer to the [Boolberry user guide](https://docs.boolberry.com/)
### Installing Redis DB
Navigate to user home directory:
```
cd ~/
```
Download latest stable Redis version 5:
```
wget http://download.redis.io/releases/redis-5.0.4.tar.gz
```
Extract downloaded files:
```
tar xvzf redis-5.0.4.tar.gz
```
Navigate to Redis folder:
```
cd redis-5.0.4
```
Build Redis:
```
make
```
Complete Redis installation:
```
sudo make install
```
Opent Redis configuration file in the editor:
```
nano redis.conf
```
Find entry `stop-writes-on-bgsave-error yes` and change it to `stop-writes-on-bgsave-error no`. Then exit the editor by pressing `Ctrl+x`, then `Shift+y`, then `Enter`
Run Redis process:
```
./src/redis-server ./redis.conf --daemonize yes
```
For more information refer to [installation guide](https://linuxhint.com/install_redis_ubuntu/) and Redis [official page](https://redis.io)
### Installing Node.JS
Install Node.JS package:
```
sudo apt install nodejs
```
Install node package manager and prerequisites:
```
sudo apt install -y libssl1.0-dev nodejs-dev node-gyp npm
```
### Install mining pool
Navigate to user home directory:
```
cd ~/
```
Download the latest Boolbery source files:
```
git clone https://github.com/hyle-team/bbr_mining_pool.git
```
Navigate to pool folder:
```
cd ./bbr_mining_pool/
```
Download pool required packages:
```
npm update
```
Opent pool configuration file in the editor:
```
nano ./config/pool.js
```
Find entry `address` and set generated wallet address it's value. Example:
```
“address” : “1EsE4rpuLhYQMKr4dD3t92NkyVZXGhvhL4AcLvLXBNqTRyDgKUmwVPjKUeCq1F3avK2RucftxzhUnFeKFcYXrN1hRU1rmUq”
```
Then exit the editor by pressing `Ctrl+x`, then `Shift+y`, then `Enter`
### Running Boolberry pool
Run a new screen session:
```
screen -S pool
```
Run Boolberry pool:
```
./node app
```

## Settings
Mining pool settings are stored in ./config/pool.json file. Time values are milliseconds by default.

- **daemon.host** (default: localhost) - for Boolberry daemon IP address
- **daemon.port** (default: 10102) - Boolberry daemon port
- **wallet.host** (default: localhost) - Boolberry wallet IP address
- **wallet.port** (default: 10103) - Boolberry wallet port
- **scratchpad.path** (default: /boolberry/scratchpad.bin) - Boolberry scratchpad store location
- **scratchpad.path** (default: every 4 hours) - Boolberry scratchpad store interval
- **server.remote** (default: false) - wether API can be accessed from a remote server or local environment only
- **server.api** (default: 3000) - API server port
- **server.port** (default: 6000) - stratum server port for miners connection
- **server.difficulty** (default: 3,25 MH/s) - starting job difficulty for new connections in hash/sec
- **share.targetTime** (deafault: 1 min) - vardiff algorighm target interval between miner shares
- **share.targetTimeSpan** (deafault: 30 sec) - vardiff algorighm fluctuation for target time
- **share.timeout** (default: 10 min) - timeout for miner connection drop due to inactivity
- **share.weight** (default: 240000) - share scoring estimation coefficient
- **block.unlockDepth** (default: 30) - block depth to unlock miners rewards
- **block.unlockInterval** (default: 2 min) - block unlocking check interval
- **logger.size** (default: 10000) - number of cached log messages for API call localhost:port/log
- **stats.history** (default: 500000) - max number of pool statistics entries stored in Redis DB
- **stats.interval** (default: 10 min) - pool statistics checkpoint save interval
- **stats.interval** (default: 10 min) - pool statistics average values estimation time frame
- **ban.time** (default: 10 min) - invalid shares miner ban period
- **ban.percent** (default: 5%) - invalid shares miner ban percentage
- **ban.checkpoint** (default: 50) - shares count between miner shares validity check
- **payment.sweep** (default: 0.1 BBR) - RPC sweep_below value
- **payment.units** (default: 1 BBR) - value to calculate BBR decimal point
- **payment.mixin** (default: 0) - number of mixin for miner payments
- **payment.fee** (deafult: 0.002 BBR) - miners reward payment fee
- **payment.threshold** (default: 1 BBR) - miners balance payment threshold
- **payment.interval** (default: 1 hour) - miners reward payment interval
- **address** - pool wallet address
- **refreshBlockInterval** (default: 1 sec) - blockchain scan interval
- **fee** (default: 0%) - in percents pool reward fee

## Known issues
- web interface doesn't support alias registration
- remove worker button is disabled
- payment ID is not supported


