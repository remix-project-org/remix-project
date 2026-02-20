import React from 'react'
import { Plugin } from '@remixproject/engine'
import { Actions, TransactionsWidget, TransactionsWidgetState } from '@remix-ui/run-tab-transactions'

const profile = {
  name: 'udappTransactions',
  displayName: 'Transactions Recorder',
  description: 'Manages the UI and state for transaction recording',
  methods: ['getUI', 'getTransactionRecorderCount'],
  events: ['transactionRecorderUpdated']
}

/**
  * Record transaction as long as the user create them.
  */
export class TransactionsPlugin extends Plugin {
  getWidgetState: (() => TransactionsWidgetState) | null = null
  private getDispatch: (() => React.Dispatch<Actions>) | null = null

  constructor () {
    super(profile)
  }

  setStateGetter(getter: () => TransactionsWidgetState) {
    this.getWidgetState = getter
  }

  setDispatchGetter(getter: () => React.Dispatch<Actions>) {
    this.getDispatch = getter
  }

  getTransactionRecorderCount() {
    return this.getWidgetState()?.recorderData.journal.length || 0
  }

  getUI() {
    return <TransactionsWidget plugin={this} />
  }
}
