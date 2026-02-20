import React from 'react'
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import type { TransactionsPlugin } from 'apps/remix-ide/src/app/udapp/udappTransactions'
import { FuncABI } from '@remix-project/core-plugin'

export type TabType = 'ContractCall' | 'TransactionList'
export type SortOrder = 'newest' | 'oldest'

export interface Transaction {
  timestamp: number
  record: {
    abi: string
    bytecode: string
    contractName: string
    from: string
    to: string
    inputs: string
    linkReferences: Record<string, any>
    name: string,
    parameters: any[]
    type: 'constructor' | 'function' | 'fallback' | 'receive'
    value: string
    timestamp: number,
    targetAddress: string,
    status: string | number | boolean,
    txHash: string
  }
}

export interface TransactionsWidgetState {
  activeTab: TabType
  sortOrder: SortOrder
  recorderData: RecorderData
  showClearAllDialog: boolean
  showSaveDialog: boolean
  scenarioInput: string
}

export interface TransactionsAppContextType {
  widgetState: TransactionsWidgetState
  dispatch: React.Dispatch<Actions>
  plugin: TransactionsPlugin
  themeQuality: string
}

export type Actions =
  | { type: 'SET_ACTIVE_TAB'; payload: TabType }
  | { type: 'SET_SORT_ORDER'; payload: SortOrder }
  | { type: 'ADD_TRANSACTION'; payload: Transaction }
  | { type: 'UPDATE_TRANSACTION'; payload: { hash: string; updates: Partial<Transaction> } }
  | { type: 'REMOVE_TRANSACTION'; payload: string }
  | { type: 'CLEAR_TRANSACTIONS'; payload: null }
  | { type: 'SET_RECORDING'; payload: boolean }
  | { type: 'RECORD_TRANSACTION_EXECUTED'; payload: { error: any; from: string; to: string; txResult: any; timestamp: number; payLoad: any; accounts: any[] } }
  | { type: 'SET_CREATED_CONTRACT'; payload: { address: string; timestamp: string | number } }
  | { type: 'CLEAR_RECORDER_DATA' }
  | { type: 'SHOW_CLEAR_ALL_DIALOG'; payload: boolean }
  | { type: 'SHOW_SAVE_DIALOG'; payload: boolean }
  | { type: 'SET_SCENARIO_INPUT'; payload: string }

export interface RecorderData {
    journal: Transaction[];
    _createdContracts: { [key: string]: any };
    _createdContractsReverse: { [key: string]: any };
    _usedAccounts: { [key: string]: any };
    _abis: Record<string, FuncABI[]>;
    _contractABIReferences: { [key: string]: any };
    _linkReferences: { [key: string]: any };
  }
