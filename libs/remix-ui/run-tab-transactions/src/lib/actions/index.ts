import React from 'react'
import { trackMatomoEvent } from '@remix-api'
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { TransactionsPlugin } from 'apps/remix-ide/src/app/udapp/udappTransactions'
import { Actions, Transaction, RecorderData } from '../types'
import * as remixLib from '@remix-project/remix-lib'
import { bytesToHex } from '@ethereumjs/util'
import { hash } from '@remix-project/remix-lib'
import { addressToString, extractRecorderTimestamp } from '@remix-ui/helper'
import { FuncABI } from '@remix-project/core-plugin'

const format = remixLib.execution.txFormat
const txHelper = remixLib.execution.txHelper

function resolveAddress (record: Transaction['record'], accounts: Record<string, string>) {
  if (record.to) {
    const stamp = extractRecorderTimestamp(record.to)
    if (stamp) {
      record.to = record.targetAddress
    }
  }
  record.from = accounts[record.from]
  return record
}

async function runTransactions (
  records: any[],
  accounts: any,
  options: any,
  abis: any,
  linkReferences: any,
  recorderData: RecorderData,
  dispatch: React.Dispatch<Actions>,
  plugin: TransactionsPlugin
) {
  try {
    for (let index = 0; index < records.length; index++) {

    }
  } finally {
    // Execution complete
  }
}

async function runScenario (
  liveMode: any,
  json: any,
  recorderData: RecorderData,
  dispatch: React.Dispatch<Actions>,
  plugin: TransactionsPlugin
) {
  trackMatomoEvent(plugin, { category: 'run', action: 'recorder', name: 'start', isClick: true })

  if (!json) {
    trackMatomoEvent(plugin, { category: 'run', action: 'recorder', name: 'wrong-json', isClick: false })
    throw new Error('a json content must be provided')
  }
  if (typeof json === 'string') {
    try {
      json = JSON.parse(json)
    } catch (e) {
      throw new Error('A scenario file is required. It must be json formatted')
    }
  }

  let txArray
  let accounts
  let options
  let abis
  let linkReferences
  try {
    txArray = json.transactions || []
    accounts = json.accounts || []
    options = json.options || {}
    abis = json.abis || {}
    linkReferences = json.linkReferences || {}
  } catch (e) {
    throw new Error('Invalid scenario file. Please try again')
  }

  if (!txArray.length) {
    throw new Error('No transactions found in scenario file')
  }

  // return runTransactions(txArray, accounts, options, abis, linkReferences, liveMode, recorderData, dispatch, plugin)
}

// Transaction action handlers
export async function debugTransaction (plugin: TransactionsPlugin, transaction: Transaction) {
  try {
    const isDebuggerActive = await plugin.call('manager', 'isActive', 'debugger')

    if (!isDebuggerActive) await plugin.call('manager', 'activatePlugin', 'debugger')
    plugin.call('menuicons', 'select', 'debugger')
    plugin.call('debugger', 'debug', transaction.record?.txHash)
  } catch (error) {
    console.error('Error debugging transaction:', error)
    await plugin.call('notification', 'toast', `Error: ${error.message}`)
  }
}

