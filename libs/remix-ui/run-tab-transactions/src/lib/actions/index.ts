import React from 'react'
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { TransactionsPlugin } from 'apps/remix-ide/src/app/udapp/udappTransactions'
import { Actions, Transaction, RecorderData } from '../types'
import * as remixLib from '@remix-project/remix-lib'
import { extractRecorderTimestamp, shortenAddress } from '@remix-ui/helper'
import { trackMatomoEvent } from '@remix-api'

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

// Transaction action handlers
export async function debugTransaction (plugin: TransactionsPlugin, transaction: Transaction) {
  try {
    const isDebuggerActive = await plugin.call('manager', 'isActive', 'debugger')

    if (!isDebuggerActive) await plugin.call('manager', 'activatePlugin', 'debugger')
    plugin.call('menuicons', 'select', 'debugger')
    plugin.call('debugger', 'debug', transaction.record?.txHash)

    trackMatomoEvent(plugin, {
      category: 'udapp',
      action: 'transactionDebug',
      name: shortenAddress(transaction.record?.txHash),
      isClick: false
    })
  } catch (error) {
    console.error('Error debugging transaction:', error)
    await plugin.call('notification', 'toast', `Error: ${error.message}`)
  }
}

export async function replayTransaction (transaction: Transaction, recorderData: RecorderData, plugin: TransactionsPlugin) {
  try {
    const tx = transaction
    const accounts = recorderData._usedAccounts
    const abis = recorderData._abis
    const linkReferences = recorderData._linkReferences
    const targetTimestamp = extractRecorderTimestamp(tx?.record?.to)
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
        if (timestamp && plugin.getWidgetState()?.recorderData?._createdContractsReverse[timestamp]) {
          link = plugin.getWidgetState()?.recorderData?._createdContractsReverse[timestamp]
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
          for (const timestamp in plugin.getWidgetState()?.recorderData?._createdContractsReverse) {
            value = value.replace(new RegExp('created\\{' + timestamp + '\\}', 'g'), plugin.getWidgetState()?.recorderData?._createdContractsReverse[timestamp])
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
      const to = plugin.getWidgetState().recorderData._createdContractsReverse[targetTimestamp]
      const txData = {
        to,
        data: {
          dataHex: data.data,
          funArgs: tx.record.parameters,
          funAbi: fnABI,
          contractBytecode: tx.record.bytecode,
          contractName: tx.record.contractName,
          timestamp: tx.timestamp,
          contractABI: recorderData._abis[transaction.record.abi],
          value: record.value,
          linkReferences: tx.record.linkReferences
        }
      }
      const result = await plugin.call('blockchain', 'runTx', txData)

      if (tx.record.type === 'constructor') await plugin.call('udappDeployedContracts', 'addInstance', result.address, txData.data.contractABI, tx.record.contractName, txData.data)

      trackMatomoEvent(plugin, {
        category: 'udapp',
        action: 'transactionReplay',
        name: tx.record.type === 'constructor' ? 'deployment' : tx.record.name || 'transaction',
        isClick: false
      })
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
    // Scroll to the transaction element in the terminal and click it
    const txHash = transaction.record?.txHash
    if (txHash) {
      const dataId = `block_tx${txHash}`
      const element = document.querySelector(`[data-id="${dataId}"]`) as HTMLElement
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })

        trackMatomoEvent(plugin, {
          category: 'udapp',
          action: 'transactionOpenTerminal',
          name: shortenAddress(txHash),
          isClick: false
        })
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
    if (network?.chainId) {
      switch (network.chainId) {
      case '1':
        explorerUrl = `https://etherscan.io/address/${transaction.record?.txHash}`
        break
      case '11155111':
        explorerUrl = `https://sepolia.etherscan.io/address/${transaction.record?.txHash}`
        break
      case '5':
        explorerUrl = `https://goerli.etherscan.io/address/${transaction.record?.txHash}`
        break
      case '10':
        explorerUrl = `https://optimistic.etherscan.io/address/${transaction.record?.txHash}`
        break
      default:
        await plugin.call('notification', 'toast', 'Block explorer not available for this network')
        return
      }
      window.open(explorerUrl, '_blank')

      trackMatomoEvent(plugin, {
        category: 'udapp',
        action: 'transactionOpenExplorer',
        name: network.name.toLowerCase(),
        isClick: false
      })
    }
  } catch (error) {
    console.error('Error opening in explorer:', error)
    await plugin.call('notification', 'toast', `Error: ${error.message}`)
  }
}

export async function clearTransaction (plugin: TransactionsPlugin, transaction: Transaction, dispatch: React.Dispatch<Actions>) {
  try {
    dispatch({ type: 'REMOVE_TRANSACTION', payload: transaction.timestamp.toString() })
    await plugin.call('notification', 'toast', 'Transaction removed')

    trackMatomoEvent(plugin, {
      category: 'udapp',
      action: 'transactionClear',
      name: shortenAddress(transaction.record?.txHash),
      isClick: false
    })
  } catch (error) {
    console.error('Error clearing transaction:', error)
    await plugin.call('notification', 'toast', `Error: ${error.message}`)
  }
}
