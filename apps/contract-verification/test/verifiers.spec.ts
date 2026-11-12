/// <reference types="mocha" />
import { expect } from 'chai'
import { BlockscoutVerifier, EtherscanVerifier, RoutescanVerifier, SourcifyVerifier } from '../src/app/Verifiers'
import { toVerifyInput } from '../src/app/Verifiers/explorerVerify'
import type { SubmittedContract } from '../src/app/types'

// The verifiers send every request through explorer-verify, which uses globalThis.fetch.
// These tests replace it with a function that answers from a list of recorded explorer answers.

const ADDRESS = '0x8275D36F64F047D2D8a1F42c79Bf80Caea39D7cC'
const PROXY = '0xed5b8413e605598ef86cd7617f12701f74ca255c'
const CHAIN_ID = '11155111'
const API_KEY = 'TESTKEY0123456789ABCDEFGHIJKLMNOP'
const JOB_ID = 'ae2fbfae-1d81-4284-9a2d-3dfd8cdb1718'
const GUID = 'yatwfd5yijmxufgkexd8ygesyexubjazunjnbgkemvwbm7vhrw'
const CREATION = '6080604052348015600e575f5ffd5b50603e80601a5f395ff3fe60806040525f5ffdfea164736f6c634300081a000a'

interface Call {
  method: string
  url: URL
  body: string
}

interface Route {
  match: (call: Call) => boolean
  status?: number
  body: unknown
}

let calls: Call[] = []
let routes: Route[] = []
const realFetch = globalThis.fetch

function answer(match: Route['match'], body: unknown, status = 200): void {
  routes.push({ match, body, status })
}

function param(call: Call, name: string): string | null {
  return call.url.searchParams.get(name) ?? new URLSearchParams(call.body).get(name)
}

function action(name: string) {
  return (call: Call) => param(call, 'action') === name
}

beforeEach(() => {
  calls = []
  routes = []
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const body = typeof init?.body === 'string' ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : ''
    const call = { method: init?.method ?? 'GET', url, body }
    calls.push(call)
    const index = routes.findIndex((route) => route.match(call))
    if (index === -1) {
      return new Response(JSON.stringify({ message: 'no recorded answer' }), { status: 500, headers: { 'content-type': 'application/json' } })
    }
    const [route] = routes.splice(index, 1)
    return new Response(JSON.stringify(route.body), { status: route.status, headers: { 'content-type': 'application/json' } })
  }
})

afterEach(() => {
  globalThis.fetch = realFetch
})

function compilerAbstract(input: unknown = standardJsonInput()): any {
  return {
    input,
    data: {
      contracts: {
        'contracts/Storage.sol': {
          Storage: {
            metadata: JSON.stringify({ compiler: { version: '0.8.26+commit.8a97fa7a' } }),
            evm: { bytecode: { object: CREATION } },
          },
        },
      },
    },
  }
}

function standardJsonInput() {
  return {
    language: 'Solidity',
    sources: { 'contracts/Storage.sol': { content: 'contract Storage {}' } },
    settings: { optimizer: { enabled: false, runs: 200 }, outputSelection: { '*': { '*': ['*']} } },
  }
}

function submittedContract(overrides: Partial<SubmittedContract> = {}): SubmittedContract {
  return {
    id: 'test',
    filePath: 'contracts/Storage.sol',
    contractName: 'Storage',
    chainId: CHAIN_ID,
    address: ADDRESS,
    date: new Date(0).toUTCString(),
    receipts: [],
    ...overrides,
  }
}

describe('toVerifyInput', () => {
  it('builds explorer-verify input from a Remix compilation result', () => {
    const input = toVerifyInput(submittedContract({ abiEncodedConstructorArgs: '00'.repeat(32) }), compilerAbstract())
    expect(input.chainId).to.equal(11155111)
    expect(input.address).to.equal(ADDRESS)
    expect(input.contractName).to.equal('contracts/Storage.sol:Storage')
    expect(input.compiler).to.deep.equal({ kind: 'solc', version: '0.8.26+commit.8a97fa7a', input: standardJsonInput() })
    expect(input.constructorArgs).to.equal('0x' + '00'.repeat(32))
    expect(input.creationBytecode).to.equal('0x' + CREATION)
  })

  it('reads a compiler input stored as a string', () => {
    const input = toVerifyInput(submittedContract(), compilerAbstract(JSON.stringify(standardJsonInput())))
    expect(input.compiler.input).to.deep.equal(standardJsonInput())
    expect(input.constructorArgs).to.equal(undefined)
  })

  it('keeps a 0x prefix on constructor arguments', () => {
    const input = toVerifyInput(submittedContract({ abiEncodedConstructorArgs: '0x' + '01'.repeat(32) }), compilerAbstract())
    expect(input.constructorArgs).to.equal('0x' + '01'.repeat(32))
  })
})