export async function replayTransaction (transaction: Transaction, recorderData: RecorderData, plugin: TransactionsPlugin, dispatch: React.Dispatch<Actions>) {
  try {
    const tx = transaction
    const accounts = recorderData._usedAccounts
    const abis = recorderData._abis
    const linkReferences = recorderData._linkReferences
    const record = resolveAddress(tx.record, accounts)
    const abi = abis[tx.record.abi]

    if (!abi) {
      throw new Error('cannot find ABI for ' + tx.record.abi + '.  Execution stopped at ' + record.targetAddress)
    }
    /* Resolve Library */
    if (record.linkReferences && Object.keys(record.linkReferences).length) {
      for (const k in linkReferences) {
        let link = linkReferences[k]
        const timestamp = extractRecorderTimestamp(link)
        if (timestamp && recorderData._createdContractsReverse[timestamp]) {
          link = recorderData._createdContractsReverse[timestamp]
        }
        tx.record.bytecode = format.linkLibraryStandardFromlinkReferences(k, link.replace('0x', ''), tx.record.bytecode, tx.record.linkReferences)
      }
    }
    /* Encode params */
    let fnABI
    if (tx.record.type === 'constructor') {
      fnABI = txHelper.getConstructorInterface(abi)
    } else if (tx.record.type === 'fallback') {
      fnABI = txHelper.getFallbackInterface(abi)
    } else if (tx.record.type === 'receive') {
      fnABI = txHelper.getReceiveInterface(abi)
    } else {
      fnABI = txHelper.getFunction(abi, record.name + record.inputs)
    }
    if (!fnABI) {
      throw new Error('cannot resolve abi of ' + JSON.stringify(record, null, '\t') + '. Execution stopped at ' + record.targetAddress)
    }
    if (tx.record.parameters) {
      /* check if we have some params to resolve */
      try {
        tx.record.parameters.forEach((value: any, paramIndex: any) => {
          let isString = true
          if (typeof value !== 'string') {
            isString = false
            value = JSON.stringify(value)
          }
          for (const timestamp in recorderData._createdContractsReverse) {
            value = value.replace(new RegExp('created\\{' + timestamp + '\\}', 'g'), recorderData._createdContractsReverse[timestamp])
          }
          if (!isString) value = JSON.parse(value)
          tx.record.parameters[paramIndex] = value
        })
      } catch (e) {
        throw new Error('cannot resolve input parameters ' + JSON.stringify(tx.record.parameters) + '. Execution stopped at ' + record.targetAddress)
      }
    }
    const data = format.encodeData(fnABI, tx.record.parameters, tx.record.bytecode)
    if (data.error) {
      throw new Error(data.error + '. Record:' + JSON.stringify(record, null, '\t') + '. Execution stopped at ' + record.targetAddress)
    }

    try {
      const txData = { ...record, data: { dataHex: data.data, funArgs: tx.record.parameters, funAbi: fnABI, contractBytecode: tx.record.bytecode, contractName: tx.record.contractName, timestamp: tx.timestamp, contractABI: recorderData._abis[transaction.record.abi], value: record.value } }

      await plugin.call('blockchain', 'runTx', txData)
    } catch (err) {
      console.error(err)
      throw new Error(err + '. Execution failed at ' + record.targetAddress)
    }
  } catch (error) {
    console.error('Error replaying transaction:', error)
    await plugin.call('notification', 'toast', `Error: ${error.message}`)
  }
}

export async function openTransactionInTerminal (plugin: TransactionsPlugin, transaction: Transaction) {
  try {
    await plugin.call('terminal', 'log', {
      type: 'info',
      value: `Transaction: ${transaction.record?.txHash}\nFunction: ${transaction.record?.name}\nStatus: ${transaction.record?.status}`
    })

    // Scroll to the transaction element in the terminal and click it
    const txHash = transaction.record?.txHash
    if (txHash) {
      const dataId = `block_tx${txHash}`
      const element = document.querySelector(`[data-id="${dataId}"]`) as HTMLElement
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  } catch (error) {
    console.error('Error opening in terminal:', error)
    await plugin.call('notification', 'toast', `Error: ${error.message}`)
  }
}

export async function openTransactionInExplorer (plugin: TransactionsPlugin, transaction: Transaction) {
  try {
    const network = await plugin.call('network', 'detectNetwork')
    let explorerUrl = ''

    // Determine explorer URL based on network
    if (network?.name) {
      switch (network.name.toLowerCase()) {
      case 'mainnet':
      case 'ethereum':
        explorerUrl = `https://etherscan.io/tx/${transaction.record?.txHash}`
        break
      case 'sepolia':
        explorerUrl = `https://sepolia.etherscan.io/tx/${transaction.record?.txHash}`
        break
      case 'goerli':
        explorerUrl = `https://goerli.etherscan.io/tx/${transaction.record?.txHash}`
        break
      default:
        await plugin.call('notification', 'toast', 'Block explorer not available for this network')
        return
      }
      window.open(explorerUrl, '_blank')
    }
  } catch (error) {
    console.error('Error opening in explorer:', error)
    await plugin.call('notification', 'toast', `Error: ${error.message}`)
  }
}

export async function clearTransaction (plugin: TransactionsPlugin, transaction: Transaction) {
  // For now, just show a toast - you can implement actual clearing logic later
  await plugin.call('notification', 'toast', 'Clear functionality coming soon')
}
