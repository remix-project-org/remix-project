import { expect } from 'chai'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { spawnSync } from 'child_process'
import { NodeIOAdapter, SourceFlattener } from '../src'

// This test guards against missing upgradeable utility imports (e.g., ContextUpgradeable)
// when the entry import is unversioned and the resolver maps it to a versioned path.
// We verify that the flattener's source bundle keys align with the graph keys
// and that the flattened output contains ContextUpgradeable and ERC165Upgradeable.

describe('SourceFlattener - upgradeable package resolution (Node adapter)', function() {
  this.timeout(20000)

  let tempDir: string
  let originalCwd: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), 'resolver-node-upg-'))
    process.chdir(tempDir)
  })
  afterEach(() => {
    process.chdir(originalCwd)
    try { rmSync(tempDir, { recursive: true, force: true }) } catch {}
  })

  it('includes ContextUpgradeable and ERC165Upgradeable when flattening unversioned upgradeable import', async () => {
    const entry = 'Test.sol'
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

    // Basic sanity: flattened contains the entry marker and ERC1155Upgradeable section
    // When imports are unversioned, the source keys and file comments should also be unversioned
    // (matching what the compiler expects to find when resolving the import path)
    expect(res.flattened).to.match(/\/\/ File: @openzeppelin\/contracts-upgradeable\/token\/ERC1155\/ERC1155Upgradeable\.sol/)

    // Critically, ensure ContextUpgradeable and ERC165Upgradeable appear (i.e., their code was pulled in)
    expect(res.flattened).to.match(/abstract\s+contract\s+ContextUpgradeable/) // class header
    expect(res.flattened).to.match(/abstract\s+contract\s+ERC165Upgradeable/)

    // The sources map should contain unversioned keys (matching the import spec)
    // even though the content itself comes from a versioned package
    const hasUnversionedKey = Array.from(res.sources.keys()).some(k => k === '@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol')
    expect(hasUnversionedKey, 'sources map should contain unversioned ERC1155Upgradeable key').to.equal(true)

    // Additionally, verify that key upgradeable files were saved to deterministic, normalized paths on disk.
    // The files on disk are stored under versioned paths in .deps/npm for caching,
    // but the bundle keys remain unversioned for compiler compatibility.
    const keys = Array.from(res.sources.keys())
    const mustExistPatterns = [
      /@openzeppelin\/contracts-upgradeable\/token\/ERC1155\/ERC1155Upgradeable\.sol$/, // entry dep
      /@openzeppelin\/contracts-upgradeable\/utils\/ContextUpgradeable\.sol$/, // utility
      /@openzeppelin\/contracts-upgradeable\/utils\/introspection\/ERC165Upgradeable\.sol$/, // introspection
      /@openzeppelin\/contracts\/proxy\/utils\/Initializable\.sol$/ // initializer base (in contracts, not contracts-upgradeable since v5.x)
    ]
    const filesToCheck = keys.filter(k => mustExistPatterns.some(re => re.test(k)))
    expect(filesToCheck.length, 'expected core upgradeable files present in bundle keys').to.equal(mustExistPatterns.length)
    // Check that files exist on disk under the versioned .deps/npm path (for caching)
    if (filesToCheck.length > 0) {
      // Files are cached on disk with versioned paths under .deps/npm
      const existsInDeps = await stat(`.deps/npm`).then(() => true).catch(() => false)
      expect(existsInDeps, `expected .deps/npm directory to exist for cached files`).to.equal(true)
    }

    // Compile the flattened output with native solc to verify it's valid
    const solcCheck = spawnSync('solc', ['--version'], { encoding: 'utf8' })
    if (solcCheck.error || solcCheck.status !== 0) {
      console.log('Skipping compilation test: solc not found in PATH')
      return
    }

    // Compile using native solc from stdin
    const compileProc = spawnSync('solc', ['--bin', '-'], { input: res.flattened, encoding: 'utf8' })

    if (compileProc.error) {
      throw compileProc.error
    }

    const exitCode = compileProc.status ?? 1
    if (exitCode !== 0) {
      // Emit diagnostics to help debug
      const stdout = (compileProc.stdout || '').slice(0, 2000)
      const stderr = (compileProc.stderr || '').slice(0, 2000)
      throw new Error(`Solc compilation failed (exit ${exitCode})\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`)
    }

    // If we got here, compilation succeeded!
    expect(exitCode, 'Flattened output should compile successfully').to.equal(0)
  })
})
