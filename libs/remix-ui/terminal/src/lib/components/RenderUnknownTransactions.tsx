import React, {useState, useContext} from 'react' // eslint-disable-line
import { FormattedMessage, useIntl } from 'react-intl'
import CheckTxStatus from './ChechTxStatus' // eslint-disable-line
import Context from './Context' // eslint-disable-line
import showTable from './Table'
import { TrackingContext } from '@remix-ide/tracking'
import { MatomoEvent, UdappEvent } from '@remix-api'

const RenderUnKnownTransactions = ({ tx, receipt, index, plugin, showTableHash, txDetails, modal, provider }) => {
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = UdappEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }
  const intl = useIntl()
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
  let from = tx.from
  let to = tx.to

  if (tx.isUserOp) {
    trackMatomoEvent({ category: 'udapp', action: 'safeSmartAccount', name: 'txExecuted', value: 'successfully', isClick: false })
    // Track event with signature: ExecutionFromModuleSuccess (index_topic_1 address module)
    // to get sender smart account address
    const fromAddrLog = receipt.logs.find(e => e.topics[0] === "0x6895c13664aa4f67288b25d7a21d7aaa34916e355fb9b6fae0a139a9085becb8")
    // Track event with signature: UserOperationSponsored (index_topic_1 bytes32 userOpHash, index_topic_2 address user, uint8 paymasterMode, address token, uint256 tokenAmountPaid, uint256 exchangeRate)
    // to get paymaster address
    const paymasterAddrLog = receipt.logs.find(e => e.topics[0] === "0x7a270f29ae17e8e2304ff1245deb50c3b6206bca82928d904f3e284d35c5ffd2")
    if (fromAddrLog) {
      from = fromAddrLog.address
      tx.bundler = tx.from
    }
    if (paymasterAddrLog) tx.paymaster = paymasterAddrLog.address
    if (tx.to) {
      tx.entrypoint = tx.to
      to = null // for deployment transaction
    }
    if (tx.originTo) {
      to = tx.originTo
    }

  }
  const txType = 'unknown' + (tx.isCall ? 'Call' : 'Tx')
  const options = {
    from,
    to,
    tx,
    logs: { decoded: [],
      raw: (receipt && receipt.logs) || []
    }
  }
  return (
    <span id={`tx${tx.hash}`} key={index}>
      <div className="remix_ui_terminal_log" onClick={(event) => txDetails(event, tx)}>
        <CheckTxStatus tx={receipt || tx} type={txType} />
        <Context opts={options} provider={provider} />
        <div className="remix_ui_terminal_buttons">
          <div
            className="remix_ui_terminal_debug btn btn-primary btn-sm"
            data-shared="txLoggerDebugButton"
            data-id={`txLoggerDebugButton${tx.hash}`}
            onClick={(event) => debug(event, tx)}
          >
            <FormattedMessage id="terminal.debug" />
          </div>
        </div>
        <i className={`remix_ui_terminal_arrow fas ${showTableHash.includes(tx.hash) ? 'fa-angle-up' : 'fa-angle-down'}`}></i>
      </div>
      {showTableHash.includes(tx.hash)
        ? showTable(
          {
            'isUserOp': tx.isUserOp,
            'bundler': tx.bundler,
            'paymaster': tx.paymaster,
            'entrypoint': tx.entrypoint,
            'hash': tx.hash,
            'status': receipt ? receipt.status : null,
            'isCall': tx.isCall,
            'contractAddress': tx.contractAddress,
            'data': tx,
            from,
            to,
            'gas': tx.gas,
            'input': tx.input,
            'output': tx.returnValue,
            'decoded output': ' - ',
            'logs': options.logs,
            'val': tx.value,
            'transactionCost': tx.transactionCost,
            'executionCost': tx.executionCost
          },
          showTableHash
        )
        : null}
    </span>
  )
}

export default RenderUnKnownTransactions
