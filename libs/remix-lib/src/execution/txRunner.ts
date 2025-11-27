'use strict'
import { EventManager } from '../eventManager'
import { EOACode7702AuthorizationList } from '@ethereumjs/util'
import type { TransactionReceipt } from 'ethers'
/*
 * A type that represents a `0x`-prefixed hex string.
 */
export type PrefixedHexString = `0x${string}`

export type Transaction = {
  from: string,
  fromSmartAccount: boolean,
  to?: string,
  deployedBytecode?: string
  value: string,
  data: string,
  gasLimit: number,
  useCall?: boolean,
  timestamp?: number,
  signed?: boolean,
  authorizationList?: EOACode7702AuthorizationList
  type?: '0x1' | '0x2' | '0x4'
}

export type TxResult = {
  receipt: TransactionReceipt,
  transactionHash: string,
  tx: any
}

export class TxRunner {
  event
  pendingTxs
  queueTxs
  opt
  internalRunner
  constructor (internalRunner, opt) {
    this.opt = opt || {}
    this.internalRunner = internalRunner
    this.event = new EventManager()

    this.pendingTxs = {}
    this.queueTxs = []
  }

  rawRun (args: Transaction, confirmationCb, gasEstimationForceSend, promptCb, cb) {
    run(this, args, args.timestamp || Date.now(), confirmationCb, gasEstimationForceSend, promptCb, cb)
  }

  execute (args: Transaction, confirmationCb, gasEstimationForceSend, promptCb, callback) {
    if (!args.data) args.data = '0x'
    if (args.data.slice(0, 2) !== '0x') args.data = '0x' + args.data
    if (args.deployedBytecode && args.deployedBytecode.slice(0, 2) !== '0x') {
      args.deployedBytecode = '0x' + args.deployedBytecode
    }
    this.internalRunner.execute(args, confirmationCb, gasEstimationForceSend, promptCb, callback)
  }
}

function run (self, tx: Transaction, stamp, confirmationCb, gasEstimationForceSend = null, promptCb = null, callback = null) {
  if (Object.keys(self.pendingTxs).length) {
    return self.queueTxs.push({ tx, stamp, confirmationCb, gasEstimationForceSend, promptCb, callback })
  }
  self.pendingTxs[stamp] = tx
  self.execute(tx, confirmationCb, gasEstimationForceSend, promptCb, function (error, result) {
    delete self.pendingTxs[stamp]
    if (callback && typeof callback === 'function') callback(error, result)
    if (self.queueTxs.length) {
      const next = self.queueTxs.pop()
      run(self, next.tx, next.stamp, next.confirmationCb, next.gasEstimationForceSend, next.promptCb, next.callback)
    }
  })
}
