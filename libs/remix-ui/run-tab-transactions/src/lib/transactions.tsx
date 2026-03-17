import React, { useEffect, useReducer, useState, useRef } from 'react'
import { TransactionsAppContext } from './contexts'
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { TransactionsPlugin } from 'apps/remix-ide/src/app/udapp/udappTransactions'
import { transactionsReducer, transactionsInitialState } from './reducers'
import TransactionsPortraitView from './widgets/TransactionsPortraitView'
import "./css/transaction-recorder.css"

function TransactionsWidget({ plugin }: { plugin: TransactionsPlugin }) {
  // Check if there's already a primary instance
  const isPrimaryInstance = useRef(!plugin.getWidgetState)

  // Initialize with shared state if available (for secondary instances)
  const initialState = plugin.getWidgetState?.() || transactionsInitialState
  const [widgetState, localDispatch] = useReducer(transactionsReducer, initialState)
  const [themeQuality] = useState<string>('dark')
  const [syncTrigger, setSyncTrigger] = useState(0)

  // Always set the state getter and dispatch getter (primary instance sets them)
  useEffect(() => {
    if (isPrimaryInstance.current) {
      // Primary instance sets the state getter and dispatch getter
      if (plugin.setStateGetter) {
        plugin.setStateGetter(() => widgetState)
      }
      if (plugin.setDispatchGetter) {
        plugin.setDispatchGetter(() => localDispatch)
      }
    }
  }, [widgetState, localDispatch, plugin])

  // Secondary instances poll for state changes
  useEffect(() => {
    if (!isPrimaryInstance.current) {
      const syncInterval = setInterval(() => {
        setSyncTrigger(prev => prev + 1)
      }, 500)

      return () => clearInterval(syncInterval)
    }
  }, [])

  // Get the current state and dispatch (use shared ones for secondary instances)
  const currentState = isPrimaryInstance.current ? widgetState : (plugin.getWidgetState?.() || widgetState)

  // Get the dispatch function - for secondary instances, use the primary's dispatch
  const dispatch = isPrimaryInstance.current ? localDispatch : (plugin.getDispatch() || localDispatch)

  useEffect(() => {
    // Only primary instance listens to blockchain events
    if (!isPrimaryInstance.current) return

    const handleTransactionExecuted = async (error: any, from: string, to: string, _data: any, _call: any, txResult: any, timestamp: number, payLoad: any) => {
      if (error) return
      if (_call) return
      const accounts = await plugin.call('blockchain', 'getAccounts')

      localDispatch({
        type: 'RECORD_TRANSACTION_EXECUTED',
        payload: { error, from, to, txResult, timestamp, payLoad, accounts }
      })
    }

    const handleContextChanged = () => {
      localDispatch({ type: 'CLEAR_RECORDER_DATA' })
    }

    plugin.on('blockchain', 'transactionExecuted', handleTransactionExecuted)
    plugin.on('blockchain', 'contextChanged', handleContextChanged)

    return () => {
      plugin.off('blockchain', 'transactionExecuted')
      plugin.off('blockchain', 'contextChanged')
    }
  }, [plugin, localDispatch])

  useEffect(() => {
    plugin.emit('transactionRecorderUpdated', currentState.recorderData.journal)
  }, [currentState.recorderData.journal, plugin, syncTrigger])

  return (
    <TransactionsAppContext.Provider value={{ widgetState: currentState, dispatch, plugin, themeQuality }}>
      <TransactionsPortraitView />
    </TransactionsAppContext.Provider>
  )
}

export default TransactionsWidget
