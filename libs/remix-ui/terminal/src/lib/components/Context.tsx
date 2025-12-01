import React from 'react' // eslint-disable-line
import { shortenHexData } from '@remix-ui/helper'
import { execution } from '@remix-project/remix-lib'
const typeConversion = execution.typeConversion

const Context = ({ opts, provider }: {opts; provider: string}) => {
  const data = opts.tx || ''
  const from = opts.from ? shortenHexData(opts.from) : ''
  let to = opts.to
  if (data.to) to = to + ' ' + shortenHexData(data.to)
  const val = data.value
  let hash = data.hash ? shortenHexData(data.hash) : ''
  const input = data.input ? shortenHexData(data.input) : (data.data ? shortenHexData(data.data) : '')
  const logs = opts.logs && opts.logs.raw && opts.logs.raw.length ? opts.logs.raw.length : 0
  const block = data.receipt ? data.receipt.blockNumber : data.blockNumber || ''
  let txIndex
  if (data.index == 0) txIndex = 0
  else txIndex = data.index ? data.index.toString() : '-'
  const value = val ? typeConversion.toInt(val) : 0
  if (provider && provider.startsWith('vm')) {
    return (
      <div>
        <span>
          <span className="remix_ui_terminal_tx">[vm]</span>
          <div className="remix_ui_terminal_txItem">
            <span className="remix_ui_terminal_txItemTitle">from:</span> {from}
          </div>
          <div className="remix_ui_terminal_txItem">
            <span className="remix_ui_terminal_txItemTitle">to:</span> {to}
          </div>
          <div className="remix_ui_terminal_txItem">
            <span className="remix_ui_terminal_txItemTitle">value:</span> {value} wei
          </div>
          <div className="remix_ui_terminal_txItem">
            <span className="remix_ui_terminal_txItemTitle">data:</span> {input}
          </div>
          <div className="remix_ui_terminal_txItem">
            <span className="remix_ui_terminal_txItemTitle">logs:</span> {logs}
          </div>
          <div className="remix_ui_terminal_txItem">
            <span className="remix_ui_terminal_txItemTitle">hash:</span> {hash}
          </div>
        </span>
      </div>
    )
  } else if (data.resolvedData) {
    return (
      <div>
        <span>
          <span className="remix_ui_terminal_tx">
            [block:{block.toString()} txIndex:{txIndex}]
          </span>
          <div className="remix_ui_terminal_txItem">
            <span className="remix_ui_terminal_txItemTitle">from:</span> {from}
          </div>
          <div className="remix_ui_terminal_txItem">
            <span className="remix_ui_terminal_txItemTitle">to:</span> {to}
          </div>
          <div className="remix_ui_terminal_txItem">
            <span className="remix_ui_terminal_txItemTitle">value:</span> {value} wei
          </div>
          <div className="remix_ui_terminal_txItem">
            <span className="remix_ui_terminal_txItemTitle">data:</span> {input}
          </div>
          <div className="remix_ui_terminal_txItem">
            <span className="remix_ui_terminal_txItemTitle">logs:</span> {logs}
          </div>
          <div className="remix_ui_terminal_txItem">
            <span className="remix_ui_terminal_txItemTitle">hash:</span> {hash}
          </div>
        </span>
      </div>
    )
  } else {
    hash = shortenHexData(data.blockHash)
    return (
      <div>
        <span>
          <span className="remix_ui_terminal_tx">
            [block:{block.toString()} txIndex:{txIndex}]
          </span>
          <div className="remix_ui_terminal_txItem">
            <span className="remix_ui_terminal_txItemTitle">from:</span> {from}
          </div>
          <div className="remix_ui_terminal_txItem">
            <span className="remix_ui_terminal_txItemTitle">to:</span> {to}
          </div>
          <div className="remix_ui_terminal_txItem">
            <span className="remix_ui_terminal_txItemTitle">value:</span> {value} wei
          </div>
          <div className="remix_ui_terminal_txItem">
            <span className="remix_ui_terminal_txItemTitle">data:</span> {input}
          </div>
          <div className="remix_ui_terminal_txItem">
            <span className="remix_ui_terminal_txItemTitle">logs:</span> {logs}
          </div>
          <div className="remix_ui_terminal_txItem">
            <span className="remix_ui_terminal_txItemTitle">hash:</span> {hash}
          </div>
        </span>
      </div>
    )
  }
}

export default Context
