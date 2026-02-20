'use strict'
import * as vmCall from '../../vmCall'
import { contractCreationToken } from '../../../src/trace/traceHelper'
import { SolidityProxy } from '../../../src/solidity-decoder/solidityProxy'
import { InternalCallTree } from '../../../src/solidity-decoder/internalCallTree'
import { EventManager } from '../../../src/eventManager'
import { TraceManager } from '../../../src/trace/traceManager'
import { CodeManager } from '../../../src/code/codeManager'
import * as sourceMappingDecoder from '../../../src/source/sourceMappingDecoder'
import { solidityLocals } from '../../../src/solidity-decoder/localDecoder'

export interface DebuggerSetup {
  traceManager: TraceManager
  callTree: InternalCallTree
  waitForCallTree: () => Promise<any>
}

/*
  Setup debugging infrastructure for tests
*/
export async function setupDebugger(privateKey: string | Buffer, contractBytecode: string, compilationResult: any, contractCode: string, txData?: string): Promise<DebuggerSetup> {
  const web3 = await (vmCall as any).getWeb3()

  const sendTransaction = (web3, txParams, to, value, data) => {
    return new Promise((resolve, reject) => {
      (vmCall as any).sendTx(web3, txParams, to, value, data, (error, hash) => {
        if (error) reject(error)
        else resolve(hash)
      })
    })
  }

  let tx
  if (txData) {
    // For contract calls
    const deployHash = await sendTransaction(web3, { nonce: 0, privateKey: privateKey }, undefined, 0, contractBytecode)
    const receipt = await web3.getTransactionReceipt(deployHash)
    const to = receipt.contractAddress
    const txHash = await sendTransaction(web3, { nonce: 1, privateKey: privateKey }, to, 0, txData)
    tx = await web3.getTransaction(txHash)
  } else {
    // For contract deployment
    const hash = await sendTransaction(web3, { nonce: 0, privateKey: privateKey }, undefined, 0, contractBytecode)
    tx = await web3.getTransaction(hash)
    tx.to = contractCreationToken('0')
  }

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
    offsetToLineColumn: async (rawLocation) => {
      const lineBreaks = sourceMappingDecoder.getLinebreakPositions(contractCode)
      return sourceMappingDecoder.convertOffsetToLineColumn(rawLocation, lineBreaks)
    }
  }

  const callTree = new InternalCallTree(debuggerEvent, traceManager, solidityProxy, codeManager, { includeLocalVariables: true }, offsetToLineColumnConverter)

  const waitForCallTree = () => {
    return new Promise((resolve, reject) => {
      callTree.event.register('callTreeBuildFailed', (error) => {
        reject(error)
      })

      callTree.event.register('callTreeNotReady', (reason) => {
        reject(reason)
      })

      callTree.event.register('callTreeReady', async (scopes, scopeStarts) => {
        resolve({ scopes, scopeStarts })
      })
    })
  }

  await traceManager.resolveTrace(tx)
  debuggerEvent.trigger('newTraceLoaded', [traceManager.trace])

  return {
    traceManager,
    callTree,
    waitForCallTree
  }
}

/*
  Decode local variable
*/
export async function decodeLocals (st, index, traceManager, callTree, verifier) {
  try {
    // Convert traceManager methods to async but keep callback compatibility
    const getStackAt = async (stepIndex) => {
      return traceManager.getStackAt(stepIndex)
    }

    const getMemoryAt = async (stepIndex) => {
      return traceManager.getMemoryAt(stepIndex)
    }

    const getCallDataAt = async (stepIndex) => {
      return traceManager.getCallDataAt(stepIndex)
    }

    // Execute all operations in parallel
    const [stackResult, memoryResult, callDataResult] = await Promise.all([
      getStackAt(index),
      getMemoryAt(index),
      getCallDataAt(index)
    ])

    const locals = await solidityLocals(
      index,
      callTree,
      stackResult,
      memoryResult,
      {},
      callDataResult,
      { start: 5000 },
      null
    )

    if (verifier) {
      verifier(locals)
    }
    return locals
  } catch (error) {
    st.fail(error.message || error)
    throw error
  }
}
