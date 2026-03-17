import React from 'react' // eslint-disable-line
import { FormattedMessage, useIntl } from 'react-intl'
import {CopyToClipboard} from '@remix-ui/clipboard' // eslint-disable-line
import { shortenHexData } from '@remix-ui/helper'
import { execution } from '@remix-project/remix-lib'
const typeConversion = execution.typeConversion
import { toChecksumAddress } from '@ethereumjs/util'

const showTable = (opts, showTableHash) => {
  const intl = useIntl()
  let msg = ''
  let toHash
  const data = opts.data // opts.data = data.tx
  if (!opts.isUserOp && data.to && opts.to !== data.to) {
    toHash = opts.to + ' ' + data.to
  } else {
    toHash = opts.to
  }
  let callWarning = ''
  if (opts.isCall) {
    callWarning = intl.formatMessage({ id: 'terminal.callWarning' })
  }
  if (!opts.isCall) {
    if (opts.status !== undefined && opts.status !== null) {
      if (opts.status === 0 || opts.status === '0x0' || opts.status === false) {
        msg = intl.formatMessage({ id: 'terminal.msg1' })
      } else if (opts.status === 1 || opts.status === '0x1' || opts.status === true) {
        msg = intl.formatMessage({ id: 'terminal.msg2' })
      }
    } else {
      msg = intl.formatMessage({ id: 'terminal.msg3' })
    }
  }

  let stringified = ' - '
  if (opts.logs && opts.logs.decoded) {
    stringified = typeConversion.stringify(opts.logs.decoded)
  }
  const val = opts.val != null ? typeConversion.toInt(opts.val) : 0
  const gasInt = opts.gas != null ? typeConversion.toInt(opts.gas) : 0
  return (
    <table className={`mt-1 mb-2 me-4  align-self-center ${showTableHash.includes(opts.hash) ? 'active' : ''}`} id="txTable" data-id={`txLoggerTable${opts.hash}`}>
      <tbody>
        {opts.status !== undefined ? (
          <tr className="remix_ui_terminal_tr">
            <td className="remix_ui_terminal_td" data-shared={`key_${opts.hash}`}>
              <FormattedMessage id="terminal.status" />
            </td>
            <td className="remix_ui_terminal_td" data-id={`txLoggerTableStatus${opts.hash}`} data-shared={`pair_${opts.hash}`}>{`${opts.status} ${msg}`}</td>
          </tr>
        ) : null}
        {opts.hash && !opts.isCall ? (
          <tr className="remix_ui_terminal_tr">
            <td className="remix_ui_terminal_td" data-shared={`key_${opts.hash}`}>
              <FormattedMessage id="terminal.transactionHash" />
            </td>
            <td className="remix_ui_terminal_td" data-id={`txLoggerTableHash${opts.hash}`} data-shared={`pair_${opts.hash}`}>
              {opts.hash}
              <CopyToClipboard content={opts.hash} />
            </td>
          </tr>
        ) : null}
        {opts.blockHash ? (
          <tr className="remix_ui_terminal_tr">
            <td className="remix_ui_terminal_td" data-shared={`key_${opts.hash}`}>
              <FormattedMessage id="terminal.blockHash" />
            </td>
            <td className="remix_ui_terminal_td" data-id={`txLoggerTableContractAddress${opts.hash}`} data-shared={`pair_${opts.hash}`}>
              {opts.blockHash}
              <CopyToClipboard content={opts.blockHash} />
            </td>
          </tr>
        ) : null}
        {opts.blockNumber ? (
          <tr className="remix_ui_terminal_tr">
            <td className="remix_ui_terminal_td" data-shared={`key_${opts.hash}`}>
              <FormattedMessage id="terminal.blockNumber" />
            </td>
            <td className="remix_ui_terminal_td" data-id={`txLoggerTableContractAddress${opts.hash}`} data-shared={`pair_${opts.hash}`}>
              {opts.blockNumber.toString()}
              <CopyToClipboard content={opts.blockNumber.toString()} />
            </td>
          </tr>
        ) : null}
        {opts.contractAddress ? (
          <tr className="remix_ui_terminal_tr">
            <td className="remix_ui_terminal_td" data-shared={`key_${opts.hash}`}>
              <FormattedMessage id="terminal.contractAddress" />
            </td>
            <td className="remix_ui_terminal_td" data-id={`txLoggerTableContractAddress${opts.hash}`} data-shared={`pair_${opts.hash}`}>
              {opts.contractAddress}
              <CopyToClipboard content={opts.contractAddress} />
            </td>
          </tr>
        ) : null}
        {opts.from ? (
          <tr className="remix_ui_terminal_tr">
            <td className="remix_ui_terminal_td" data-shared={`key_${opts.hash}`}>
              <FormattedMessage id="terminal.from" />
            </td>
            <td className="remix_ui_terminal_td" data-id={`txLoggerTableFrom${opts.hash}`} data-shared={`pair_${opts.hash}`}>
              {toChecksumAddress(opts.from)}
              <CopyToClipboard content={opts.from} />
              { opts.isUserOp && opts.bundler ? (<>
                  (BUNDLER: {toChecksumAddress(opts.bundler)}) <CopyToClipboard content={opts.bundler} />
              </>
              ) : null }
            </td>
          </tr>
        ) : null}
        {opts.to || (opts.isUserOp && opts.entrypoint)? (
          <tr className="remix_ui_terminal_tr">
            <td className="remix_ui_terminal_td" data-shared={`key_${opts.hash}`}>
              <FormattedMessage id="terminal.to" />
            </td>
            <td className="remix_ui_terminal_td" data-id={`txLoggerTableTo${opts.hash}`} data-shared={`pair_${opts.hash}`}>
              {toHash}
              { opts.to ? <CopyToClipboard content={data.to ? data.to : toHash} /> : null }
              { opts.isUserOp && opts.entrypoint ? (<>
                  (ENTRYPOINT: {toChecksumAddress(opts.entrypoint)}) <CopyToClipboard content={opts.entrypoint} />
              </>
              ) : null }
            </td>
          </tr>
        ) : null}
        {opts.gas ? (
          <tr className="remix_ui_terminal_tr">
            <td className="remix_ui_terminal_td" data-shared={`key_${opts.hash}`}>
              <FormattedMessage id="terminal.gas" />
            </td>
            <td className="remix_ui_terminal_td" data-id={`txLoggerTableGas${opts.hash}`} data-shared={`pair_${opts.hash}`}>
              {gasInt} <FormattedMessage id="terminal.gas" />
              <CopyToClipboard content={opts.gas} />
            </td>
          </tr>
        ) : null}
        {opts.transactionCost ? (
          <tr className="remix_ui_terminal_tr">
            <td className="remix_ui_terminal_td" data-shared={`key_${opts.hash}`}>
              <FormattedMessage id="terminal.transactionCost" />
            </td>
            <td className="remix_ui_terminal_td" data-id={`txLoggerTableTransactionCost${opts.hash}`} data-shared={`pair_${opts.hash}`}>
              {opts.transactionCost} gas {callWarning}
              <CopyToClipboard content={opts.transactionCost} />
              { opts.isUserOp && opts.paymaster ? (<>
                  (PAYMASTER: {toChecksumAddress(opts.paymaster)}) <CopyToClipboard content={opts.paymaster} />
              </>
              ) : null }
            </td>
          </tr>
        ) : null}
        {opts.executionCost ? (
          <tr className="remix_ui_terminal_tr">
            <td className="remix_ui_terminal_td" data-shared={`key_${opts.hash}`}>
              <FormattedMessage id="terminal.executionCost" />
            </td>
            <td className="remix_ui_terminal_td" data-id={`txLoggerTableExecutionHash${opts.hash}`} data-shared={`pair_${opts.hash}`}>
              {opts.executionCost} gas {callWarning}
              <CopyToClipboard content={opts.executionCost} />
            </td>
          </tr>
        ) : null}
        {opts.input ? (
          <tr className="remix_ui_terminal_tr">
            <td className="remix_ui_terminal_td" data-shared={`key_${opts.hash}`}>
              <FormattedMessage id="terminal.input" />
            </td>
            <td className="remix_ui_terminal_td" data-id={`txLoggerTableHash${opts.hash}`} data-shared={`pair_${opts.hash}`}>
              {shortenHexData(opts.input)}
              <CopyToClipboard content={opts.input} />
            </td>
          </tr>
        ) : null}
        {opts.output ? (
          <tr className="remix_ui_terminal_tr">
            <td className="remix_ui_terminal_td" data-shared={`key_${opts.hash}`}>
              <FormattedMessage id="terminal.output" />
            </td>
            <td className="remix_ui_terminal_td" data-id={`txLoggerTableHash${opts.hash}`} data-shared={`pair_${opts.hash}`}>
              {opts.output}
              <CopyToClipboard content={opts.output} />
            </td>
          </tr>
        ) : null}
        {opts['decoded input'] ? (
          <tr className="remix_ui_terminal_tr">
            <td className="remix_ui_terminal_td" data-shared={`key_${opts.hash}`}>
              <FormattedMessage id="terminal.decodedInput" />
            </td>
            <td className="remix_ui_terminal_td" data-id={`txLoggerTableHash${opts.hash}`} data-shared={`pair_${opts.hash}`}>
              {opts['decoded input'].trim()}
              <CopyToClipboard content={opts['decoded input']} />
            </td>
          </tr>
        ) : null}
        {opts['decoded output'] ? (
          <tr className="remix_ui_terminal_tr">
            <td className="remix_ui_terminal_td" data-shared={`key_${opts.hash}`}>
              <FormattedMessage id="terminal.decodedOutput" />
            </td>
            <td className="remix_ui_terminal_td" data-id={`txLoggerTableHash${opts.hash}`} data-shared={`pair_${opts.hash}`}>
              {opts['decoded output']}
              <CopyToClipboard content={opts['decoded output']} />
            </td>
          </tr>
        ) : null}
        {opts.logs ? (
          <tr className="remix_ui_terminal_tr">
            <td className="remix_ui_terminal_td" data-shared={`key_${opts.hash}`}>
              <FormattedMessage id="terminal.logs" />
            </td>
            <td className="remix_ui_terminal_td" data-id={`txLoggerTableHash${opts.hash}`} data-shared={`pair_${opts.hash}`}>
              {JSON.stringify(stringified, null, '\t')}
              <CopyToClipboard content={JSON.stringify(stringified, null, '\t')} />
            </td>
          </tr>
        ) : null}
        {opts.logs ? (
          <tr className="remix_ui_terminal_tr">
            <td className="remix_ui_terminal_td" data-shared={`key_${opts.hash}`}>
              <FormattedMessage id="terminal.rawlogs" />
            </td>
            <td className="remix_ui_terminal_td" data-id={`txLoggerTableHash${opts.hash}`} data-shared={`pair_${opts.hash}`}>
              {JSON.stringify(opts.logs.raw || '0', null, 2)}
              <CopyToClipboard content={JSON.stringify(opts.logs.raw || '0', null, 2)} />
            </td>
          </tr>
        ) : null}
        {opts.val ? (
          <tr className="remix_ui_terminal_tr">
            <td className="remix_ui_terminal_td" data-shared={`key_${opts.hash}`}>
              <FormattedMessage id="terminal.value" />
            </td>
            <td className="remix_ui_terminal_td" data-id={`txLoggerTableHash${opts.hash}`} data-shared={`pair_${opts.hash}`}>
              {val} <FormattedMessage id="terminal.wei" />
              <CopyToClipboard content={`${val} wei`} />
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  )
}
export default showTable
