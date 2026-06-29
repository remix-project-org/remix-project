import { expect } from 'chai'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { spawnSync } from 'child_process'
import { NodeIOAdapter, SourceFlattener } from '../src'

// End-to-end compile test using native solc (if available in PATH)
// - Flattens an unversioned upgradeable import (ERC1155Upgradeable)
// - Pipes the flattened solidity to native solc via stdin
// - Asserts solc exits successfully
// The test is skipped if:
// - `solc` is not found in PATH, or
// - `solc` version is < 0.8.20 (pragma in test requires >=0.8.20)

describe('SourceFlattener - native solc integration (E2E)', function () {
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
    cwd = mkdtempSync(join(tmpdir(), 'resolver-native-solc-'))
  })
  afterEach(() => {
    try { rmSync(cwd, { recursive: true, force: true }) } catch {}
  })

  it('flattens ERC1155Upgradeable and compiles with native solc', async function () {
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

    const entry = join(cwd, 'Test.sol')
    writeFileSync(entry, [
      '// SPDX-License-Identifier: MIT',
      'pragma solidity ^0.8.20;',
      "import '@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol';",
      'contract T is ERC1155Upgradeable {',
      '  constructor() { __ERC1155_init("") ; }',
      '}',
      ''
    ].join('\n'))

    const io = new NodeIOAdapter()
    const flattener = new SourceFlattener(io, false)
    const res = await flattener.flatten(entry)

    // Sanity: must contain the upgradeable section markers we expect
    expect(res.flattened).to.match(/abstract\s+contract\s+ContextUpgradeable/)
    expect(res.flattened).to.match(/abstract\s+contract\s+ERC165Upgradeable/)

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
  })
})
