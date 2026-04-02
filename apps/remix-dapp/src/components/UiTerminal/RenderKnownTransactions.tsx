import React from 'react';
import CheckTxStatus from './ChechTxStatus';
import Context from './Context';
import showTable from './Table';
import { execution } from '@remix-project/remix-lib';
const typeConversion = execution.typeConversion;

const RenderKnownTransactions = ({
  tx,
  receipt,
  resolvedData,
  logs,
  index,
  showTableHash,
  txDetails,
  provider,
}: any) => {
  const from = tx.from;
  const to = resolvedData.contractName + '.' + resolvedData.fn;
  const txType = 'knownTx';
  const options = { from, to, tx, logs };
  return (
    <span id={`tx${tx.hash}`} key={index}>
      <div
        className="remix_ui_terminal_log flex items-center pt-2"
        onClick={(event) => txDetails(event, tx)}
      >
        <CheckTxStatus tx={receipt} type={txType} />
        <Context opts={options} provider={provider} />
        <i
          className={`remix_ui_terminal_arrow flex ml-2 fas ${
            showTableHash.includes(tx.hash) ? 'fa-angle-up' : 'fa-angle-down'
          }`}
        ></i>
      </div>
      {showTableHash.includes(tx.hash)
        ? showTable(
          {
            hash: tx.hash,
            status: receipt !== null ? receipt.status : null,
            isCall: tx.isCall,
            contractAddress: receipt.contractAddress,
            blockHash: tx.blockHash,
            blockNumber: tx.blockNumber,
            data: tx,
            from,
            to,
            gas: tx.gas,
            input: tx.input,
            'decoded input': resolvedData?.params
              ? JSON.stringify(
                typeConversion.stringify(resolvedData.params),
                null,
                '\t'
              )
              : ' - ',
            'decoded output': resolvedData?.decodedReturnValue
              ? JSON.stringify(
                typeConversion.stringify(resolvedData.decodedReturnValue),
                null,
                '\t'
              )
              : ' - ',
            logs,
            val: tx.value,
            transactionCost: tx.transactionCost,
            executionCost: tx.executionCost,
          },
          showTableHash
        )
        : null}
    </span>
  );
};

export default RenderKnownTransactions;
