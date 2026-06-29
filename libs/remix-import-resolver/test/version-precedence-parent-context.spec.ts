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

// Validates parent-context precedence within a single resolver session:
// After importing an explicit package version, subsequent unversioned imports
// of the same package should resolve to that version consistently.
describe('Version precedence: parent-context mapping within a session', () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(async () => {
    originalCwd = process.cwd()
    tempDir = await mkdtemp(join(tmpdir(), 'import-resolver-parent-ctx-'))
    process.chdir(tempDir)
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    await rm(tempDir, { recursive: true, force: true })
  })

  it('reuses the first resolved version for later unversioned imports', async function () {
    this.timeout(90000)
    const io = new NodeIOAdapter()
    const resolver = new ImportResolver(io as any, 'ParentContext.sol', true)

    // 1) Explicit versioned import establishes the mapping
    const first = '@openzeppelin/contracts@4.9.6/token/ERC20/ERC20.sol'
    const c1 = await resolver.resolveAndSave(first)
    expect(c1).to.be.a('string').and.not.empty
    expect(await exists('.deps/npm/@openzeppelin/contracts@4.9.6/package.json')).to.equal(true)

    // 2) Unversioned import should map to 4.9.6 within this session
    const unversioned = '@openzeppelin/contracts/utils/Address.sol'
    const c2 = await resolver.resolveAndSave(unversioned)
    expect(c2).to.be.a('string').and.not.empty

    // Check the mapping recorded in-memory
    const mapped = resolver.getResolution(unversioned)
    expect(mapped && mapped.includes('@openzeppelin/contracts@4.9.6/')).to.equal(true)

    // And in the persisted index
    await resolver.saveResolutionsToIndex()
    const idxRaw = await fs.readFile('.deps/npm/.resolution-index.json', 'utf8')
    const idx = JSON.parse(idxRaw)
    const entry = idx['ParentContext.sol'] || {}
    expect(entry[unversioned]).to.include('@openzeppelin/contracts@4.9.6/utils/Address.sol')
  })
})
