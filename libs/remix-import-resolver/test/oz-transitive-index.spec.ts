/// <reference types="mocha" />
import { expect } from 'chai'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { DependencyResolver, NodeIOAdapter } from '../src'

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true } catch { return false }
}

// Scenario: entry imports OZ ERC20 (unversioned -> resolves to a concrete version),
// Context@5.0.2 explicitly, and Ownable@5.4.0 explicitly.
// We expect:
// - Index has three mappings under the entry file (one for each import as written)
// - Index also has entries for ERC20.sol and Ownable.sol as source keys, with their relative imports
//   mapped to concrete versioned/local .deps paths.

describe('Resolution index includes transitive mappings for external package files', function () {
  this.timeout(120000)

  let cwd: string
  let originalCwd: string

  beforeEach(() => {
    originalCwd = process.cwd()
    cwd = mkdtempSync(join(tmpdir(), 'resolver-oz-index-'))
    process.chdir(cwd)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    try { rmSync(cwd, { recursive: true, force: true }) } catch {}
  })

  it('records entry mappings and transitive mappings for OZ ERC20 and Ownable', async () => {
    const entry = 'Entry.sol'
    writeFileSync(entry, [
      '// SPDX-License-Identifier: MIT',
      'pragma solidity ^0.8.20;',
      'import "@openzeppelin/contracts/token/ERC20/ERC20.sol" as OZ;',
      'import "@openzeppelin/contracts@5.0.2/utils/Context.sol" as ContextV5;',
      'import "@openzeppelin/contracts@5.4.0/access/Ownable.sol" as Auth;',
      'contract A is OZ.ERC20, Auth { constructor() OZ.ERC20("A","A") {} }',
      ''
    ].join('\n'))

    const io = new NodeIOAdapter()
    const dep = new DependencyResolver(io, entry, true)
    const bundle = await dep.buildDependencyTree(entry)
    await dep.saveResolutionIndex()

    // Entry should have at least itself + resolved deps
    expect(bundle.size).to.be.greaterThan(3)

    // Read index
    const idxRaw = await (await import('fs/promises')).readFile('.deps/npm/.resolution-index.json', 'utf8')
    const idx = JSON.parse(idxRaw)

    // 1) Entry mappings
    const entryMap = idx[entry]
    expect(entryMap, 'entry map missing').to.be.ok
    // Note: paths may or may not have .deps/npm/ prefix depending on context (Node vs Plugin)
    expect(entryMap['@openzeppelin/contracts/token/ERC20/ERC20.sol']).to.match(/(\.deps\/(npm\/)?)?@openzeppelin\/contracts@.+\/token\/ERC20\/ERC20\.sol$/)
    expect(entryMap['@openzeppelin/contracts@5.0.2/utils/Context.sol']).to.match(/(\.deps\/(npm\/)?)?@openzeppelin\/contracts@5\.0\.2\/utils\/Context\.sol$/)
    expect(entryMap['@openzeppelin/contracts@5.4.0/access/Ownable.sol']).to.match(/(\.deps\/(npm\/)?)?@openzeppelin\/contracts@5\.4\.0\/access\/Ownable\.sol$/)

    // Resolve actual mapped ERC20 path (e.g., .deps/npm/@openzeppelin/contracts@5.4.0/token/ERC20/ERC20.sol)
    const erc20Local = entryMap['@openzeppelin/contracts/token/ERC20/ERC20.sol']
    // The mapped value might be a canonical path (without .deps/npm/) or a file path (with .deps/npm/)
    const erc20FilePath = erc20Local.startsWith('.deps/') ? erc20Local : `.deps/npm/${erc20Local}`
    expect(await exists(erc20FilePath)).to.equal(true)

    // 2) ERC20.sol source key should have relative imports recorded
    // The canonical source key is the versioned path without .deps/npm/ prefix
    const erc20SourceKey = erc20Local.replace(/^\.deps\/npm\//, '')
    // Our index writing stores keys differently between Node and Plugin; try both
    const erc20KeyCandidates = [erc20SourceKey, erc20FilePath]
    const erc20Map = erc20KeyCandidates.map(k => idx[k]).find(Boolean)
    expect(erc20Map, 'ERC20.sol map missing').to.be.ok
    // Mapped values may or may not have .deps/npm/ prefix depending on context
    expect(erc20Map['./IERC20.sol']).to.match(/(\.deps\/(npm\/)?)?@openzeppelin\/contracts@.+\/token\/ERC20\/IERC20\.sol$/)
    expect(erc20Map['./extensions/IERC20Metadata.sol']).to.match(/(\.deps\/(npm\/)?)?@openzeppelin\/contracts@.+\/token\/ERC20\/extensions\/IERC20Metadata\.sol$/)
    expect(erc20Map['../../utils/Context.sol']).to.match(/(\.deps\/(npm\/)?)?@openzeppelin\/contracts@.+\/utils\/Context\.sol$/)

    // 3) Ownable.sol source key should have relative Context import recorded
    const ownableLocal = entryMap['@openzeppelin/contracts@5.4.0/access/Ownable.sol']
    const ownableKeyCandidates = [ownableLocal.replace(/^\.deps\/npm\//, ''), ownableLocal]
    const ownableMap = ownableKeyCandidates.map(k => idx[k]).find(Boolean)
    expect(ownableMap, 'Ownable.sol map missing').to.be.ok
    expect(ownableMap['../utils/Context.sol']).to.match(/(\.deps\/(npm\/)?)?@openzeppelin\/contracts@5\.4\.0\/utils\/Context\.sol$/)
  })
})
