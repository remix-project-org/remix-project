import React from 'react';
import { shortenHexData } from '@remix-ui/helper';
import { execution } from '@remix-project/remix-lib';
const typeConversion = execution.typeConversion;

const Context = ({ opts, provider }: { opts: any; provider: string }) => {
  const data = opts.tx || '';
  const from = opts.from ? shortenHexData(opts.from) : '';
  let to = opts.to;
  if (data.to) to = to + ' ' + shortenHexData(data.to);
  const val = data.value;
  let hash = data.hash ? shortenHexData(data.hash) : '';
  const input = data.input ? shortenHexData(data.input) : '';
  const logs = opts.logs?.decoded?.length ? opts.logs.decoded.length : 0;
  const block = data.receipt
    ? data.receipt.blockNumber
    : data.blockNumber || '';
  const i = data.receipt
    ? data.receipt.transactionIndex
    : data.transactionIndex;
  const value = val ? typeConversion.toInt(val) : 0;

  if (data.resolvedData) {
    return (
      <div>
        <span>
          <span className="remix_ui_terminal_tx font-bold mr-3">
            [block:{block.toString()} txIndex:{i ? i.toString() : '-'}]
          </span>
          <div className="remix_ui_terminal_txItem">
            <span className="font-bold">from:</span> {from}
          </div>
          <div className="remix_ui_terminal_txItem">
            <span className="font-bold">to:</span> {to}
          </div>
          <div className="remix_ui_terminal_txItem">
            <span className="font-bold">value:</span> {value} wei
          </div>
          <div className="remix_ui_terminal_txItem">
            <span className="font-bold">data:</span> {input}
          </div>
          <div className="remix_ui_terminal_txItem">
            <span className="font-bold">logs:</span> {logs}
          </div>
          <div className="remix_ui_terminal_txItem">
            <span className="font-bold">hash:</span> {hash}
          </div>
        </span>
      </div>
    );
  } else {
    hash = shortenHexData(data.blockHash);
    return (
      <div>
        <span>
          <span className="remix_ui_terminal_tx font-bold mr-3">
            [block:{block.toString()} txIndex:{i ? i.toString() : '-'}]
          </span>
          <div className="remix_ui_terminal_txItem">
            <span className="font-bold">from:</span> {from}
          </div>
          <div className="remix_ui_terminal_txItem">
            <span className="font-bold">to:</span> {to}
          </div>
          <div className="remix_ui_terminal_txItem">
            <span className="font-bold">value:</span> {value} wei
          </div>
          <div className="remix_ui_terminal_txItem">
            <span className="font-bold">data:</span> {input}
          </div>
          <div className="remix_ui_terminal_txItem">
            <span className="font-bold">logs:</span> {logs}
          </div>
          <div className="remix_ui_terminal_txItem">
            <span className="font-bold">hash:</span> {hash}
          </div>
        </span>
      </div>
    );
  }
};

export default Context;
