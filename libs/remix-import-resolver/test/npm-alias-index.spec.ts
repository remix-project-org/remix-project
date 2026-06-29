/// <reference types="mocha" />
import { expect } from 'chai'
import { promises as fs } from 'fs'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { ImportResolver, NodeIOAdapter } from '../src'

async function exists(path: string): Promise<boolean> {
  try { await fs.stat(path); return true } catch { return false }
}

// Verifies that npm alias keys and canonical package names both map correctly and
// are recorded in the per-target resolution index with distinct resolved paths.
describe('npm alias mapping recorded in resolution index', () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(async () => {
    originalCwd = process.cwd()
    tempDir = await mkdtemp(join(tmpdir(), 'import-resolver-alias-'))
    process.chdir(tempDir)
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    await rm(tempDir, { recursive: true, force: true })
  })

  it('records separate mappings for alias and canonical imports', async function () {
    this.timeout(120000)
    await writeFile('package.json', JSON.stringify({
      name: 'alias-index-mre', private: true,
      dependencies: {
        '@openzeppelin/contracts': '4.9.6',
        '@oz5': 'npm:@openzeppelin/contracts@5.0.2'
      }
    }, null, 2))

    const io = new NodeIOAdapter()
    const resolver = new ImportResolver(io as any, 'AliasIndex.sol', true)

    const canonical = '@openzeppelin/contracts/token/ERC20/ERC20.sol'
    const alias = '@oz5/token/ERC20/ERC20.sol'

    await resolver.resolveAndSave(canonical)
    await resolver.resolveAndSave(alias)
    await resolver.saveResolutionsToIndex()

    expect(await exists('.deps/npm/@openzeppelin/contracts@4.9.6/package.json')).to.equal(true)
    expect(
      await exists('.deps/npm/@openzeppelin/contracts@5.0.2/package.json')
      || await exists('.deps/npm/@openzeppelin/contracts@5/package.json')
    ).to.equal(true)

    const idxRaw = await fs.readFile('.deps/npm/.resolution-index.json', 'utf8')
    const idx = JSON.parse(idxRaw)
    const entry = idx['AliasIndex.sol'] || {}
    expect(entry[canonical]).to.include('@openzeppelin/contracts@4.9.6/token/ERC20/ERC20.sol')
    expect(entry[alias]).to.include('@openzeppelin/contracts@5')
  })
})
