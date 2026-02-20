import React, { useEffect, useReducer, useState } from 'react'
import { TransactionsAppContext } from './contexts'
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { TransactionsPlugin } from 'apps/remix-ide/src/app/udapp/udappTransactions'
import { transactionsReducer, transactionsInitialState } from './reducers'
import TransactionsPortraitView from './widgets/TransactionsPortraitView'
import "./css/transaction-recorder.css"

function TransactionsWidget({ plugin }: { plugin: TransactionsPlugin }) {
  const widgetInitializer = plugin.getWidgetState ? plugin.getWidgetState() : null
  const [widgetState, dispatch] = useReducer(transactionsReducer, widgetInitializer || transactionsInitialState)
  const [themeQuality, setThemeQuality] = useState<string>('dark')

  useEffect(() => {
    if (plugin.setStateGetter) {
      plugin.setStateGetter(() => widgetState)
    }
    if (plugin.setDispatchGetter) {
      plugin.setDispatchGetter(() => dispatch)
    }
  }, [widgetState])

  useEffect(() => {
    plugin.on('blockchain', 'transactionExecuted', async (error, from, to, _data, _call, txResult, timestamp, payLoad) => {
      if (error) return
      if (_call) return
      const accounts = await plugin.call('blockchain', 'getAccounts')

      dispatch({
        type: 'RECORD_TRANSACTION_EXECUTED',
        payload: { error, from, to, txResult, timestamp, payLoad, accounts }
      })
    })

    plugin.on('blockchain', 'contextChanged', () => {
      dispatch({ type: 'CLEAR_RECORDER_DATA' })
    })

    return () => {
      plugin.off('blockchain', 'transactionExecuted')
      plugin.off('blockchain', 'contextChanged')
    }
  }, [])

  useEffect(() => {
    plugin.emit('transactionRecorderUpdated', widgetState.recorderData.journal)
  }, [widgetState.recorderData.journal])

  return (
    <TransactionsAppContext.Provider value={{ widgetState, dispatch, plugin, themeQuality }}>
      <TransactionsPortraitView />
    </TransactionsAppContext.Provider>
  )
}

export default TransactionsWidget
