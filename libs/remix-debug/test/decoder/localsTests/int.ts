'use strict'

import * as vmCall from '../../vmCall'
import { TraceManager } from '../../../src/trace/traceManager'
import { CodeManager } from '../../../src/code/codeManager'
import { contractCreationToken } from '../../../src/trace/traceHelper'
import { SolidityProxy } from '../../../src/solidity-decoder/solidityProxy'
import { InternalCallTree } from '../../../src/solidity-decoder/internalCallTree'
import { EventManager } from '../../../src/eventManager'
import * as sourceMappingDecoder from '../../../src/source/sourceMappingDecoder'
import * as helper from './helper'

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
          callTree.event.register('callTreeNotReady', (reason) => {
            st.fail(reason)
          })
          callTree.event.register('callTreeReady', async (scopes, scopeStarts) => {
            try {

              // test gas cost per line
              st.equals((await callTree.getGasCostPerLine(0, 16)).gasCost, 10)
              st.equals((await callTree.getGasCostPerLine(0, 32)).gasCost, 84)

              const functions1 = callTree.retrieveFunctionsStack(103)
              const functions2 = callTree.retrieveFunctionsStack(116)
              const functions3 = callTree.retrieveFunctionsStack(13)

              st.equals(functions1.length, 2)
              st.equals(functions2.length, 3)
              st.equals(functions3.length, 1)

              st.equal(functions1[0].gasCost, 53)
              st.equal(functions1[1].gasCost, 423)

              st.equal(functions2[0].gasCost, 22)
              st.equal(functions2[1].gasCost, 53)
              st.equal(functions2[2].gasCost, 423)

              st.equals(Object.keys(functions1[0])[0], 'functionDefinition')
              st.equals(Object.keys(functions1[0])[1], 'inputs')
              st.equals(functions1[0].inputs[0], 'foo')
              st.equals(Object.keys(functions2[0])[0], 'functionDefinition')
              st.equals(Object.keys(functions2[0])[1], 'inputs')
              st.equals(Object.keys(functions2[1])[0], 'functionDefinition')
              st.equals(Object.keys(functions2[1])[1], 'inputs')
              st.equals(functions2[0].inputs[0], 'asd')
              st.equals(functions2[1].inputs[0], 'foo')

              st.equals(functions1[0].functionDefinition.name, 'level11')
              st.equals(functions2[0].functionDefinition.name, 'level12')
              st.equals(functions2[1].functionDefinition.name, 'level11')

              st.equals(scopeStarts[0], '1')
              st.equals(scopeStarts[10], '1.1')
              st.equals(scopeStarts[102], '1.1.1')
              st.equals(scopeStarts[115], '1.1.1.1')
              st.equals(scopeStarts[136], '1.1.2')
              st.equals(scopeStarts[153], '1.1.3')
              st.equals(scopeStarts[166], '1.1.3.1')
              st.equals(scopes['1.1'].locals['ui8'].type.typeName, 'uint8')
              st.equals(scopes['1.1'].locals['ui16'].type.typeName, 'uint16')
              st.equals(scopes['1.1'].locals['ui32'].type.typeName, 'uint32')
              st.equals(scopes['1.1'].locals['ui64'].type.typeName, 'uint64')
              st.equals(scopes['1.1'].locals['ui128'].type.typeName, 'uint128')
              st.equals(scopes['1.1'].locals['ui256'].type.typeName, 'uint256')
              st.equals(scopes['1.1'].locals['ui'].type.typeName, 'uint256')
              st.equals(scopes['1.1'].locals['i8'].type.typeName, 'int8')
              st.equals(scopes['1.1'].locals['i16'].type.typeName, 'int16')
              st.equals(scopes['1.1'].locals['i32'].type.typeName, 'int32')
              st.equals(scopes['1.1'].locals['i64'].type.typeName, 'int64')
              st.equals(scopes['1.1'].locals['i128'].type.typeName, 'int128')
              st.equals(scopes['1.1'].locals['i256'].type.typeName, 'int256')
              st.equals(scopes['1.1'].locals['i'].type.typeName, 'int256')
              st.equals(scopes['1.1'].locals['ishrink'].type.typeName, 'int32')
              st.equals(scopes['1.1.1'].locals['ui8'].type.typeName, 'uint8')
              st.equals(scopes['1.1.1.1'].locals['ui81'].type.typeName, 'uint8')
              st.equals(scopes['1.1.2'].locals['ui81'].type.typeName, 'uint8')
              st.equals(scopes['1.1.3'].locals['ui8'].type.typeName, 'uint8')
              st.equals(scopes['1.1.3.1'].locals['ui81'].type.typeName, 'uint8')
            } catch (e) {
              st.fail(e.message)
            }

            helper.decodeLocals(st, 95, traceManager, callTree, function (locals) {
              st.equals(Object.keys(locals).length, 16)
              st.equals(locals['ui8'].value, '130')
              st.equals(locals['ui16'].value, '456')
              st.equals(locals['ui32'].value, '4356')
              st.equals(locals['ui64'].value, '3543543543')
              st.equals(locals['ui128'].value, '234567')
              st.equals(locals['ui256'].value, '115792089237316195423570985008687907853269984665640564039457584007880697216513')
              st.equals(locals['ui'].value, '123545666')
              st.equals(locals['i8'].value, '-45')
              st.equals(locals['i16'].value, '-1234')
              st.equals(locals['i32'].value, '3455')
              st.equals(locals['i64'].value, '-35566')
              st.equals(locals['i128'].value, '-444444')
              st.equals(locals['i256'].value, '3434343')
              st.equals(locals['i'].value, '-32432423423')
              st.equals(locals['ishrink'].value, '2')
            })

            helper.decodeLocals(st, 106, traceManager, callTree, function (locals) {
              try {
                st.equals(locals['ui8'].value, '123')
                st.equals(Object.keys(locals).length, 2)
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

