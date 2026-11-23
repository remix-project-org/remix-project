import tape from 'tape'
import { CodeManager } from '../src/code/codeManager'
import { TraceManager } from '../src/trace/traceManager'
import { EventManager } from '../src/eventManager'
import { InternalCallTree } from '../src/solidity-decoder/internalCallTree'
import { getOpcodeInfo, updateSymbolicStack } from '../src/solidity-decoder/opcodeStackHandler'
import type { SymbolicStackSlot } from '../src/solidity-decoder/symbolicStack'

tape('Monad recorded bytecode is isolated from Ethereum when the trace fork changes', async (t) => {
  const address = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
  const requests: string[] = []
  const traceManager = new TraceManager({ web3: {
    getCode: async (requested: string) => {
      requests.push(requested)
      return '0x6002'
    }
  } })
  traceManager.fork = 'monad-next'
  traceManager.monadCodeByAddress[address] = '0x6001'
  const codeManager = new CodeManager(traceManager)
  try {
    for (const [fork, expected] of [
      ['monad-next', '0x6001'], ['osaka', '0x6002'],
      ['monad-eight', '0x6001'], ['prague', '0x6002'],
      ['monad-nine', '0x6001'], ['monad-ten', '0x6001']
    ]) {
      traceManager.fork = fork
      codeManager.codeResolver.fork = fork
      codeManager.clear()
      const code = await codeManager.getCode(address.toUpperCase())
      t.equal(code.bytecode, expected, `${fork} resolves bytecode from its own execution environment`)
    }
    t.deepEqual(requests, [address.toUpperCase(), address.toUpperCase()], 'Ethereum uses RPC even if Monad recorded code remains')

    traceManager.monadCodeByAddress[address] = '0x'
    codeManager.clear()
    t.equal((await codeManager.getCode(address)).bytecode, '0x', 'empty recorded code does not fall back to current state')
    t.equal(requests.length, 2, 'recorded empty code avoids an RPC lookup')

    traceManager.monadCodeByAddress = {}
    codeManager.clear()
    t.equal((await codeManager.getCode(address)).bytecode, '0x6002', 'missing Monad recorded code falls back to RPC')
    t.equal(requests.length, 3, 'missing recorded code performs an RPC lookup')
  } catch (error) {
    t.fail(error.message)
  }
  t.end()
})

tape('Monad extension stack effects require the Monad Next trace fork', (t) => {
  const parameter: SymbolicStackSlot = { kind: 'parameter', variableId: 7, variableName: 'depth' }
  for (const fork of ['monad-next', 'monad-eight', 'monad-nine', 'monad-ten', 'prague', 'osaka', 'monad-future', undefined]) {
    const enabled = fork === 'monad-next'
    const depth = getOpcodeInfo('CALLSTACKDEPTH', fork)
    const caller = getOpcodeInfo('CALLERN', fork)
    t.deepEqual(depth, enabled ? { name: 'CALLSTACKDEPTH', in: 0, out: 1 } : { name: 'UNKNOWN', in: 0, out: 0 }, `${fork}: CALLSTACKDEPTH metadata`)
    t.deepEqual(caller, enabled ? { name: 'CALLERN', in: 1, out: 1 } : { name: 'UNKNOWN', in: 0, out: 0 }, `${fork}: CALLERN metadata`)

    const afterDepth = updateSymbolicStack([parameter], 'CALLSTACKDEPTH', 0, fork)
    const afterCaller = updateSymbolicStack(afterDepth, 'CALLERN', 1, fork)
    if (enabled) {
      t.equal(afterDepth.length, 2, 'CALLSTACKDEPTH pushes one symbolic value')
      t.equal(afterCaller.length, 2, 'CALLERN consumes the depth and pushes the caller')
      t.deepEqual(afterCaller[1], { kind: 'intermediate', originStep: 1, originOp: 'CALLERN', derivedFrom: [1]}, 'CALLERN preserves the dependency on its depth argument')
    } else {
      t.deepEqual(afterCaller, [parameter], `${fork}: inactive extension names do not change the symbolic stack`)
    }
    t.equal(afterCaller[0], parameter, `${fork}: existing variable binding is preserved`)
    t.deepEqual(getOpcodeInfo('ADD', fork), { name: 'ADD', in: 2, out: 1 }, `${fork}: standard opcode metadata is unchanged`)
  }
  t.end()
})

tape('Internal call trees use the loaded trace fork for Monad symbolic stack effects', async (t) => {
  t.timeoutAfter(5000)
  const events = new EventManager()
  let fork = 'monad-next'
  const traceManager = {
    getCurrentFork: () => fork,
    getCurrentCalledAddressAt: () => '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    trace: ['CALLSTACKDEPTH', 'CALLERN', 'STOP'].map((op, index) => ({
      op, pc: index * 2, depth: 1, gas: 100 - index, gasCost: 1, memory: [], stack: index ? [0] : []
    }))
  }
  const tree = new InternalCallTree(events, traceManager, {
    compilationResult: async () => ({ data: { contracts: {} }, getContract: () => null }),
    contractObjectAtAddress: async () => null,
    ast: async () => null
  }, null, {})
  tree.extractSourceLocation = async () => ({ start: -1, length: -1, file: -1, jump: '-' })
  try {
    for (fork of ['monad-next', 'osaka', 'monad-ten', 'monad-next']) {
      await new Promise<void>((resolve, reject) => {
        tree.event.register('callTreeReady', resolve)
        tree.event.register('callTreeBuildFailed', reject)
        tree.event.register('callTreeNotReady', reject)
        events.trigger('newTraceLoaded', [traceManager.trace])
      })
      const stack = tree.symbolicStackManager.getStackAtStep(2)
      t.equal(stack.length, fork === 'monad-next' ? 1 : 0, `${fork}: call tree applies extension effects only for Monad Next`)
      if (fork === 'monad-next') t.equal(stack[0].originOp, 'CALLERN', 'call tree preserves the extension result')
    }
  } catch (error) {
    t.fail(error.message)
  }
  t.end()
})
