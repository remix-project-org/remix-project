import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { BrowserProvider, concat, getAddress, getBytes, hexlify, Signature, toBeHex, TypedDataEncoder, verifyMessage, verifyTypedData, Wallet } from 'ethers'
import { Engine, initSync } from 'monad-evm2js'
import { MonadProvider } from '../../libs/remix-monad/src/provider'

initSync({ module: readFileSync('node_modules/monad-evm2js/dist/monad_evm2js_bg.wasm') })

const domain = { name: 'Monad signing', version: '1', chainId: 143, verifyingContract: '0x1111111111111111111111111111111111111111' }
const types = {
  Person: [{ name: 'name', type: 'string' }, { name: 'wallet', type: 'address' }],
  Mail: [{ name: 'from', type: 'Person' }, { name: 'to', type: 'Person[]' }, { name: 'amounts', type: 'uint256[]' }, { name: 'contents', type: 'bytes' }]
}
const message = {
  from: { name: 'Sender', wallet: '0x1111111111111111111111111111111111111111' },
  to: [{ name: 'Recipient \u2605', wallet: '0x2222222222222222222222222222222222222222' }],
  amounts: ['0', ((1n << 256n) - 1n).toString()], contents: '0x00010200'
}
const payload = () => TypedDataEncoder.getPayload(domain, types, message)

for (const fork of ['monad-eight', 'monad-nine', 'monad-ten', 'monad-next'] as const) {
  test(`${fork}: EIP-712 accepts Remix objects, ethers JSON and the v4 alias without changing state`, async () => {
    const engine = new Engine(fork, 143)
    const local = new MonadProvider({ fork }, engine)
    await local.init()
    const request = (method: string, ...params: any[]) => local.request({ method, params })
    const provider = new BrowserProvider(local)
    try {
      const [address] = await request('eth_accounts')
      const wallet = new Wallet(hexlify(await request('eth_getPKey', address)))
      const expected = await wallet.signTypedData(domain, types, message)
      const data = payload()
      const before = await request('eth_getStateDb')
      for (const method of ['eth_signTypedData_v4', 'eth_signTypedData']) {
        for (const input of [data, JSON.stringify(data)]) {
          assert.equal(await request(method, address.toLowerCase(), input), expected)
        }
      }
      assert.equal(await (await provider.getSigner(address)).signTypedData(domain, types, message), expected)
      assert.equal(verifyTypedData(domain, types, message, expected), address)
      assert.deepEqual(data, payload(), 'signing does not mutate the request')
      assert.deepEqual(await request('eth_getStateDb'), before, 'signing does not execute a transaction or record a call')

      // Recover the independently encoded digest through the actual WASM precompile.
      const signature = Signature.from(expected)
      const result = await request('eth_call', {
        from: address, to: '0x0000000000000000000000000000000000000001', gas: '0x186a0',
        data: concat([TypedDataEncoder.hash(domain, types, message), toBeHex(signature.v, 32), signature.r, signature.s])
      })
      assert.equal(getAddress('0x' + result.slice(-40)), address)
    } finally { provider.destroy(); engine.free() }
  })

  test(`${fork}: typed signatures bind nested arrays, exact integers and domain values`, async () => {
    const engine = new Engine(fork, 143)
    const local = new MonadProvider({ fork }, engine)
    await local.init()
    const request = (method: string, ...params: any[]) => local.request({ method, params })
    try {
      const [address] = await request('eth_accounts')
      const original = await request('eth_signTypedData_v4', address, payload())
      for (const [nextDomain, nextMessage] of [
        [{ ...domain, chainId: 1 }, message],
        [{ ...domain, verifyingContract: '0x3333333333333333333333333333333333333333' }, message],
        [domain, { ...message, to: [], amounts: [], contents: '0x' }],
        [domain, { ...message, amounts: ['9007199254740993']}]
      ] as const) {
        const signed = await request('eth_signTypedData_v4', address, TypedDataEncoder.getPayload(nextDomain, types, nextMessage))
        assert.notEqual(signed, original)
        assert.equal(verifyTypedData(nextDomain, types, nextMessage, signed), address)
        assert.notEqual(verifyTypedData(domain, types, message, signed), address)
      }
    } finally { engine.free() }
  })

  test(`${fork}: invalid typed data returns RPC errors and leaves the provider usable`, async () => {
    const engine = new Engine(fork, 143)
    const local = new MonadProvider({ fork }, engine)
    await local.init()
    const request = (method: string, ...params: any[]) => local.request({ method, params })
    try {
      const [address] = await request('eth_accounts')
      const before = await request('eth_getStateDb')
      const invalid: any[] = [undefined, null, [], 42, '{}', '{', 'null', '[]']
      for (const field of ['types', 'domain', 'message', 'primaryType']) {
        for (const value of [undefined, null, 42, []]) invalid.push({ ...payload(), [field]: value })
      }
      invalid.push({ ...payload(), types: {} }, { ...payload(), primaryType: 'Missing' },
        { ...payload(), message: { ...message, amounts: ['-1']} },
        { ...payload(), message: { ...message, amounts: [(1n << 256n).toString()]} })
      for (const data of invalid) {
        await assert.rejects(request('eth_signTypedData_v4', address, data), { code: -32602 }, JSON.stringify(data))
      }
      for (const account of ['not an address', '0x4444444444444444444444444444444444444444']) {
        await assert.rejects(request('eth_signTypedData', account, payload()), { code: -32602 })
      }
      for (const params of [[], [address], [payload(), address], [address, payload(), 'extra']]) {
        await assert.rejects(request('eth_signTypedData_v4', ...params), { code: -32602 })
      }
      assert.deepEqual(await request('eth_getStateDb'), before)
      assert.equal(verifyTypedData(domain, types, message, await request('eth_signTypedData_v4', address, payload())), address)
    } finally { engine.free() }
  })

  test(`${fork}: message bytes and imported signing accounts survive save and restore`, async () => {
    const engine = new Engine(fork, 143)
    const restoredEngine = new Engine(fork, 143)
    const local = new MonadProvider({ fork }, engine)
    await local.init()
    try {
      const address = local.Accounts._addAccount('0x' + '12'.repeat(32))
      const restored = new MonadProvider({ fork, stateDb: await local.request({ method: 'eth_getStateDb' }) }, restoredEngine)
      await restored.init()
      const signatures: string[] = []
      for (const provider of [local, restored]) {
        const before = await provider.request({ method: 'eth_getStateDb' })
        for (const bytes of ['0x', '0x00', '0x00010200', '0xffff']) {
          const personal = await provider.request({ method: 'personal_sign', params: [bytes, address]})
          const legacy = await provider.request({ method: 'eth_sign', params: [address, bytes]})
          assert.equal(personal, legacy)
          assert.equal(verifyMessage(getBytes(bytes), personal), address)
        }
        signatures.push(await provider.request({ method: 'eth_signTypedData_v4', params: [address, payload()]}))
        assert.equal(verifyTypedData(domain, types, message, signatures.at(-1)), address)
        assert.deepEqual(await provider.request({ method: 'eth_getStateDb' }), before)
      }
      assert.equal(signatures[0], signatures[1])
    } finally { engine.free(); restoredEngine.free() }
  })
}
