import { Actions, Transaction, TransactionsWidgetState } from '../types'
import * as remixLib from '@remix-project/remix-lib'
import { bytesToHex } from '@ethereumjs/util'
import { hash } from '@remix-project/remix-lib'
import { addressToString } from '@remix-ui/helper'
import { FuncABI } from '@remix-project/core-plugin'

const txHelper = remixLib.execution.txHelper

export const transactionsInitialState: TransactionsWidgetState = {
  activeTab: 'ContractCall',
  sortOrder: 'newest',
  recorderData: {
    journal: [],
    _createdContracts: {},
    _createdContractsReverse: {},
    _usedAccounts: {},
    _abis: {},
    _contractABIReferences: {},
    _linkReferences: {},
  },
  showClearAllDialog: false,
  showSaveDialog: false,
  scenarioInput: 'scenario.json'
}

export const transactionsReducer = (state: TransactionsWidgetState, action: Actions): TransactionsWidgetState => {
  switch (action.type) {
  case 'SET_ACTIVE_TAB':
    return { ...state, activeTab: action.payload }

  case 'SET_SORT_ORDER':
    return { ...state, sortOrder: action.payload }

  case 'SET_CREATED_CONTRACT':
    return {
      ...state,
      recorderData: {
        ...state.recorderData,
        _createdContracts: {
          ...state.recorderData._createdContracts,
          [action.payload.address]: action.payload.timestamp
        },
        _createdContractsReverse: {
          ...state.recorderData._createdContractsReverse,
          [action.payload.timestamp]: action.payload.address
        }
      }
    }

  case 'RECORD_TRANSACTION_EXECUTED': {
    const { from, to, txResult, timestamp, payLoad, accounts } = action.payload
    const value = txResult.tx?.value || '0'

    // Build the transaction record
    const record: Partial<Transaction['record']> = {
      value,
      inputs: txHelper.serializeInputs(payLoad.funAbi),
      parameters: payLoad.funArgs,
      name: payLoad.funAbi.name,
      type: payLoad.funAbi.type
    }

    let newState = { ...state }

    // Handle contract deployment vs contract interaction
    if (!to) {
      const abi = payLoad.contractABI
      const keccak = bytesToHex(hash.keccakFromString(JSON.stringify(abi)))

      record.abi = keccak
      record.contractName = payLoad.contractName
      record.bytecode = payLoad.contractBytecode
      record.linkReferences = payLoad.linkReferences
      record.targetAddress = txResult?.receipt?.contractAddress
      if (record.linkReferences && Object.keys(record.linkReferences).length) {
        const newLinkReferences = { ...newState.recorderData._linkReferences }
        for (const file in record.linkReferences) {
          for (const lib in record.linkReferences[file]) {
            // Find the most recent deployment of this library
            const matchingLibs = newState.recorderData.journal.filter(journal => journal.record.contractName === lib)
            const existingLib = matchingLibs.length > 0
              ? matchingLibs.sort((a, b) => (b.timestamp as number) - (a.timestamp as number))[0]
              : null

            if (existingLib) {
              // This contract is a library - update the link reference with its timestamp token
              newLinkReferences[lib] = `created{${existingLib.timestamp}}`
            } else {
              newLinkReferences[lib] = '<address>'
            }
          }
        }
        newState = {
          ...newState,
          recorderData: {
            ...newState.recorderData,
            _linkReferences: newLinkReferences
          }
        }
      }

      // Store ABI
      newState = {
        ...newState,
        recorderData: {
          ...newState.recorderData,
          _abis: {
            ...newState.recorderData._abis,
            [keccak]: abi
          }
        }
      }

      // Store ABI reference
      newState = {
        ...newState,
        recorderData: {
          ...newState.recorderData,
          _contractABIReferences: {
            ...newState.recorderData._contractABIReferences,
            [timestamp]: keccak
          }
        }
      }

      // Store deployed contract address
      const rawAddress = txResult.receipt.contractAddress
      if (rawAddress) {
        const address = addressToString(rawAddress)
        newState = {
          ...newState,
          recorderData: {
            ...newState.recorderData,
            _createdContracts: {
              ...newState.recorderData._createdContracts,
              [address]: timestamp
            },
            _createdContractsReverse: {
              ...newState.recorderData._createdContractsReverse,
              [timestamp]: address
            }
          }
        }
      }
    } else {
      // Contract interaction - reference the contract that was deployed
      const creationTimestamp = state.recorderData._createdContracts[to]
      record.to = `created{${creationTimestamp}}`
      record.abi = state.recorderData._contractABIReferences[creationTimestamp]
      record.targetAddress = to
    }

    // Replace contract addresses in parameters with tokens
    for (const p in record.parameters) {
      const thisarg = record.parameters[p]
      const thistimestamp = newState.recorderData._createdContracts[thisarg]
      if (thistimestamp) record.parameters[p] = `created{${thistimestamp}}`
    }

    // Replace sender address with account token
    record.from = `account{${accounts.indexOf(from)}}`
    record.status = txResult?.receipt?.status
    record.txHash = txResult?.transactionHash

    // Store used account
    newState = {
      ...newState,
      recorderData: {
        ...newState.recorderData,
        _usedAccounts: {
          ...newState.recorderData._usedAccounts,
          [record.from]: from
        }
      }
    }

    // Add to journal
    newState = {
      ...newState,
      recorderData: {
        ...newState.recorderData,
        journal: [...newState.recorderData.journal as any, { timestamp, record }]
      }
    }

    return newState
  }

  case 'CLEAR_RECORDER_DATA':
    return {
      ...state,
      recorderData: {
        journal: [],
        _createdContracts: {},
        _createdContractsReverse: {},
        _usedAccounts: {},
        _abis: {},
        _contractABIReferences: {},
        _linkReferences: {}
      },
      showClearAllDialog: false
    }

  case 'SHOW_CLEAR_ALL_DIALOG':
    return { ...state, showClearAllDialog: action.payload }

  case 'SHOW_SAVE_DIALOG':
    return { ...state, showSaveDialog: action.payload }

  case 'SET_SCENARIO_INPUT':
    return { ...state, scenarioInput: action.payload }

  default:
    return state
  }
}