describe('SourcifyVerifier', () => {
  const verifier = () => new SourcifyVerifier('https://sourcify.dev/server', 'https://repo.sourcify.dev', 'https://verify.sourcify.dev/jobs')
  const lookup = (call: Call) => call.method === 'GET' && call.url.pathname.startsWith('/server/v2/contract/')
  const submitCall = (call: Call) => call.method === 'POST' && call.url.pathname === `/server/v2/verify/${CHAIN_ID}/${ADDRESS.toLowerCase()}`
  const job = (call: Call) => call.method === 'GET' && call.url.pathname === `/server/v2/verify/${JOB_ID}`
  const notVerified = { match: null, creationMatch: null, runtimeMatch: null, chainId: CHAIN_ID, address: ADDRESS }
  const exactMatch = { isJobCompleted: true, verificationId: JOB_ID, contract: { match: 'exact_match', creationMatch: 'exact_match', runtimeMatch: 'exact_match', chainId: CHAIN_ID, address: ADDRESS } }
  const pendingJob = { isJobCompleted: false, verificationId: JOB_ID, contract: notVerified }

  it('submits, polls and returns an exact match with the receipt links', async () => {
    answer(lookup, notVerified, 404)
    answer(submitCall, { verificationId: JOB_ID }, 202)
    answer(job, exactMatch)

    const response = await verifier().verify(submittedContract(), compilerAbstract())

    expect(response.status).to.equal('exactly verified')
    expect(response.receiptId).to.equal(`ev1:sourcify:${CHAIN_ID}:${ADDRESS.toLowerCase()}:${JOB_ID}`)
    expect(response.receiptLookupUrl).to.equal(`https://verify.sourcify.dev/jobs/${JOB_ID}`)
    expect(response.lookupUrl).to.equal(`https://repo.sourcify.dev/${CHAIN_ID}/${ADDRESS}/`)
    const sent = JSON.parse(calls.find(submitCall).body)
    expect(sent.compilerVersion).to.equal('0.8.26+commit.8a97fa7a')
    expect(sent.contractIdentifier).to.equal('contracts/Storage.sol:Storage')
    expect(sent.stdJsonInput).to.deep.equal(standardJsonInput())
  })

  it('returns already verified without a submit when Sourcify holds the contract', async () => {
    answer(lookup, { ...notVerified, match: 'exact_match', creationMatch: 'exact_match', runtimeMatch: 'exact_match' })

    const response = await verifier().verify(submittedContract(), compilerAbstract())

    expect(response.status).to.equal('already verified')
    expect(response.receiptId).to.equal(null)
    expect(calls.some(submitCall)).to.equal(false)
  })

  it('reports a partial match held by Sourcify as partially verified, without a submit', async () => {
    answer(lookup, { ...notVerified, match: 'match', creationMatch: 'match', runtimeMatch: 'match' })

    const response = await verifier().verify(submittedContract(), compilerAbstract())

    expect(response.status).to.equal('partially verified')
    expect(response.message).to.contain('partial match')
    expect(calls.some(submitCall)).to.equal(false)
  })

  it('submits over a match made from another contract, and names that contract when Sourcify refuses', async () => {
    // Recorded on Sepolia: another project's source stored for a new contract within two minutes.
    const foreign = { compilerVersion: '0.8.33+commit.64118f21', name: 'SimpleStorage', fullyQualifiedName: 'simplestorage2.sol:SimpleStorage' }
    answer(lookup, { ...notVerified, match: 'match', creationMatch: 'match', runtimeMatch: 'match', compilation: foreign })
    answer(submitCall, { customCode: 'already_verified', message: 'The contract is already verified.', errorId: 'e' }, 409)

    const response = await verifier().verify(submittedContract(), compilerAbstract())

    expect(calls.filter(submitCall)).to.have.length(1)
    expect(response.status).to.equal('partially verified')
    expect(response.receiptId).to.equal(null)
    expect(response.message).to.contain("another contract's source (simplestorage2.sol:SimpleStorage, 0.8.33+commit.64118f21)")
    expect(response.message).to.contain('refused this source')
  })

  it('keeps a partial match of this source as partially verified, without a submit', async () => {
    const own = { compilerVersion: '0.8.26+commit.8a97fa7a', name: 'Storage', fullyQualifiedName: 'contracts/Storage.sol:Storage' }
    answer(lookup, { ...notVerified, match: 'match', creationMatch: 'match', runtimeMatch: 'match', compilation: own })

    const response = await verifier().verify(submittedContract(), compilerAbstract())

    expect(response.status).to.equal('partially verified')
    expect(response.message).to.contain('not submitted again')
    expect(calls.some(submitCall)).to.equal(false)
  })

  it('returns failed with the explorer reason when the bytecode does not match', async () => {
    answer(lookup, notVerified, 404)
    answer(submitCall, { verificationId: JOB_ID }, 202)
    answer(job, {
      isJobCompleted: true,
      verificationId: JOB_ID,
      contract: notVerified,
      error: { customCode: 'no_match', message: "The deployed and recompiled bytecode don't match.", errorId: 'e' },
    })

    const response = await verifier().verify(submittedContract(), compilerAbstract())

    expect(response.status).to.equal('failed')
    expect(response.message).to.contain("don't match")
  })

  it('returns pending with a handle when the job outlasts the submit budget, then polls it', async function () {
    this.timeout(20000)
    answer(lookup, notVerified, 404)
    answer(submitCall, { verificationId: JOB_ID }, 202)
    for (let i = 0; i < 10; i++) answer(job, pendingJob)

    const pending = await verifier().verify(submittedContract(), compilerAbstract())
    expect(pending.status).to.equal('pending')
    expect(pending.receiptId).to.equal(`ev1:sourcify:${CHAIN_ID}:${ADDRESS.toLowerCase()}:${JOB_ID}`)

    routes = []
    answer(job, exactMatch)
    const done = await verifier().checkVerificationStatus(pending.receiptId, CHAIN_ID)
    expect(done.status).to.equal('exactly verified')
    expect(calls.filter(submitCall)).to.have.length(1)
  })

  it('reports a receipt from an earlier plugin version as failed without a request', async () => {
    const response = await verifier().checkVerificationStatus(JOB_ID, CHAIN_ID)
    expect(response.status).to.equal('failed')
    expect(calls).to.have.length(0)
  })

  it('sends to a custom Sourcify server from the settings', async () => {
    const custom = new SourcifyVerifier('https://sourcify.example.org/server', 'https://repo.example.org', 'https://jobs.example.org')
    answer(lookup, { ...notVerified, match: 'exact_match', creationMatch: 'exact_match', runtimeMatch: 'exact_match' })
    const response = await custom.verify(submittedContract(), compilerAbstract())
    expect(response.status).to.equal('already verified')
    expect(calls[0].url.host).to.equal('sourcify.example.org')
  })

  it('throws a message with the explorer-verify hint for an unusable input', async () => {
    let message = ''
    try {
      await verifier().verify(submittedContract({ address: '0x1234' }), compilerAbstract())
    } catch (error) {
      message = error.message
    }
    expect(message).to.contain('address')
    expect(calls).to.have.length(0)
  })
})

