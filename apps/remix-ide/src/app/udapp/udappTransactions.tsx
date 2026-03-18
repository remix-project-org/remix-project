import React from 'react'
import { Plugin } from '@remixproject/engine'
import { Actions, TransactionsWidget, TransactionsWidgetState, replayTransaction, RecorderData, Transaction } from '@remix-ui/run-tab-transactions'

const profile = {
  name: 'udappTransactions',
  displayName: 'Transactions Recorder',
  description: 'Manages the UI and state for transaction recording',
  methods: ['getUI', 'getTransactionRecorderCount', 'runScenario'],
  events: ['transactionRecorderUpdated']
}

/**
  * Record transaction as long as the user create them.
  */
export class TransactionsPlugin extends Plugin {
  getWidgetState: (() => TransactionsWidgetState) | null = null
  private _getDispatch: (() => React.Dispatch<Actions>) | null = null

  constructor () {
    super(profile)
  }

  setStateGetter(getter: () => TransactionsWidgetState) {
    this.getWidgetState = getter
  }

  setDispatchGetter(getter: () => React.Dispatch<Actions>) {
    this._getDispatch = getter
  }

  getDispatch() {
    return this._getDispatch?.()
  }

  getTransactionRecorderCount() {
    return this.getWidgetState()?.recorderData.journal.length || 0
  }

  async runScenario(scenarioPath: string) {
    try {
      if (!scenarioPath) {
        throw new Error('A scenario is required')
      }
      const scenarioContent = await this.call('fileManager', 'readFile', scenarioPath)
      const scenario = JSON.parse(scenarioContent)

      // Validate scenario structure
      if (!scenario.transactions || !Array.isArray(scenario.transactions)) {
        throw new Error('Invalid scenario: transactions array is required')
      }

      if (scenario.transactions.length === 0) {
        throw new Error('No transactions found in scenario')
      }
      const dispatch = this.getDispatch?.()

      if (!dispatch) {
        throw new Error('Dispatch not available')
      }

      // Build RecorderData from scenario
      const recorderData: RecorderData = {
        journal: scenario.transactions || [],
        _createdContracts: {},
        _createdContractsReverse: {},
        _usedAccounts: scenario.accounts || {},
        _abis: scenario.abis || {},
        _contractABIReferences: {},
        _linkReferences: scenario.linkReferences || {}
      }

      scenario.transactions.forEach((tx: Transaction) => {
        if (tx.record.type === 'constructor') {
          dispatch({ type: 'SET_CREATED_CONTRACT', payload: { address: tx.record.targetAddress, timestamp: tx.timestamp } })
        }
        if (tx.record.value && typeof tx.record.value === 'string') {
          tx.record.value = BigInt(tx.record.value)
        }
      })

      await this.call('notification', 'toast', `Replaying ${scenario.transactions.length} transaction(s)...`)

      // Replay each transaction
      for (let i = 0; i < scenario.transactions.length; i++) {
        const transaction = scenario.transactions[i]

        try {
          await replayTransaction(transaction, recorderData, this)
          // Add artificial pause between transactions
          await new Promise(resolve => setTimeout(resolve, 500))
        } catch (error) {
          console.error(`Error replaying transaction ${i + 1}:`, error)
          await this.call('notification', 'toast', `Error replaying transaction ${i + 1}: ${error.message}`)
          throw error
        }
      }
    } catch (error) {
      console.error('Error running scenario:', error)
      await this.call('notification', 'toast', `Error running scenario: ${error.message}`)
      throw error
    }
  }

  getUI(context?: string) {
    return <TransactionsWidget plugin={this} context={context} />
  }
}
