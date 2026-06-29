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

// Ensures that the resolution index isolates entries per target file.
// Two different target files importing the same logical path but with different
// versions should record their own original→resolved mappings independently.
describe('Resolution index isolation per target file', () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(async () => {
    originalCwd = process.cwd()
    tempDir = await mkdtemp(join(tmpdir(), 'import-resolver-index-'))
    process.chdir(tempDir)
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    await rm(tempDir, { recursive: true, force: true })
  })

  it('records separate mappings for the same import across different target files', async function () {
    this.timeout(120000)
    const io = new NodeIOAdapter()

    const a = new ImportResolver(io as any, 'EntryA.sol', true)
    const b = new ImportResolver(io as any, 'EntryB.sol', true)

    const original = '@openzeppelin/contracts/token/ERC20/ERC20.sol'

    // A imports v4.8.0 explicitly, then records mapping for unversioned
    await a.resolveAndSave('@openzeppelin/contracts@4.8.0/token/ERC20/ERC20.sol')
    expect(await exists('.deps/npm/@openzeppelin/contracts@4.8.0/package.json')).to.equal(true)
    await a.resolveAndSave(original)
    await a.saveResolutionsToIndex()

    // B imports v5.0.2 explicitly, then records mapping for unversioned
    await b.resolveAndSave('@openzeppelin/contracts@5.0.2/token/ERC20/ERC20.sol')
    expect(
      await exists('.deps/npm/@openzeppelin/contracts@5.0.2/package.json')
      || await exists('.deps/npm/@openzeppelin/contracts@5/package.json')
    ).to.equal(true)
    await b.resolveAndSave(original)
    await b.saveResolutionsToIndex()

    const idxRaw = await fs.readFile('.deps/npm/.resolution-index.json', 'utf8')
    const idx = JSON.parse(idxRaw)

    expect(idx['EntryA.sol'][original]).to.include('@openzeppelin/contracts@4.8.0/token/ERC20/ERC20.sol')
    expect(idx['EntryB.sol'][original]).to.include('@openzeppelin/contracts@5')
  })
})
