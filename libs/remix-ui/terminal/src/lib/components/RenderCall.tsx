import React from 'react' // eslint-disable-line
import { FormattedMessage, useIntl } from 'react-intl'
import { shortenHexData } from '@remix-ui/helper'
import CheckTxStatus from './ChechTxStatus' // eslint-disable-line
import showTable from './Table'
import { execution } from '@remix-project/remix-lib'

const typeConversion = execution.typeConversion

const RenderCall = ({ tx, resolvedData, logs, index, plugin, showTableHash, txDetails, modal }) => {
  const intl = useIntl()
  const to = resolvedData.contractName + '.' + resolvedData.fn
  const from = tx.from ? tx.from : ' - '
  const input = tx.input ? shortenHexData(tx.input) : ''
  const txType = 'call'

  const debug = (event, tx) => {
    event.stopPropagation()
    if (tx.isCall && !tx.envMode.startsWith('vm')) {
      modal(
        intl.formatMessage({ id: 'terminal.vmMode' }),
        intl.formatMessage({ id: 'terminal.vmModeMsg' }),
        intl.formatMessage({ id: 'terminal.ok' }),
        false,
        () => {},
        intl.formatMessage({ id: 'terminal.cancel' }),
        () => {}
      )
    } else {
      plugin.event.trigger('debuggingRequested', [tx.hash])
    }
  }

  return (
    <span id={`tx${tx.hash}`} key={index}>
      <div className="remix_ui_terminal_log" onClick={(event) => txDetails(event, tx)}>
        <CheckTxStatus tx={tx} type={txType} />
        <span>
          <span className="remix_ui_terminal_tx">[call]</span>
          <div className="remix_ui_terminal_txItem">
            <span className="remix_ui_terminal_txItemTitle"><FormattedMessage id="terminal.callFrom" /></span> {from}
          </div>
          <div className="remix_ui_terminal_txItem">
            <span className="remix_ui_terminal_txItemTitle"><FormattedMessage id="terminal.callTo" /></span> {to}
          </div>
          <div className="remix_ui_terminal_txItem">
            <span className="remix_ui_terminal_txItemTitle"><FormattedMessage id="terminal.callData" /></span> {input}
          </div>
        </span>
        <div className="remix_ui_terminal_buttons">
          <div className="remix_ui_terminal_debug btn btn-primary btn-sm" onClick={(event) => debug(event, tx)}>
            <FormattedMessage id="terminal.debug" />
          </div>
        </div>
        <i className={`remix_ui_terminal_arrow fas ${showTableHash.includes(tx.hash) ? 'fa-angle-up' : 'fa-angle-down'}`}></i>
      </div>
      {showTableHash.includes(tx.hash)
        ? showTable(
          {
            'hash': tx.hash,
            'isCall': tx.isCall,
            'contractAddress': tx.contractAddress,
            'data': tx,
            from,
            to,
            'gas': tx.gas,
            'input': tx.input,
            'decoded input': resolvedData && resolvedData.params ? JSON.stringify(typeConversion.stringify(resolvedData.params), null, '\t') : ' - ',
            'output': tx.returnValue,
            'decoded output': resolvedData && resolvedData.decodedReturnValue ? JSON.stringify(typeConversion.stringify(resolvedData.decodedReturnValue), null, '\t') : ' - ',
            'val': tx.value,
            'logs': logs,
            'transactionCost': tx.transactionCost,
            'executionCost': tx.executionCost
          },
          showTableHash
        )
        : null}
    </span>
  )
}

export default RenderCall
