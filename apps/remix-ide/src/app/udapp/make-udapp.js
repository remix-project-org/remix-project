import {Registry} from '@remix-project/remix-lib'

var remixLib = require('@remix-project/remix-lib')
var EventsDecoder = remixLib.execution.EventsDecoder

export function makeUdapp (blockchain, logHtmlCallback) {
  // ----------------- Tx listener -----------------
  const _transactionReceipts = {}
  const transactionReceiptResolver = (tx, cb) => {
    if (_transactionReceipts[tx.hash]) {
      return cb(null, _transactionReceipts[tx.hash])
    }
    let res = blockchain.web3().getTransactionReceipt(tx.hash, (error, receipt) => {
      if (error) {
        return cb(error)
      }
      _transactionReceipts[tx.hash] = receipt
      cb(null, receipt)
    })
    if(res && typeof res.then ==='function'){
      res.then((receipt)=>{
        _transactionReceipts[tx.hash] = receipt
        cb(null, receipt)
      }).catch((error)=>{
        cb(error)
      })
    }
  }

  const txlistener = blockchain.getTxListener({
    api: {
      contracts: async function () {
        const lastCompilationResult = await blockchain.call('compilerArtefacts', 'getLastCompilationResult')

        if (lastCompilationResult) return await blockchain.call('compilerArtefacts', 'getAllContractDatas')
      },
      resolveReceipt: transactionReceiptResolver
    }
  })

  Registry.getInstance().put({ api: txlistener, name: 'txlistener' })
  blockchain.startListening(txlistener)

  const eventsDecoder = new EventsDecoder({
    resolveReceipt: transactionReceiptResolver
  })
  txlistener.startListening()
  Registry.getInstance().put({ api: eventsDecoder, name: 'eventsDecoder' })
}
