import React from 'react' // eslint-disable-line
import { FormattedMessage, useIntl } from 'react-intl'
import CheckTxStatus from './ChechTxStatus' // eslint-disable-line
import Context from './Context' // eslint-disable-line
import showTable from './Table'
import { execution } from '@remix-project/remix-lib'
const typeConversion = execution.typeConversion

const RenderKnownTransactions = ({ tx, receipt, resolvedData, logs, index, plugin, showTableHash, txDetails, modal, provider }) => {
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
  let to = resolvedData.contractName + '.' + resolvedData.fn
  if (tx.isUserOp) {
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
  const txType = 'knownTx'
  const options = { from, to, tx, logs }
  return (
    <span id={`tx${tx.hash}`} key={index}>
      <div className="remix_ui_terminal_log" onClick={(event) => txDetails(event, tx)}>
        <CheckTxStatus tx={receipt} type={txType} />
        <Context opts={options} provider={provider} />
        <div className="remix_ui_terminal_buttons">
          <div
            className="remix_ui_terminal_debug inline-flex items-center px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors btn-sm"
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
            'status': receipt !== null ? receipt.status : null,
            'isCall': tx.isCall,
            'contractAddress': receipt.contractAddress,
            'blockHash': tx.blockHash,
            'blockNumber': tx.blockNumber,
            'data': tx,
            from,
            to,
            'gas': tx.gas,
            'input': tx.input,
            'decoded input': resolvedData && resolvedData.params ? JSON.stringify(typeConversion.stringify(resolvedData.params), null, '\t') : ' - ',
            'output': tx.returnValue,
            'decoded output': resolvedData && resolvedData.decodedReturnValue ? JSON.stringify(typeConversion.stringify(resolvedData.decodedReturnValue), null, '\t') : ' - ',
            'logs': logs,
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

export default RenderKnownTransactions
