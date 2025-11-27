import { eachOf } from 'async'
import { randomBytes } from 'crypto'
import { toChecksumAddress, bytesToHex } from '@ethereumjs/util'

export class LogsManager {
  notificationCallbacks
  subscriptions
  filters
  filterTracking
  oldLogs

  constructor () {
    this.notificationCallbacks = []
    this.subscriptions = {}
    this.filters = {}
    this.filterTracking = {}
    this.oldLogs = []
  }

  checkBlock (blockNumber, block, web3) {
    eachOf(block.transactions, (tx: any, i, next) => {
      const txHash = bytesToHex(tx.hash())
      web3.getTransactionReceipt(txHash, (_error, receipt) => {
        if (!receipt) return next()
        for (const log of receipt.logs) {
          this.oldLogs.push({ type: 'block', blockNumber, block, tx, log, txNumber: i, receipt })
          const subscriptions = this.getSubscriptionsFor({ type: 'block', blockNumber, block, tx, log, receipt })
          for (const subscriptionId of subscriptions) {
            const result = {
              logIndex: '0x1', // 1
              blockNumber: blockNumber,
              blockHash: bytesToHex(block.hash()),
              transactionHash: bytesToHex(tx.hash()),
              transactionIndex: '0x' + i.toString(16),
              // TODO: if it's a contract deploy, it should be that address instead
              address: log.address,
              data: log.data,
              topics: log.topics
            }

            if (result.address === '0x') {
              delete result.address
            }

            const response = { jsonrpc: '2.0', method: 'eth_subscription', params: { result: result, subscription: subscriptionId } }
            this.transmit(response)
          }
        }
      })
    }, (_err) => {
    })
  }

  eventMatchesFilter (changeEvent, queryType, queryFilter) {
    // topics should match
    let noMatch = false
    for (let i = 0; i < queryFilter.topics.length; i++) {
      if (!queryFilter.topics[i]) {
        continue // if the topic isn't defined, we consider it a match.
      }
      if (Array.isArray(queryFilter.topics[i])) {
        if (queryFilter.topics[i].indexOf(changeEvent.log.topics[i]) === -1) {
          noMatch = true
        }
        continue
      }
      if (queryFilter.topics[i] !== changeEvent.log.topics[i]) noMatch = true
    }
    if (noMatch) return false

    if (queryType === 'logs') {
      const fromBlock = parseInt(queryFilter.fromBlock || '0x0')
      let toBlock
      if (queryFilter.toBlock === 'latest' || !queryFilter.toBlock) toBlock = Number.MAX_VALUE
      else toBlock = parseInt(queryFilter.toBlock)
      const targetAddress = toChecksumAddress(queryFilter.address)
      if ((toBlock >= parseInt(changeEvent.blockNumber)) && (fromBlock <= parseInt(changeEvent.blockNumber))) {
        if (changeEvent.log && changeEvent.log.address === targetAddress) {
          return true
        }
      }
      return false
    }
    return false
  }

  getSubscriptionsFor (changeEvent) {
    const matchedSubscriptions = []
    for (const subscriptionId of Object.keys(this.subscriptions)) {
      const subscriptionParams = this.subscriptions[subscriptionId]
      const [queryType, queryFilter] = subscriptionParams

      if (this.eventMatchesFilter(changeEvent, queryType, queryFilter || { topics: []})) {
        matchedSubscriptions.push(subscriptionId)
      }
    }
    return matchedSubscriptions
  }

  getLogsForSubscription (subscriptionId) {
    const subscriptionParams = this.subscriptions[subscriptionId]
    const [_queryType, queryFilter] = subscriptionParams // eslint-disable-line

    return this.getLogsFor(queryFilter)
  }

  transmit (result) {
    this.notificationCallbacks.forEach((callback) => {
      if (result.params.result.raw) {
        result.params.result.data = result.params.result.raw.data
        result.params.result.topics = result.params.result.raw.topics
      }
      callback(result)
    })
  }

  addListener (_type, cb) {
    this.notificationCallbacks.push(cb)
  }

  subscribe (params) {
    const subscriptionId = '0x' + randomBytes(16).toString('hex')
    this.subscriptions[subscriptionId] = params
    return subscriptionId
  }

  unsubscribe (subscriptionId) {
    delete this.subscriptions[subscriptionId]
  }

  newFilter (filterType, params) {
    const filterId = '0x' + randomBytes(16).toString('hex')
    if (filterType === 'block' || filterType === 'pendingTransactions') {
      this.filters[filterId] = { filterType }
    }
    if (filterType === 'filter') {
      this.filters[filterId] = { filterType, params }
    }
    this.filterTracking[filterId] = {}
    return filterId
  }

  uninstallFilter (filterId) {
    delete this.filters[filterId]
  }

  getLogsForFilter (filterId, logsOnly) {
    const { filterType, params } = this.filters[filterId]
    const tracking = this.filterTracking[filterId]

    if (logsOnly || filterType === 'filter') {
      return this.getLogsFor(params || { topics: []})
    }
    if (filterType === 'block') {
      const blocks = this.oldLogs.filter(x => x.type === 'block').filter(x => tracking.block === undefined || x.blockNumber >= tracking.block)
      tracking.block = blocks[blocks.length - 1]
      return blocks.map(block => bytesToHex(block.hash()))
    }
    if (filterType === 'pendingTransactions') {
      return []
    }
  }

  getLogsByTxHash (hash) {
    return this.oldLogs.filter((log) => bytesToHex(log.tx.hash()) === hash)
      .map((log) => {
        return {
          logIndex: '0x1', // 1
          blockNumber: log.blockNumber,
          blockHash: bytesToHex(log.block.hash()),
          transactionHash: bytesToHex(log.tx.hash()),
          transactionIndex: '0x' + log.txNumber.toString(16),
          // TODO: if it's a contract deploy, it should be that address instead
          address: log.log.address,
          data: log.log.data,
          topics: log.log.topics
        }
      })
  }

  getLogsFor (params) {
    const results = []
    for (const log of this.oldLogs) {
      if (this.eventMatchesFilter(log, 'logs', params)) {
        results.push({
          logIndex: '0x1', // 1
          blockNumber: log.blockNumber,
          blockHash: bytesToHex(log.block.hash()),
          transactionHash: bytesToHex(log.tx.hash()),
          transactionIndex: '0x' + log.txNumber.toString(16),
          // TODO: if it's a contract deploy, it should be that address instead
          address: log.log.address,
          data: log.log.data,
          topics: log.log.topics
        })
      }
    }

    return results
  }
}
