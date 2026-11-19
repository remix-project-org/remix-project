import tape from 'tape'
import { Ethdebugger } from '../src/Ethdebugger'

// The same deployed bytecode is invalid before Shanghai and executes PUSH0 afterwards.
const address = '0x0000000000000000000000000000000000001234'
const cases = [
  { blockNumber: 16000000, fork: 'paris', opcode: 'INVALID' },
  { blockNumber: 18000000, fork: 'shanghai', opcode: 'PUSH0' },
  { blockNumber: 16000000, fork: 'paris', opcode: 'INVALID' }
]

tape('Debugger updates cached opcode decoding when the transaction fork changes', async t => {
  let current = cases[0]
  let codeReads = 0
  let traceFork: string
  const debug = new Ethdebugger({
    web3: {
      getNetwork: async () => ({ chainId: 1n }),
      getCode: async () => { codeReads++; return '0x5f00' },
      debug: {
        traceTransaction: (_hash, _options, callback) => callback(null, {
          fork: traceFork,
          structLogs: [{ pc: 0, op: current.opcode, depth: 1, gas: 100, gasCost: 2, stack: [], memory: []}]
        })
      }
    },
    compilationResult: async () => null,
    offsetToLineColumnConverter: { offsetToLineColumn: async () => null }
  })
  debug.event.register('newTraceLoaded', null, () => {
    t.equal(debug.codeManager.codeResolver.fork, current.fork, 'fork is set before trace listeners decode code')
  })
  try {
    for (const scenario of cases) {
      current = scenario
      await debug.debug({ hash: '0x' + scenario.blockNumber.toString(16).padStart(64, '0'), to: address, data: '0x', blockNumber: scenario.blockNumber })
      const code = await debug.codeManager.getCode(address)
      t.ok(code.instructions[0].includes(scenario.opcode), `decodes 0x5f as ${scenario.opcode} on ${scenario.fork}`)
    }
    t.equal(codeReads, 3, 'previous-fork instructions are invalidated in both directions')
    traceFork = 'unsupported-fork'
    await debug.debug({ hash: '0x' + 'a'.repeat(64), to: address, data: '0x', blockNumber: current.blockNumber })
    await debug.codeManager.getCode(address)
    t.equal(codeReads, 3, 'transactions on the same fork can reuse the code cache')
  } catch (error) {
    t.fail(error.stack || String(error))
  } finally {
    t.end()
  }
})
