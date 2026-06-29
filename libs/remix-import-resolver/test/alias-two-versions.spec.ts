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

// Ensures we support importing two explicit versions of the same file using alias syntax,
// e.g.:
//   import "@openzeppelin/contracts@4.9.0/utils/Context.sol" as ContextV4;
//   import "@openzeppelin/contracts@5.0.0/utils/Context.sol" as ContextV5;
// We validate that:
// - both versioned files are materialized under .deps/npm
// - the dependency graph for the entry includes both versioned resolved keys
// - the resolution index records mappings for both original imports

describe('Alias imports of two explicit versions (ContextV4/ContextV5)', function () {
  this.timeout(120000)

  let cwd: string
  let originalCwd: string

  beforeEach(() => {
    originalCwd = process.cwd()
    cwd = mkdtempSync(join(tmpdir(), 'resolver-alias-ctx-'))
    process.chdir(cwd)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    try { rmSync(cwd, { recursive: true, force: true }) } catch {}
  })

  it('resolves both versions and records them in graph and index', async () => {
    const entry = 'AliasTwoVersions.sol'
    writeFileSync(entry, [
      '// SPDX-License-Identifier: MIT',
      'pragma solidity ^0.8.20;',
      'import "@openzeppelin/contracts@4.9.0/utils/Context.sol" as ContextV4;',
      'import "@openzeppelin/contracts@5.0.0/utils/Context.sol" as ContextV5;',
      '// Use both via alias-qualified names to avoid global namespace pollution',
      'contract A is ContextV4.Context {}',
      'contract B is ContextV5.Context {}',
      ''
    ].join('\n'))

    const io = new NodeIOAdapter()
    const dr = new DependencyResolver(io, entry, true)

    const bundle = await dr.buildDependencyTree(entry)

    // Expect both versioned Context.sol to be saved deterministically under .deps/npm
    expect(await exists('.deps/npm/@openzeppelin/contracts@4.9.0/utils/Context.sol')).to.equal(true)
    expect(await exists('.deps/npm/@openzeppelin/contracts@5.0.0/utils/Context.sol')).to.equal(true)

    // Graph should include both canonical resolved keys
    const graph = dr.getImportGraph()
    const children = Array.from(graph.get(entry) || [])
    expect(children.some(c => c.includes('@openzeppelin/contracts@4.9.0/utils/Context.sol'))).to.equal(true)
    expect(children.some(c => c.includes('@openzeppelin/contracts@5.0.0/utils/Context.sol'))).to.equal(true)

    // Save index and verify it contains both mappings with concrete .deps/npm/ paths for IDE navigation
    await dr.saveResolutionIndex()
    const idxRaw = await (await import('fs/promises')).readFile('.deps/npm/.resolution-index.json', 'utf8')
    const idx = JSON.parse(idxRaw)
    console.log('Resolution Index:', idx)
    const entryMap = idx[entry] || {}
    expect(entryMap['@openzeppelin/contracts@4.9.0/utils/Context.sol']).to.match(/^\.deps\/npm\/@openzeppelin\/contracts@4\.9\.0\/utils\/Context\.sol$/)
    expect(entryMap['@openzeppelin/contracts@5.0.0/utils/Context.sol']).to.match(/^\.deps\/npm\/@openzeppelin\/contracts@5\.0\.0\/utils\/Context\.sol$/)

    // Bundle sanity: entry + two dependencies at minimum
    expect(bundle.size).to.be.greaterThan(2)
  })

  it('updates the resolution index when a version is changed in the contract', async () => {
    const entry = 'AliasTwoVersions.sol'
    // Phase 1: initial content uses 4.9.0 and 5.0.0
    writeFileSync(entry, [
      '// SPDX-License-Identifier: MIT',
      'pragma solidity ^0.8.20;',
      'import "@openzeppelin/contracts@4.9.0/utils/Context.sol" as ContextV4;',
      'import "@openzeppelin/contracts@5.0.0/utils/Context.sol" as ContextV5;',
      'contract A1 is ContextV4.Context {}',
      'contract B1 is ContextV5.Context {}',
      ''
    ].join('\n'))

    const io1 = new NodeIOAdapter()
    const dr1 = new DependencyResolver(io1, entry, true)
    await dr1.buildDependencyTree(entry)
    await dr1.saveResolutionIndex()

    const idxRaw1 = await (await import('fs/promises')).readFile('.deps/npm/.resolution-index.json', 'utf8')
    const idx1 = JSON.parse(idxRaw1)
    const entryMap1 = idx1[entry] || {}
    expect(entryMap1['@openzeppelin/contracts@4.9.0/utils/Context.sol']).to.match(/^\.deps\/npm\/@openzeppelin\/contracts@4\.9\.0\/utils\/Context\.sol$/)
    expect(entryMap1['@openzeppelin/contracts@5.0.0/utils/Context.sol']).to.match(/^\.deps\/npm\/@openzeppelin\/contracts@5\.0\.0\/utils\/Context\.sol$/)

    // Phase 2: update V5 import to a different version (5.0.2) and verify index updates
    writeFileSync(entry, [
      '// SPDX-License-Identifier: MIT',
      'pragma solidity ^0.8.20;',
      'import "@openzeppelin/contracts@4.9.0/utils/Context.sol" as ContextV4;',
      'import "@openzeppelin/contracts@5.0.2/utils/Context.sol" as ContextV5;',
      'contract A2 is ContextV4.Context {}',
      'contract B2 is ContextV5.Context {}',
      ''
    ].join('\n'))

    const io2 = new NodeIOAdapter()
    const dr2 = new DependencyResolver(io2, entry, true)
    await dr2.buildDependencyTree(entry)
    await dr2.saveResolutionIndex()

    // Expect new version file materialized
    expect(await exists('.deps/npm/@openzeppelin/contracts@5.0.2/utils/Context.sol')).to.equal(true)

    const idxRaw2 = await (await import('fs/promises')).readFile('.deps/npm/.resolution-index.json', 'utf8')
    const idx2 = JSON.parse(idxRaw2)
    const entryMap2 = idx2[entry] || {}
    // Old 5.0.0 mapping should be gone after clear + rewrite, replaced by 5.0.2
    expect(entryMap2['@openzeppelin/contracts@4.9.0/utils/Context.sol']).to.match(/^\.deps\/npm\/@openzeppelin\/contracts@4\.9\.0\/utils\/Context\.sol$/)
    expect(entryMap2['@openzeppelin/contracts@5.0.2/utils/Context.sol']).to.match(/^\.deps\/npm\/@openzeppelin\/contracts@5\.0\.2\/utils\/Context\.sol$/)
    expect(entryMap2['@openzeppelin/contracts@5.0.0/utils/Context.sol']).to.equal(undefined)
  })
})
