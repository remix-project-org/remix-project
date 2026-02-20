import React from 'react'
import { Engine, Plugin } from '@remixproject/engine'
import { Actions, EnvironmentWidget } from '@remix-ui/run-tab-environment'
import type { Blockchain } from '../../blockchain/blockchain'
import { WidgetState, Account, PassphraseCreationPrompt } from '@remix-ui/run-tab-environment'

const profile = {
  name: 'udappEnv',
  displayName: 'Udapp Environment',
  description: 'Maintains the schema for deployment and execution environment',
  methods: ['getUI', 'getSelectedAccount', 'isSmartAccount', 'getDefaultProvider', 'getPassphrasePrompt', 'getSelectedProvider', 'getNetwork'],
  events: []
}

export class EnvironmentPlugin extends Plugin {
  engine: Engine
  blockchain: Blockchain
  getWidgetState: (() => WidgetState) | null = null
  private getDispatch: (() => React.Dispatch<Actions>) | null = null
  private isInitialized: boolean = false

  constructor () {
    super(profile)
  }

  markAsInitialized() {
    this.isInitialized = true
  }

  isAlreadyInitialized() {
    return this.isInitialized
  }

  setStateGetter(getter: () => WidgetState) {
    this.getWidgetState = getter
  }

  setDispatchGetter(getter: () => React.Dispatch<Actions>) {
    this.getDispatch = getter
  }

  getSelectedAccount () {
    const state = this.getWidgetState?.()
    return state?.accounts?.selectedAccount || state?.accounts?.defaultAccounts[0]?.account
  }

  isSmartAccount (address: string) {
    const state = this.getWidgetState?.()
    const smartAccounts = state?.accounts?.smartAccounts || []
    if (Array.isArray(smartAccounts)) {
      return smartAccounts.some((account: Account) => account.account === address)
    }
    return false
  }

  getDefaultProvider () {
    const state = this.getWidgetState?.()

    return state?.providers?.defaultProvider
  }

  getSelectedProvider () {
    const state = this.getWidgetState()

    return state?.providers?.selectedProvider
  }

  getNetwork () {
    const state = this.getWidgetState()
    return state?.network
  }

  getPassphrasePrompt(): React.ReactElement {
    return <PassphraseCreationPrompt udappEnv={this} />
  }

  setMatchPassphrase(matchPassphrase: string) {
    this.getDispatch()({ type: 'SET_MATCH_PASSPHRASE', payload: matchPassphrase })
  }

  getUI(engine: Engine, blockchain: Blockchain) {
    this.engine = engine
    this.blockchain = blockchain
    return <EnvironmentWidget plugin={this} />
  }
}
