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

// Ensures that workspace-level resolutions/overrides take precedence over
// dependency ranges and npm aliases when choosing a concrete version.
describe('Workspace resolutions precedence', () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(async () => {
    originalCwd = process.cwd()
    tempDir = await mkdtemp(join(tmpdir(), 'import-resolver-wsres-'))
    process.chdir(tempDir)
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    await rm(tempDir, { recursive: true, force: true })
  })

  it('uses resolutions/overrides over ranges and aliases', async function () {
    this.timeout(120000)
    // Workspace tries to pull OZ v5 via range and alias, but a resolution pins to 4.8.0
    await writeFile('package.json', JSON.stringify({
      name: 'ws-resolutions-mre', private: true,
      dependencies: {
        '@openzeppelin/contracts': '^5.0.0',
        '@oz5': 'npm:@openzeppelin/contracts@5.0.2'
      },
      // Yarn "resolutions" or npm "overrides" semantics – we support either key
      resolutions: {
        '@openzeppelin/contracts': '4.8.0'
      }
    }, null, 2))

    const io = new NodeIOAdapter()
    const resolver = new ImportResolver(io as any, 'WsResolutions.sol', true)

    const unversioned = '@openzeppelin/contracts/token/ERC20/ERC20.sol'
    await resolver.resolveAndSave(unversioned)
    await resolver.saveResolutionsToIndex()

    // The pinned version must be saved and used
    expect(await exists('.deps/npm/@openzeppelin/contracts@4.8.0/package.json')).to.equal(true)

    const idxRaw = await fs.readFile('.deps/npm/.resolution-index.json', 'utf8')
    const idx = JSON.parse(idxRaw)
    const entry = idx['WsResolutions.sol'] || {}
    expect(entry[unversioned]).to.include('@openzeppelin/contracts@4.8.0/token/ERC20/ERC20.sol')
  })
})