describe('EtherscanVerifier', () => {
  const verifier = (apiKey = API_KEY) => new EtherscanVerifier('https://api.etherscan.io/v2', 'https://sepolia.etherscan.io', apiKey)

  it('submits the Standard JSON input with the key and constructor arguments, then polls', async () => {
    answer(action('getsourcecode'), { status: '1', message: 'OK', result: [{ SourceCode: '', ABI: 'Contract source code not verified' }]})
    answer(action('verifysourcecode'), { status: '1', message: 'OK', result: GUID })
    answer(action('checkverifystatus'), { status: '1', message: 'OK', result: 'Pass - Verified' })

    const response = await verifier().verify(submittedContract({ abiEncodedConstructorArgs: '00'.repeat(32) }), compilerAbstract())

    expect(response.status).to.equal('verified')
    expect(response.lookupUrl).to.equal(`https://sepolia.etherscan.io/address/${ADDRESS}#code`)
    const submitCall = calls.find(action('verifysourcecode'))
    expect(submitCall.url.origin + submitCall.url.pathname).to.equal('https://api.etherscan.io/v2/api')
    expect(param(submitCall, 'chainid')).to.equal(CHAIN_ID)
    expect(param(submitCall, 'apikey')).to.equal(API_KEY)
    expect(param(submitCall, 'codeformat')).to.equal('solidity-standard-json-input')
    expect(param(submitCall, 'contractname')).to.equal('contracts/Storage.sol:Storage')
    expect(param(submitCall, 'compilerversion')).to.equal('v0.8.26+commit.8a97fa7a')
    expect(param(submitCall, 'constructorArguements')).to.equal('00'.repeat(32))
    expect(JSON.parse(param(submitCall, 'sourceCode'))).to.deep.equal(standardJsonInput())
  })

  it('returns failed with the reason when Etherscan rejects the source', async () => {
    answer(action('getsourcecode'), { status: '1', message: 'OK', result: [{ SourceCode: '', ABI: 'Contract source code not verified' }]})
    answer(action('verifysourcecode'), { status: '1', message: 'OK', result: GUID })
    answer(action('checkverifystatus'), { status: '0', message: 'NOTOK', result: 'Fail - Unable to verify. Compiled contract deployment bytecode does NOT match the transaction deployment bytecode.' })
    // explorer-verify confirms an Etherscan failure with one lookup before it reports it.
    answer(action('getsourcecode'), { status: '1', message: 'OK', result: [{ SourceCode: '', ABI: 'Contract source code not verified' }]})

    const response = await verifier().verify(submittedContract({ abiEncodedConstructorArgs: '0x' }), compilerAbstract())

    expect(response.status).to.equal('failed')
    expect(response.message).to.contain('does NOT match')
  })

  it('names the stored contract when Etherscan refuses the source as already verified', async () => {
    const other = { status: '1', message: 'OK', result: [{ SourceCode: 'contract SimpleStorage {}', ContractName: 'SimpleStorage', CompilerVersion: 'v0.8.33+commit.64118f21' }]}
    answer(action('getsourcecode'), other)
    answer(action('verifysourcecode'), { status: '0', message: 'NOTOK', result: 'Contract source code already verified' })
    answer(action('getsourcecode'), other)

    const response = await verifier().verify(submittedContract({ abiEncodedConstructorArgs: '0x' }), compilerAbstract())

    expect(calls.filter(action('verifysourcecode'))).to.have.length(1)
    expect(response.status).to.equal('partially verified')
    expect(response.message).to.contain("another contract's source (SimpleStorage, v0.8.33+commit.64118f21)")
  })

  it('returns already verified without a submit when Etherscan holds this source', async () => {
    answer(action('getsourcecode'), { status: '1', message: 'OK', result: [{ SourceCode: 'contract Storage {}', ContractName: 'Storage', CompilerVersion: 'v0.8.26+commit.8a97fa7a' }]})

    const response = await verifier().verify(submittedContract({ abiEncodedConstructorArgs: '0x' }), compilerAbstract())

    expect(response.status).to.equal('already verified')
    expect(response.message).to.equal(undefined)
    expect(calls.some(action('verifysourcecode'))).to.equal(false)
  })

  it('throws a message for end users when Etherscan has not indexed the contract yet', async function () {
    this.timeout(20000)
    const notIndexed = { status: '0', message: 'NOTOK', result: `Unable to locate ContractCode at ${ADDRESS.toLowerCase()}` }
    answer(action('getsourcecode'), { status: '1', message: 'OK', result: [{ SourceCode: '', ABI: 'Contract source code not verified' }]})
    for (let i = 0; i < 10; i++) answer(action('verifysourcecode'), notIndexed)

    let message = ''
    try {
      await verifier().verify(submittedContract({ abiEncodedConstructorArgs: '0x' }), compilerAbstract())
    } catch (error) {
      message = error.message
    }
    expect(message).to.contain('try again in a minute')
    // The end-user hint names no SDK option, field or function.
    expect(message).to.not.match(/indexWaitMs|details\.|verify\(\)|checkStatus/)
    expect(message).to.not.contain(API_KEY)
  })

  it('never puts the key in an error message', async () => {
    answer(action('getsourcecode'), { status: '0', message: 'NOTOK', result: `Invalid API Key (#err2)|${API_KEY}` })

    let message = ''
    try {
      await verifier().verify(submittedContract({ abiEncodedConstructorArgs: '0x' }), compilerAbstract())
    } catch (error) {
      message = error.message
    }
    expect(message).to.not.equal('')
    expect(message).to.not.contain(API_KEY)
  })

  it('links a proxy to its implementation', async () => {
    answer(action('verifyproxycontract'), { status: '1', message: 'OK', result: GUID })
    answer(action('checkproxyverification'), {
      status: '1',
      message: 'OK',
      result: `The proxy's (${PROXY}) implementation contract is found at ${ADDRESS.toLowerCase()} and is successfully updated.`,
    })

    const response = await verifier().verifyProxy(submittedContract({ proxyAddress: PROXY }))

    expect(response.status).to.equal('verified')
    const linkCall = calls.find(action('verifyproxycontract'))
    expect(param(linkCall, 'address')).to.equal(PROXY)
    expect(param(linkCall, 'expectedimplementation')).to.equal(ADDRESS.toLowerCase())
  })
})

