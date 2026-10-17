import * as assert from 'assert'
import { describe, it } from 'mocha'
import { Compiler } from '../src/compiler/compiler'
import { MessageFromWorker, MessageToWorker, SourceWithTarget } from '../src/compiler/types'

function setupCompiler () {
  let receiveMessage: (event: { data: MessageFromWorker }) => void
  const messages: MessageToWorker[] = []
  const results: Parameters<Compiler['onCompilationFinished']>[] = []
  const worker = {
    addEventListener: (type: string, listener: typeof receiveMessage) => {
      if (type === 'message') receiveMessage = listener
    },
    postMessage: (message: MessageToWorker) => messages.push(message)
  }
  const compiler = new Compiler()
  compiler.workerHandler = { getWorker: () => worker as unknown as Worker }
  compiler.onCompilationFinished = (...args) => results.push(args)
  compiler.loadWorker('soljson.js')

  return {
    compiler,
    messages,
    results,
    receive: (data: MessageFromWorker) => receiveMessage({ data })
  }
}

function sourceFiles (): SourceWithTarget {
  return { sources: { 'test.sol': { content: 'contract Test {}' } } }
}

describe('compiler worker jobs', () => {
  it('passes the original sources and compilation metadata for a pending job', () => {
    const { compiler, messages, results, receive } = setupCompiler()
    const source = sourceFiles()
    compiler.state.currentVersion = '0.8.26'
    compiler.state.compileJSON(source, 100)
    const request = messages[messages.length - 1]

    receive({ cmd: 'compiled', job: request.job, data: '{}', missingInputs: [], input: request.input, timestamp: 100 })

    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0][2], source)
    assert.deepStrictEqual(results[0], [{}, [], source, request.input, '0.8.26', 100])
  })

  it('handles an unknown job without consuming a pending job', () => {
    const { compiler, messages, results, receive } = setupCompiler()
    const source = sourceFiles()
    compiler.state.compileJSON(source, 100)
    const request = messages[messages.length - 1]

    assert.doesNotThrow(() => receive({ cmd: 'compiled', job: 1234, data: '{}' }))
    assert.strictEqual(results.length, 1)
    assert.deepStrictEqual(results[0][2], {})

    receive({ cmd: 'compiled', job: request.job, data: '{}' })
    assert.strictEqual(results.length, 2)
    assert.strictEqual(results[1][2], source)
  })

  it('handles a duplicate response after the completed job has been deleted', () => {
    const { compiler, messages, results, receive } = setupCompiler()
    const source = sourceFiles()
    compiler.state.compileJSON(source, 100)
    const request = messages[messages.length - 1]
    const response: MessageFromWorker = { cmd: 'compiled', job: request.job, data: '{}' }

    receive(response)
    assert.doesNotThrow(() => receive(response))

    assert.strictEqual(results.length, 2)
    assert.strictEqual(results[0][2], source)
    assert.deepStrictEqual(results[1][2], {})
  })
})
