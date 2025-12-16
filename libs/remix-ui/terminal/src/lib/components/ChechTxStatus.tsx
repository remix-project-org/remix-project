import React from 'react' // eslint-disable-line

const CheckTxStatus = ({ tx, type }) => {
  if (tx.status === 1 || tx.status === '0x1' || tx.status === true || tx.status === '1' || tx.status === BigInt(1)) {
    return <i className="remix_ui_terminal_txStatus remix_ui_terminal_succeeded fas fa-check-circle"></i>
  }
  if (type === 'call' || type === 'unknownCall' || type === 'unknown') {
    return <i className="remix_ui_terminal_txStatus remix_ui_terminal_call">call</i>
  } else if (tx.status === 0 || tx.status === '0x0' || tx.status === false) {
    return <i className="remix_ui_terminal_txStatus remix_ui_terminal_failed fas fa-times-circle"></i>
  } else {
    return <i className="remix_ui_terminal_txStatus fas fa-circle-thin"></i>
  }
}

export default CheckTxStatus
