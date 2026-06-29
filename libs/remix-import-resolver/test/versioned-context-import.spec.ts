/// <reference types="mocha" />
import { expect } from 'chai'
import { mkdtemp, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { ImportResolver, NodeIOAdapter } from '../src'

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true } catch { return false }
}

// Verifies direct versioned import of OpenZeppelin Context.sol works and is recorded
// in the resolution index as a concrete on-disk path under .deps/npm/...
describe('Direct versioned import: @openzeppelin/contracts@4.9.0/utils/Context.sol', () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(async () => {
    originalCwd = process.cwd()
    tempDir = await mkdtemp(join(tmpdir(), 'resolver-ctx-'))
    process.chdir(tempDir)
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    await rm(tempDir, { recursive: true, force: true })
  })

  it('resolves and persists Context.sol to .deps and records local path in index', async function () {
    this.timeout(90000)
    const io = new NodeIOAdapter()
    const target = 'AliasContext.sol'
    const resolver = new ImportResolver(io as any, target, true)

    const original = '@openzeppelin/contracts@4.9.0/utils/Context.sol'
    const content = await resolver.resolveAndSave(original)
    expect(content).to.be.a('string').and.not.empty

    // File should exist on disk at deterministic location
    const dest = '.deps/npm/@openzeppelin/contracts@4.9.0/utils/Context.sol'
    expect(await exists(dest)).to.equal(true)

    // Save to index and assert mapping points to a concrete local path
    await resolver.saveResolutionsToIndex()

    const idxPath = '.deps/npm/.resolution-index.json'
    expect(await exists(idxPath), 'resolution index should exist').to.equal(true)

    const raw = await (await import('fs/promises')).readFile(idxPath, 'utf8')
    const json = JSON.parse(raw)
    expect(json).to.have.property(target)
    const entry = json[target] || {}

    // getResolution should still expose the canonical npm-like form for in-memory use
    expect(resolver.getResolution(original)).to.equal(original)

    // but the persisted index must contain a concrete .deps path for tooling navigation
    expect(entry[original]).to.equal(dest)
  })
})
