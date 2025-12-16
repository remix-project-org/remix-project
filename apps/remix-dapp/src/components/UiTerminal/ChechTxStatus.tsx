import React from 'react';

const CheckTxStatus = ({ tx, type }: any) => {
  if (tx.status === 1 || tx.status === '0x1' || tx.status === true) {
    return (
      <i className="remix_ui_terminal_txStatus d-flex me-3 remix_ui_terminal_succeeded fas fa-check-circle"></i>
    );
  }
  if (type === 'call' || type === 'unknownCall' || type === 'unknown') {
    return (
      <i className="remix_ui_terminal_txStatus d-flex me-3 justify-content-center align-items-center fw-bold text-uppercase rounded-circle remix_ui_terminal_call">
        call
      </i>
    );
  } else if (tx.status === 0 || tx.status === '0x0' || tx.status === false) {
    return (
      <i className="remix_ui_terminal_txStatus d-flex me-3 remix_ui_terminal_failed fas fa-times-circle"></i>
    );
  } else {
    return (
      <i
        className="remix_ui_terminal_txStatus d-flex me-3 fas fa-circle-thin"
      ></i>
    );
  }
};

export default CheckTxStatus;
