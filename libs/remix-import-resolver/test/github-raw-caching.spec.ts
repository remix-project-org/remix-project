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

function captureConsole() {
  const logs: string[] = []
  const orig = console.log
  console.log = (...args: any[]) => { try { logs.push(args.map(String).join(' ')) } catch {} orig.apply(console, args as any) }
  return { logs, restore: () => { console.log = orig } }
}

// Ensures we fetch GitHub package.json at most once per owner/repo@ref in a single resolver session
// and skip subsequent fetches (using cache and on-disk presence).
describe('GitHub package.json fetch caching', () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(async () => {
    originalCwd = process.cwd()
    tempDir = await mkdtemp(join(tmpdir(), 'import-resolver-ghcache-'))
    process.chdir(tempDir)
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    await rm(tempDir, { recursive: true, force: true })
  })

  it('fetches once then skips for same repo@ref within session', async function () {
    this.timeout(180000)
    const io = new NodeIOAdapter()
    const resolver = new ImportResolver(io as any, 'RawImport.sol', true)

    const owner = 'OpenZeppelin'
    const repo = 'openzeppelin-contracts-upgradeable'
    const ref = 'v5.4.0'

    const first = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/contracts/token/ERC1155/ERC1155Upgradeable.sol`
    const second = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/contracts/utils/ContextUpgradeable.sol`

    // Capture logs to assert cached skip message
    const { logs, restore } = captureConsole()
    try {
      // First resolve triggers package.json fetch and save
      const content1 = await resolver.resolveAndSave(first)
      expect(content1).to.be.a('string').and.includes('ERC1155')

      const pkgPath = `.deps/github/${owner}/${repo}@${ref}/package.json`
      expect(await exists(pkgPath)).to.equal(true)
      const stat1 = await fs.stat(pkgPath)

      // Second resolve should NOT re-fetch package.json
      const content2 = await resolver.resolveAndSave(second)
      expect(content2).to.be.a('string').and.includes('abstract contract ContextUpgradeable')

      const stat2 = await fs.stat(pkgPath)
      // mtime should be unchanged if we didn't rewrite the file
      expect(stat2.mtimeMs).to.equal(stat1.mtimeMs)

      // And logs should include the cached-skip message
      const sawSkip = logs.some(l => l.includes('Skipping GitHub package.json fetch (cached)') && l.includes(`${owner}/${repo}@${ref}`))
      expect(sawSkip).to.equal(true)

      // Also ensure we can save the index without error
      await resolver.saveResolutionsToIndex()
      const idxRaw = await fs.readFile('.deps/npm/.resolution-index.json', 'utf8')
      const idx = JSON.parse(idxRaw)
      expect(idx['RawImport.sol']).to.be.an('object')
    } finally {
      restore()
    }
  })
})
