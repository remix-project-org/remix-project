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

module.exports = async function testMappingStorage (st, cb) {
  const revertStateContract = require('../contracts/revert-state-sub-call.ts')
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
          testRevertStateSubCall(st, privateKey, tx.contractAddress, output, compilationResults, web3, cb)
        }
          // st.end()
        )
        .catch(error => {
          st.end(error)
        })
    }
  })
}

function testRevertStateSubCall (st, privateKey, contractAddress, output, compilationResults, web3, cb) {
  // call to foo(22)
  (vmCall as any).sendTx(web3, { nonce: 1, privateKey: privateKey }, contractAddress, 0, '8e0bf849',
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
              const storageViewerMyContract = new StorageViewer({
                stepIndex: 29,
                tx: tx,
                address: contractAddress
              }, new StorageResolver({ web3 }), traceManager)

              const stateVarsMyContract = stateDecoder.extractStateVariables('MyContract', output.sources)
              stateDecoder.decodeState(stateVarsMyContract, storageViewerMyContract).then((result) => {
                const contractAddressOtherContract = result['myCall'].value
                const storageViewerOtherContract1 = new StorageViewer({
                  stepIndex: 300,
                  tx: tx,
                  address: contractAddressOtherContract
                }, new StorageResolver({ web3 }), traceManager)

                const storageViewerOtherContract2 = new StorageViewer({
                  stepIndex: 550,
                  tx: tx,
                  address: contractAddressOtherContract
                }, new StorageResolver({ web3 }), traceManager)

                const storageViewerOtherContract3 = new StorageViewer({
                  stepIndex: 556,
                  tx: tx,
                  address: contractAddressOtherContract
                }, new StorageResolver({ web3 }), traceManager)

                const stateVars = stateDecoder.extractStateVariables('OtherContract', output.sources)
                stateDecoder.decodeState(stateVars, storageViewerOtherContract1).then((result) => {
                  // value should be set
                  st.equal(result['p'].value, '234')
                  stateDecoder.decodeState(stateVars, storageViewerOtherContract2).then((result) => {
                    // in the other sub call, the value is reverted
                    st.equal(result['p'].value, '0')
                    stateDecoder.decodeState(stateVars, storageViewerOtherContract3).then((result) => {
                      // and reset back to 234
                      st.equal(result['p'].value, '234')
                      cb()
                    }, (reason) => {
                      console.log('fail')
                      st.end(reason)
                    })
                  })
                }, (reason) => {
                  console.log('fail')
                  st.end(reason)
                })
              })
            }, (reason) => {
              console.log('fail')
              st.end(reason)
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
