## Remix Simulator
[![npm version](https://badge.fury.io/js/%40remix-project%2Fremix-simulator.svg)](https://www.npmjs.com/package/@remix-project/remix-simulator)
[![npm](https://img.shields.io/npm/dt/@remix-project/remix-simulator.svg?label=Total%20Downloads)](https://www.npmjs.com/package/@remix-project/remix-simulator)
[![npm](https://img.shields.io/npm/dw/@remix-project/remix-simulator.svg)](https://www.npmjs.com/package/@remix-project/remix-simulator)
[![GitHub](https://img.shields.io/github/license/mashape/apistatus.svg)](https://github.com/remix-project-org/remix-project/tree/master/libs/remix-simulator)
[![contributions welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg?style=flat)](https://github.com/remix-project-org/remix-project/issues)

`@remix-project/remix-simulator` is a web3 wrapper for different kinds of providers. It is used in `remix-tests` library and in Remix IDE codebase.

### Installation
`@remix-project/remix-simulator` is an NPM package and can be installed using NPM as:

`yarn add @remix-project/remix-simulator`

### How to use

`@remix-project/remix-simulator` implements:

* [X] web3_clientVersion
* [X] web3_sha3
* [X] net_version
* [X] net_listening
* [X] net_peerCount
* [X] eth_protocolVersion
* [X] eth_syncing
* [X] eth_coinbase
* [X] eth_mining
* [X] eth_hashrate
* [~] eth_gasPrice
* [~] eth_accounts
* [X] eth_blockNumber
* [X] eth_getBalance
* [~] eth_getStorageAt
* [X] eth_getTransactionCount
* [X] eth_getBlockTransactionCountByHash
* [X] eth_getBlockTransactionCountByNumber
* [~] eth_getUncleCountByBlockHash
* [~] eth_getUncleCountByBlockNumber
* [X] eth_getCode
* [~] eth_sign
* [X] eth_sendTransaction
* [x] eth_sendRawTransaction
* [X] eth_call
* [~] eth_estimateGas
* [X] eth_getBlockByHash
* [X] eth_getBlockByNumber
* [X] eth_getTransactionByHash
* [X] eth_getTransactionByBlockHashAndIndex
* [X] eth_getTransactionByBlockNumberAndIndex
* [X] eth_getTransactionReceipt
* [_] eth_getUncleByBlockHashAndIndex
* [_] eth_getUncleByBlockNumberAndIndex
* [X] eth_getCompilers (DEPRECATED)
* [X] eth_compileSolidity (DEPRECATED)
* [X] eth_compileLLL (DEPRECATED)
* [X] eth_compileSerpent (DEPRECATED)
* [X] eth_newFilter
* [X] eth_newBlockFilter
* [X] eth_newPendingTransactionFilter
* [X] eth_uninstallFilter
* [~] eth_getFilterChanges
* [~] eth_getFilterLogs
* [X] eth_getLogs
* [_] eth_getWork
* [_] eth_submitWork
* [_] eth_submitHashrate
* [_] eth_getProof
* [_] db_putString
* [_] db_getString
* [_] db_putHex
* [_] db_getHex
* [_] debug_traceTransaction
* [X] eth_subscribe
* [X] eth_unsubscribe
* [_] miner_start
* [_] miner_stop
* [_] personal_listAccounts
* [_] personal_lockAccount
* [_] personal_newAccount
* [_] personal_importRawKey
* [_] personal_unlockAccount
* [_] personal_sendTransaction
* [_] rpc_modules

### Contribute

Please feel free to open an issue or a pull request. 

In case you want to add some code, do have a look at our contribution guidelines [here](https://github.com/remix-project-org/remix-project/blob/master/CONTRIBUTING.md). Reach us on [Discord](https://discord.gg/qhpCQGWkmf) in case of any queries.

### License
MIT © 2018-21 Remix Team