describe('BlockscoutVerifier', () => {
  it('sends to the instance API from the settings', async () => {
    const verifier = new BlockscoutVerifier('https://eth-sepolia.blockscout.com')
    answer((call) => call.url.pathname.startsWith('/api/v2/smart-contracts/'), { is_verified: true, is_fully_verified: true, verified_twin_address_hash: null })

    const response = await verifier.verify(submittedContract(), compilerAbstract())

    expect(response.status).to.equal('already verified')
    expect(response.lookupUrl).to.equal(`https://eth-sepolia.blockscout.com/address/${ADDRESS}?tab=contract`)
    expect(calls[0].url.host).to.equal('eth-sepolia.blockscout.com')
  })
})

describe('RoutescanVerifier', () => {
  it('sends to the Routescan API from the settings and keeps its explorer link', async () => {
    const apiUrl = `https://api.routescan.io/v2/network/testnet/evm/${CHAIN_ID}/etherscan`
    const verifier = new RoutescanVerifier(apiUrl, 'https://testnet.routescan.io')
    answer(action('getsourcecode'), { status: '1', message: 'OK', result: [{ SourceCode: '', ABI: 'Contract source code not verified' }]})
    answer(action('verifysourcecode'), { status: '1', message: 'OK', result: GUID })
    answer(action('checkverifystatus'), { status: '1', message: 'OK', result: 'Pass - Verified' })

    const response = await verifier.verify(submittedContract({ abiEncodedConstructorArgs: '0x' }), compilerAbstract())

    expect(response.status).to.equal('verified')
    expect(response.lookupUrl).to.equal(`https://testnet.routescan.io/address/${ADDRESS}/contract/${CHAIN_ID}/code`)
    expect(calls.every((call) => call.url.pathname === `/v2/network/testnet/evm/${CHAIN_ID}/etherscan/api`)).to.equal(true)
    expect(verifier.verifyProxy).to.equal(undefined)
  })

  it('shows a Routescan match of this source as already verified, since Routescan states no grade', async () => {
    const apiUrl = `https://api.routescan.io/v2/network/testnet/evm/${CHAIN_ID}/etherscan`
    const verifier = new RoutescanVerifier(apiUrl, 'https://testnet.routescan.io')
    answer(action('getsourcecode'), { status: '1', message: 'OK', result: [{ SourceCode: 'contract Storage {}', ContractName: 'Storage', CompilerVersion: 'v0.8.26+commit.8a97fa7a' }]})

    const response = await verifier.verify(submittedContract({ abiEncodedConstructorArgs: '0x' }), compilerAbstract())

    expect(response.status).to.equal('already verified')
    expect(calls.some(action('verifysourcecode'))).to.equal(false)
  })
})
