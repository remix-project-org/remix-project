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

// Validates that GitHub raw URLs are normalized, package.json fetched (when present),
// content saved under .deps/github, and the resolution index records the mapping.
describe('GitHub raw URL routing and normalization', () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(async () => {
    originalCwd = process.cwd()
    tempDir = await mkdtemp(join(tmpdir(), 'import-resolver-ghraw-'))
    process.chdir(tempDir)
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    await rm(tempDir, { recursive: true, force: true })
  })

  it('saves normalized path and records resolution for raw.githubusercontent.com', async function () {
    this.timeout(120000)
    const io = new NodeIOAdapter()
    const resolver = new ImportResolver(io as any, 'GhRaw.sol', true)

    const original = 'https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v4.9.6/contracts/token/ERC20/IERC20.sol'
    const content = await resolver.resolveAndSave(original)
    expect(content).to.be.a('string').and.includes('interface IERC20')

    // content saved under .deps/github to the normalized path
    expect(await exists('.deps/github/OpenZeppelin/openzeppelin-contracts@v4.9.6/contracts/token/ERC20/IERC20.sol')).to.equal(true)

    // package.json fetched and saved under .deps/github for the repository ref
    expect(await exists('.deps/github/OpenZeppelin/openzeppelin-contracts@v4.9.6/package.json')).to.equal(true)

    await resolver.saveResolutionsToIndex()
    const idxRaw = await fs.readFile('.deps/npm/.resolution-index.json', 'utf8')
    const idx = JSON.parse(idxRaw)
    const entry = idx['GhRaw.sol'] || {}
    expect(entry[original]).to.equal('.deps/github/OpenZeppelin/openzeppelin-contracts@v4.9.6/contracts/token/ERC20/IERC20.sol')
  })
})
