'use strict'

import deepequal from 'deep-equal'
import * as sourceMappingDecoder from '../../../src/source/sourceMappingDecoder'
import * as vmCall from '../../vmCall'
import { TraceManager } from '../../../src/trace/traceManager'
import { CodeManager } from '../../../src/code/codeManager'
import { SolidityProxy } from '../../../src/solidity-decoder/solidityProxy'
import { InternalCallTree } from '../../../src/solidity-decoder/internalCallTree'
import { EventManager } from '../../../src/eventManager'
import * as helper from './helper'

module.exports = async function (st, privateKey, contractBytecode, compilationResult, contractCode) {
  let txHash
  let web3
  try {
    web3 = await (vmCall as any).getWeb3()
    const hash = await (vmCall as any).sendTx(web3, { nonce: 0, privateKey: privateKey }, undefined, 0, contractBytecode)
    const receipt = await web3.getTransactionReceipt(hash)
    const to = receipt.contractAddress
    console.log('to', to)
    // call to level11
    txHash = await (vmCall as any).sendTx(web3, { nonce: 1, privateKey: privateKey }, to, 0, 'a372a595000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000001520000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000015400000000000000000000000000000000000000000000000000000000000000')
  } catch (e) {
    return st.fail(e)
  }
  return new Promise((resolve) => {
    web3.getTransaction(txHash)
      .then(tx => {
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
        callTree.event.register('callTreeNotReady', (reason) => {
          st.fail(reason)
        })
        callTree.event.register('callTreeReady', (scopes, scopeStarts) => {
          helper.decodeLocals(st, 140, traceManager, callTree, function (locals) {
            try {
              const expected = { "p":{ "value":"45","type":"uint256" },"foo":{ "length":"1","value":[{ "value":"3","type":"uint8" }],"type":"uint8[1]" },"boo":{ "length":"1","value":[{ "length":"2","value":[{ "value":"R","type":"string" },{ "value":"T","type":"string" }],"type":"string[2]" }],"type":"string[2][1]" } }
              st.deepEqual(locals, expected)
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
}