/// <reference types="mocha" />
import { expect } from 'chai'
import { promises as fs } from 'fs'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { ImportResolver, NodeIOAdapter } from '../src'

async function exists(path: string): Promise<boolean> {
  try { await fs.stat(path); return true } catch { return false }
}

// Verifies that after saving a parent package.json, the resolver uses the parent's
// declared dependencies to pick the child package version (deep package.json usage).
// We use Chainlink CCIP → @chainlink/contracts as a deterministic example.
describe('Deep package.json usage via parent deps', () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(async () => {
    originalCwd = process.cwd()
    tempDir = await mkdtemp(join(tmpdir(), 'import-resolver-deep-'))
    process.chdir(tempDir)
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    await rm(tempDir, { recursive: true, force: true })
  })

  it('resolves child unversioned import according to parent package.json (contracts-ccip@1.6.1 → @chainlink/contracts@1.4.0)', async function () {
    this.timeout(120000)
    const io = new NodeIOAdapter()
    const resolver = new ImportResolver(io as any, 'DeepParentDeps.sol', true)

    // 1) Touch the parent to persist its package.json and dependency graph
    await resolver.resolveAndSave('@chainlink/contracts-ccip@1.6.1/package.json')

    // 2) Import a child file without a version; it should resolve to the version
    // declared in the parent's package.json (1.4.0 at the time of writing).
    // Use a file that exists in @chainlink/contracts@1.4.0 across releases
    const original = '@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol'
    const content = await resolver.resolveAndSave(original)
    expect(content).to.be.a('string')
    expect(content).to.include('interface AggregatorV3Interface')

    // Saved under versioned folder determined by parent deps (under .deps/npm)
    const expectedPath = '@chainlink/contracts@1.4.0/src/v0.8/shared/interfaces/AggregatorV3Interface.sol'
    const savedDeps = await exists(`.deps/${expectedPath}`)
    const savedNpm = await exists(`.deps/npm/${expectedPath}`)
    expect(savedDeps || savedNpm).to.equal(true)

    // Index mapping should reflect original → versioned path
    await resolver.saveResolutionsToIndex()
    const idxRaw = await fs.readFile('.deps/npm/.resolution-index.json', 'utf8')
    const idx = JSON.parse(idxRaw)
    const entry = idx['DeepParentDeps.sol'] || {}
    expect(entry[original]).to.equal(`.deps/npm/${expectedPath}`)
  })

  it('auto-loads parent deps when entry file is inside a versioned package (no manual package.json touch)', async function () {
    this.timeout(180000)
    const io = new NodeIOAdapter()
    const resolver = new ImportResolver(io as any, 'PackageEntry.sol', true)

    // Ensure the entry source file exists locally under .deps by resolving it first
    await resolver.resolveAndSave('@chainlink/contracts-ccip@1.6.1/contracts/applications/CCIPReceiver.sol')

    // Now resolve one of its transitive imports that relies on @chainlink/contracts version
    const child = '@chainlink/contracts/src/v0.8/vendor/openzeppelin-solidity/v5.0.2/contracts/utils/introspection/IERC165.sol'
    const content = await resolver.resolveAndSave(child)
    expect(content).to.be.a('string')
    expect(content).to.include('interface IERC165')

    // It should resolve under @chainlink/contracts@1.4.0 due to the parent package.json
    const resolved = resolver.getResolution(child)
    expect(resolved).to.match(/^@chainlink\/contracts@1\.4\.0\//)
  })
})
