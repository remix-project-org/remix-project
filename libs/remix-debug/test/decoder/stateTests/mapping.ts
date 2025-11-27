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
  const mappingStorage = require('../contracts/mappingStorage')
  const privateKey = Buffer.from('503f38a9c967ed597e47fe25643985f032b072db8075426a92110f82df48dfcb', 'hex')
  let output = compile(compilerInput(mappingStorage.contract))
  output = JSON.parse(output);
  const sources = {
    target: 'test.sol',
    sources: { 'test.sol': { content: mappingStorage.contract } }
  }
  const compilationResults = new CompilerAbstract('json', output, sources)
  const web3 = await (vmCall as any).getWeb3();
  (vmCall as any).sendTx(web3, { nonce: 0, privateKey: privateKey }, undefined, 0, output.contracts['test.sol']['SimpleMappingState'].evm.bytecode.object, function (error, hash) {
    if (error) {
      console.log(error)
      st.end(error)
    } else {
      web3.getTransactionReceipt(hash)
        .then(tx => {
          // const storage = await this.vm.stateManager.dumpStorage(data.to)
          // web3.eth.getCode(tx.contractAddress).then((code) => console.log('code:---', code))
          // (vmCall as any).web3().debug.traceTransaction(hash).then((code) => console.log('trace:', code))
          testMapping(st, privateKey, tx.contractAddress, output, compilationResults, web3, cb)
        }
          // st.end()
        )
        .catch(error => {
          st.end(error)
        })
    }
  })
}

function testMapping (st, privateKey, contractAddress, output, compilationResults, web3, cb) {
  (vmCall as any).sendTx(web3, { nonce: 1, privateKey: privateKey }, contractAddress, 0, '2fd0a83a00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000001074686973206973206120737472696e6700000000000000000000000000000000',
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
                stepIndex: 472,
                tx: tx,
                address: contractAddress
              }, new StorageResolver({ web3 }), traceManager)
              const stateVars = stateDecoder.extractStateVariables('SimpleMappingState', output.sources)
              stateDecoder.decodeState(stateVars, storageViewer).then((result) => {
                st.equal(result['_num'].value, '1')
                st.equal(result['_num'].type, 'uint256')
                st.equal(result['_iBreakSolidityState'].type, 'mapping(string => uint256)')
                st.equal(result['_iBreakSolidityState'].value['74686973206973206120737472696e67'].value, '1')
                st.equal(result['_iBreakSolidityState'].value['74686973206973206120737472696e67'].type, 'uint256')
                st.equal(result['_iBreakSolidityStateInt'].type, 'mapping(uint256 => uint256)')
                st.equal(result['_iBreakSolidityStateInt'].value['0000000000000000000000000000000000000000000000000000000000000001'].value, '1')
                st.equal(result['_iBreakSolidityStateInt'].value['0000000000000000000000000000000000000000000000000000000000000001'].type, 'uint256')
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
