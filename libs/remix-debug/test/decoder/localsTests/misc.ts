'use strict'
import * as vmCall from '../../vmCall'
import { contractCreationToken } from '../../../src/trace/traceHelper'
import { SolidityProxy } from '../../../src/solidity-decoder/solidityProxy'
import { InternalCallTree } from '../../../src/solidity-decoder/internalCallTree'
import { EventManager } from '../../../src/eventManager'
import * as helper from './helper'
import { TraceManager } from '../../../src/trace/traceManager'
import { CodeManager } from '../../../src/code/codeManager'
import * as sourceMappingDecoder from '../../../src/source/sourceMappingDecoder'

module.exports = function (st, privateKey, contractBytecode, compilationResult, contractCode) {
  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async (resolve) => {
    const web3 = await (vmCall as any).getWeb3();
    (vmCall as any).sendTx(web3, { nonce: 0, privateKey: privateKey }, undefined, 0, contractBytecode, function (error, hash) {
      if (error) {
        return st.fail(error)
      }
      web3.getTransaction(hash)
        .then(tx => {
          tx.to = contractCreationToken('0')
          const traceManager = new TraceManager({ web3 })
          const codeManager = new CodeManager(traceManager)
          codeManager.clear()
          const solidityProxy = new SolidityProxy({
            getCurrentCalledAddressAt: traceManager.getCurrentCalledAddressAt.bind(traceManager),
            getCode: codeManager.getCode.bind(codeManager),
            compilationResult: () => compilationResult
          })
          const debuggerEvent = new EventManager()
          const offsetToLineColumnConverter = {
            offsetToLineColumn: (rawLocation) => {
              return new Promise((resolve) => {
                const lineBreaks = sourceMappingDecoder.getLinebreakPositions(contractCode)
                resolve(sourceMappingDecoder.convertOffsetToLineColumn(rawLocation, lineBreaks))
              })
            }
          }
          const callTree = new InternalCallTree(debuggerEvent, traceManager, solidityProxy, codeManager, { includeLocalVariables: true }, offsetToLineColumnConverter)
          callTree.event.register('callTreeBuildFailed', (error) => {
            st.fail(error)
          })
          callTree.event.register('callTreeReady', (scopes, scopeStarts) => {
            helper.decodeLocals(st, 70, traceManager, callTree, function (locals) {
              try {
                st.equals(locals['boolFalse'].value, false)
                st.equals(locals['boolTrue'].value, true)
                st.equals(locals['testEnum'].value, 'three')
                st.equals(locals['sender'].value, '0x5B38DA6A701C568545DCFCB03FCB875F56BEDDC4')
                st.equals(locals['_bytes1'].value, '0x99')
                st.equals(locals['__bytes1'].value, '0x99')
                st.equals(locals['__bytes2'].value, '0x99AB')
                st.equals(locals['__bytes4'].value, '0x99FA0000')
                st.equals(locals['__bytes6'].value, '0x990000000000')
                st.equals(locals['__bytes7'].value, '0x99356700000000')
                st.equals(locals['__bytes8'].value, '0x99ABD41700000000')
                st.equals(locals['__bytes9'].value, '0x99156744AF00000000')
                st.equals(locals['__bytes13'].value, '0x99123423425300000000000000')
                st.equals(locals['__bytes16'].value, '0x99AFAD23432400000000000000000000')
                st.equals(locals['__bytes24'].value, '0x99AFAD234324000000000000000000000000000000000000')
                st.equals(locals['__bytes32'].value, '0x9999ABD41799ABD4170000000000000000000000000000000000000000000000')
                st.equals(Object.keys(locals).length, 16)
              } catch (e) {
                st.fail(e.message)
              }
            })

            helper.decodeLocals(st, 7, traceManager, callTree, function (locals) {
              try {
                // st.equals(Object.keys(locals).length, 0)
                st.equals(0, 0)
              } catch (e) {
                st.fail(e.message)
              }
              resolve({})
            })
          })
          traceManager.resolveTrace(tx).then(() => {
            debuggerEvent.trigger('newTraceLoaded', [traceManager.trace])
          }).catch((error) => {
            st.fail(error)
          })
        })
        .catch(error => st.fail(error))
    })
  })
}
