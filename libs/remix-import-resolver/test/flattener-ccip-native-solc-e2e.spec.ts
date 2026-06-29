import { expect } from 'chai'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { spawnSync } from 'child_process'
import { NodeIOAdapter, SourceFlattener } from '../src'

// End-to-end compile test using native solc (if available in PATH)
// - Uses the exact Chainlink CCIP base contract content the user provided
// - Flattens via our resolver (ensuring .deps layout and parent package context)
// - Pipes the flattened solidity to native solc via stdin
// The test is skipped if:
// - `solc` is not found in PATH, or
// - `solc` version is < 0.8.20 (pragma in test requires >=0.8.20)

describe('SourceFlattener - Chainlink CCIP base contract (native solc E2E)', function () {
  this.timeout(60000)

  const minVersion = [0, 8, 20]

  function parseVersion(output: string): number[] | null {
    // Examples:
    //   solc, the solidity compiler version 0.8.26+commit.4fc1097e.Linux.g++
    //   Version: 0.8.30+commit.73712a01.Darwin.appleclang
    const m = output.match(/\b(\d+)\.(\d+)\.(\d+)\b/)
    if (!m) return null
    return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)]
  }

  function gte(a: number[], b: number[]): boolean {
    for (let i = 0; i < 3; i++) {
      if ((a[i] || 0) > (b[i] || 0)) return true
      if ((a[i] || 0) < (b[i] || 0)) return false
    }
    return true
  }

  let cwd: string
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'resolver-native-solc-ccip-'))
  })
  afterEach(() => {
    try { rmSync(cwd, { recursive: true, force: true }) } catch {}
  })

  it('flattens the exact Chainlink CCIP base contract and compiles with native solc', async function () {
    // Detect native solc
    const ver = spawnSync('solc', ['--version'], { encoding: 'utf8' })
    if (ver.error || ver.status !== 0) {
      this.skip()
      return
    }
    const v = parseVersion((ver.stdout || '') + (ver.stderr || ''))
    if (!v || !gte(v, minVersion)) {
      this.skip()
      return
    }

    const entry = join(cwd, 'Chain.sol')
    writeFileSync(entry, [
      '// SPDX-License-Identifier: MIT',
      'pragma solidity ^0.8.20;',
      '',
      'import "@chainlink/contracts-ccip@1.6.1/contracts/applications/CCIPReceiver.sol";',
      'import "@chainlink/contracts-ccip@1.6.1/contracts/libraries/Client.sol";',
      '',
      'contract ChainlinkCCIP is CCIPReceiver {',
      '    constructor(address router) CCIPReceiver(router) {}',
      '    ',
      '    function _ccipReceive(Client.Any2EVMMessage memory _message) internal override {}',
      '}',
      ''
    ].join('\n'))

    const io = new NodeIOAdapter()
    const flattener = new SourceFlattener(io, false)
    const res = await flattener.flatten(entry)

    // Sanity checks: the flattened output should include CCIPReceiver and Client
    expect(res.flattened).to.match(/abstract\s+contract\s+CCIPReceiver/)
    expect(res.flattened).to.match(/library\s+Client/)

    // Compile using native solc from stdin
    const proc = spawnSync('solc', ['--bin', '-'], { input: res.flattened, encoding: 'utf8' })

    if (proc.error) {
      throw proc.error
    }

    const code = proc.status ?? 1
    if (code !== 0) {
      // Emit trimmed diagnostics to help debug locally
      const out = (proc.stdout || '').slice(0, 2000)
      const err = (proc.stderr || '').slice(0, 2000)
      throw new Error(`native solc failed (exit ${code})\nSTDOUT:\n${out}\nSTDERR:\n${err}`)
    }

    // If it compiled, we're good
    expect(code).to.equal(0)

    // Additional check: flatten CCIPReceiver directly and assert @chainlink/contracts resolves to 1.4.0 (not 1.5.0)
    const ccipEntryCanonical = '@chainlink/contracts-ccip@1.6.1/contracts/applications/CCIPReceiver.sol'
    const resCcip = await flattener.flatten(ccipEntryCanonical)
    console.log('Resolved sources for CCIPReceiver flattening:', resCcip)
    const keys = Array.from(resCcip.sources.keys())
    const hasContracts14 = keys.some(k => k.startsWith('@chainlink/contracts/src/v0.8/vendor/openzeppelin-solidity/v5.0.2/'))
    expect(hasContracts14, 'Expected @chainlink/contracts to resolve to 1.4.0 when flattening CCIPReceiver').to.equal(true)
  })
})
