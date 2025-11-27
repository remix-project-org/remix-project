import { CompilerAbstract } from '@remix-project/remix-solidity'
import { EventManager } from '../../../src/eventManager'
import { compilerInput } from '../../helpers/compilerHelper'
import { TraceManager } from '../../../src/trace/traceManager'
import { CodeManager } from '../../../src/code/codeManager'
import { compile } from 'solc'
import * as stateDecoder from '../../../src/solidity-decoder/stateDecoder'
import { SolidityProxy } from '../../../src/solidity-decoder/solidityProxy'
import { InternalCallTree } from '../../../src/solidity-decoder/internalCallTree'
import * as vmCall from '../../vmCall'
import { StorageResolver } from '../../../src/storage/storageResolver'
import { StorageViewer } from '../../../src/storage/storageViewer'
import { Address, bytesToHex } from '@ethereumjs/util'

module.exports = async function testMappingStorage (st, cb) {
  const revertStateContract = require('../contracts/revert-state.ts')
  const privateKey = Buffer.from('503f38a9c967ed597e47fe25643985f032b072db8075426a92110f82df48dfcb', 'hex')
  let output = compile(compilerInput(revertStateContract.contract))
  output = JSON.parse(output);
  const sources = {
    target: 'test.sol',
    sources: { 'test.sol': { content: revertStateContract.contract } }
  }
  const compilationResults = new CompilerAbstract('json', output, sources)
  const web3 = await (vmCall as any).getWeb3();
  (vmCall as any).sendTx(web3, { nonce: 0, privateKey: privateKey }, undefined, 0, output.contracts['test.sol']['MyContract'].evm.bytecode.object, function (error, hash) {
    if (error) {
      console.log(error)
      st.end(error)
    } else {
      web3.getTransactionReceipt(hash)
        .then(tx => {
          // const storage = await this.vm.stateManager.dumpStorage(data.to)
          // web3.eth.getCode(tx.contractAddress).then((code) => console.log('code:---', code))
          // (vmCall as any).web3().debug.traceTransaction(hash).then((code) => console.log('trace:', code))
          testRevertState(st, privateKey, tx.contractAddress, output, compilationResults, web3, cb)
        }
          // st.end()
        )
        .catch(error => {
          st.end(error)
        })
    }
  })
}

function testRevertState (st, privateKey, contractAddress, output, compilationResults, web3, cb) {
  // call to foo(22)
  (vmCall as any).sendTx(web3, { nonce: 1, privateKey: privateKey }, contractAddress, 0, '2fbebd380000000000000000000000000000000000000000000000000000000000000016',
    function (error, hash) {
      if (error) {
        console.log(error)
        st.end(error)
      } else {
        web3.getTransaction(hash)
          .then(tx => {
            const traceManager = new TraceManager({ web3 })
            const codeManager = new CodeManager(traceManager)
            codeManager.clear()
            console.log(compilationResults)
            const solidityProxy = new SolidityProxy({
              getCurrentCalledAddressAt: traceManager.getCurrentCalledAddressAt.bind(traceManager),
              getCode: codeManager.getCode.bind(codeManager),
              compilationResult: () => compilationResults
            })
            const debuggerEvent = new EventManager()
            const callTree = new InternalCallTree(debuggerEvent, traceManager, solidityProxy, codeManager, { includeLocalVariables: true })
            callTree.event.register('callTreeBuildFailed', (error) => {
              st.fail(error)
            })
            callTree.event.register('callTreeNotReady', (reason) => {
              st.fail(reason)
            })
            callTree.event.register('callTreeReady', (scopes, scopeStarts) => {
              const storageViewer = new StorageViewer({
                stepIndex: 120,
                tx: tx,
                address: contractAddress
              }, new StorageResolver({ web3 }), traceManager)
              const stateVars = stateDecoder.extractStateVariables('MyContract', output.sources)
              stateDecoder.decodeState(stateVars, storageViewer).then((result) => {
                // even if the call is reverted, the value still persist during the call exeecution
                st.equal(result['data'].value, '22')
                cb()
              }, (reason) => {
                console.log('fail')
                st.end(reason)
              })
            })

            traceManager.resolveTrace(tx).then(() => {
              debuggerEvent.trigger('newTraceLoaded', [traceManager.trace])
            }).catch((error) => {
              st.fail(error)
            })
          })
          .catch(error => {
            console.log(error)
            st.end(error)
          })
      }
    })
}
