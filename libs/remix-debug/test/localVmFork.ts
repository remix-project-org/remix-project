import tape from 'tape'
import { BrowserProvider } from 'ethers'
import { Provider } from '@remix-project/remix-simulator'
import { Ethdebugger } from '../src/Ethdebugger'
import { extendProvider } from '../src/init'

tape('Local Ethereum traces select the configured fork instead of the development chain fallback', async t => {
  for (const fork of ['paris', 'shanghai', 'cancun', 'osaka']) {
    const local = new Provider({ fork })
    const web3 = new BrowserProvider(local)
    extendProvider(web3)
    let id = 0
    const rpc = (method: string, params: any[] = []) => local.request({ id: ++id, jsonrpc: '2.0', method, params })
    try {
      await local.init()
      await local.Accounts.resetAccounts()
      const [from] = await rpc('eth_accounts')
      // Deploy PUSH0; STOP using initcode that is also valid before Shanghai.
      const deployment = await rpc('eth_sendTransaction', [{ from, gas: '0xf4240', data: '0x6002600c60003960026000f35f00' }])
      const { contractAddress } = await rpc('eth_getTransactionReceipt', [deployment])
      const hash = await rpc('eth_sendTransaction', [{ from, to: contractAddress, gas: '0xf4240', data: '0x' }])
      const trace = await rpc('debug_traceTransaction', [hash])
      t.equal(trace.fork, fork, `${fork}: trace records the execution fork`)
      const debug = new Ethdebugger({
        web3,
        compilationResult: async () => null,
        offsetToLineColumnConverter: { offsetToLineColumn: async () => null }
      })
      await debug.debug((await web3.getTransaction(hash)).toJSON())
      t.equal(debug.traceManager.getCurrentFork(), fork, `${fork}: debugger honors the local VM fork`)
      const code = await debug.codeManager.getCode(contractAddress)
      const opcode = fork === 'paris' ? 'INVALID' : 'PUSH0'
      t.ok(code.instructions[0].includes(opcode), `${fork}: disassembly agrees with opcode availability`)
    } catch (error) {
      t.fail(error.stack || String(error))
    } finally {
      web3.destroy()
    }
  }
  t.end()
})
