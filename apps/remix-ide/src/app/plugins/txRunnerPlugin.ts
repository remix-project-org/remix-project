'use strict'
import { Plugin } from '@remixproject/engine'
import { Transaction, EventManager, execution, Registry } from '@remix-project/remix-lib'

const { TxRunnerWeb3 } = execution
const profile = {
  name: 'txRunner',
  displayName: 'TxRunner',
  description: 'Transaction deployments',
  methods: ['resetInternalRunner', 'rawRun'],
  events: []
}

export class TxRunnerPlugin extends Plugin {
  event
  opt = {}
  internalRunner

  constructor () {
    super(profile)
    this.event = new EventManager()
  }

  resetInternalRunner() {
    this.internalRunner = new TxRunnerWeb3(this)
  }

  setRunnerOptions(runnerOptions) {
    this.opt = runnerOptions
  }

  async rawRun (args: Transaction) {
    if (!this.internalRunner) {
      throw new Error('TxRunner internal runner not initialized. Call resetInternalRunner() first.')
    }

    const result = await this.run(args, args.timestamp || Date.now())

    return result
  }

  async execute (args: Transaction) {
    if (!args.data) args.data = '0x'
    if (args.data.slice(0, 2) !== '0x') args.data = '0x' + args.data
    if (args.deployedBytecode && args.deployedBytecode.slice(0, 2) !== '0x') {
      args.deployedBytecode = '0x' + args.deployedBytecode
    }

    const result = await this.internalRunner.execute(args)

    return result
  }

  async run (tx: Transaction, stamp) {
  //   if (Object.keys(this.pendingTxs).length) {
  //     return this.queueTxs.push({ tx, stamp })
  //   }
  //   this.pendingTxs[stamp] = tx
    const result = await this.execute(tx)

    return result
    // delete this.pendingTxs[stamp]
    // if (this.queueTxs.length) {
    //   const next = this.queueTxs.pop()
    //   await this.run(next.tx, next.stamp)
    // }
  }
}
