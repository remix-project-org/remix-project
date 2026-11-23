import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { transformSync } from 'esbuild'
import { ethers } from 'ethers'
import { Engine, initSync } from 'monad-evm2js'
import solc from 'solc'
import { MonadProvider } from '../../libs/remix-monad/src/provider'

initSync({ module: readFileSync('node_modules/monad-evm2js/dist/monad_evm2js_bg.wasm') })

const source = readFileSync('libs/remix-monad/examples/MonadSigning.sol', 'utf8')
const output = JSON.parse(solc.compile(JSON.stringify({
  language: 'Solidity',
  sources: {
    'contracts/MonadSigning.sol': { content: source },
    'hardhat/console.sol': { content: readFileSync('node_modules/hardhat/console.sol', 'utf8') }
  },
  settings: { evmVersion: 'cancun', outputSelection: { '*': { '*': ['abi', 'evm.bytecode']} } }
})))
assert.deepEqual((output.errors || []).filter(error => error.severity === 'error'), [])
const compiled = output.contracts['contracts/MonadSigning.sol'].MonadSigning
const metadata = JSON.stringify({ abi: compiled.abi, data: { bytecode: compiled.evm.bytecode } })
// Supply Remix's injected globals while executing the same TypeScript example.
const script = transformSync(readFileSync('libs/remix-monad/examples/sign-and-execute.ts', 'utf8')
  .replace("import { ethers } from 'ethers'", ''), { loader: 'ts', target: 'es2022' }).code

for (const fork of ['monad-eight', 'monad-nine', 'monad-ten', 'monad-next'] as const) {
  test(`${fork}: the example signs, verifies in Solidity, logs and records a debuggable transaction`, async () => {
    const engine = new Engine(fork, 143)
    const local = new MonadProvider({ fork }, engine)
    await local.init()
    const request = (method: string, ...params: any[]) => local.request({ method, params })
    const [, account] = await request('eth_accounts')
    const files = new Map([['artifacts/MonadSigning.json', metadata]])
    const messages: string[][] = []
    let provider: ethers.BrowserProvider
    try {
      await runInNewContext(`(async () => { ${script} })()`, {
        ethers: { ...ethers, BrowserProvider: class extends ethers.BrowserProvider {
          constructor(input: ethers.Eip1193Provider) { super(input); provider = this }
        } },
        web3Provider: local,
        remix: { call: async (plugin: string, method: string, path: string, content?: string) => {
          if (plugin === 'udappEnv') {
            assert.equal(method, 'getSelectedAccount')
            return account.toLowerCase()
          }
          assert.equal(plugin, 'fileManager')
          if (method === 'writeFile') { files.set(path, content); return }
          assert.equal(method, 'readFile')
          assert.ok(files.has(path), `Missing example file: ${path}`)
          return files.get(path)
        } },
        console: { log: (...args: string[]) => messages.push(args) }
      })
      const data = JSON.parse(files.get('MonadTypedData.json'))
      assert.equal(BigInt(data.domain.chainId), 143n)
      assert.equal(data.message.value, '42')
      assert.equal(data.message.nonce, '0')
      const block = await request('eth_getBlockByNumber', 'latest', true)
      const transaction = block.transactions[0]
      assert.equal(transaction.from, account)
      assert.equal(transaction.to.toLowerCase(), data.domain.verifyingContract.toLowerCase())
      assert.equal((await request('eth_getTransactionReceipt', transaction.hash)).status, '0x1')
      assert.deepEqual(await request('eth_getHHLogsForTx', transaction.hash), [['Stored value', '42'], ['Signer', account]])
      assert.deepEqual(messages.slice(0, 2), [['Stored value', '42'], ['Signer', account]])
      assert.ok(messages.at(-1)[0].includes(transaction.hash))

      const trace = await request('debug_traceTransaction', transaction.hash)
      assert.equal(trace.failed, false)
      assert.ok(trace.structLogs.some(step => step.op === 'SSTORE'))
      assert.ok(trace.structLogs.some(step => step.op === 'STATICCALL' && BigInt('0x' + step.stack.at(-2)) === 1n))
      assert.ok(trace.codeByAddress[transaction.to.toLowerCase()])

      // The contract consumes its nonce, so the same authorization cannot be replayed.
      const replay = await request('eth_sendTransaction', {
        from: account, to: transaction.to, data: transaction.input, gas: '0xf4240'
      })
      assert.equal((await request('eth_getTransactionReceipt', replay)).status, '0x0')
      assert.deepEqual(await request('eth_getHHLogsForTx', replay), [])
      assert.equal((await request('debug_traceTransaction', replay)).failed, true)
    } finally { provider?.destroy(); engine.free() }
  })
}
