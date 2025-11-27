import React from 'react' // eslint-disable-line
import DropdownPanel from './dropdown-panel' // eslint-disable-line

export const GlobalVariables = ({ block, receipt, tx, className }) => {
  // see https://docs.soliditylang.org/en/latest/units-and-global-variables.html#block-and-transaction-properties
  const globals = {
    'block.chainid': tx && tx.chainId,
    'block.coinbase': block && block.miner,
    'block.difficulty': block && block.difficulty,
    'block.gaslimit': block && block.gasLimit,
    'block.number': block && block.number,
    'block.timestamp': block && block.timestamp,
    'msg.sender': tx && tx.from,
    'msg.sig': tx && tx.input && tx.input.substring(0, 10),
    'msg.value': tx && tx.value + ' Wei',
    'tx.origin': tx && tx.from
  }
  if (block && block.baseFeePerGas) {
    globals['block.basefee'] = BigInt(block.baseFeePerGas).toString(10) + ` Wei (${block.baseFeePerGas})`
  }

  return (
    <div id="globalvariable" data-id="globalvariable" className={className}>
      <DropdownPanel hexHighlight={false} bodyStyle={{ fontFamily: 'monospace' }} dropdownName="Global Variables" calldata={globals || {}} />
    </div>
  )
}

export default GlobalVariables
