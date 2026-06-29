/// <reference types="mocha" />
import { expect } from 'chai'
import { promises as fs } from 'fs'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { ImportResolver, NodeIOAdapter } from '../src'

async function exists(path: string): Promise<boolean> {
  try {
    await fs.stat(path)
    return true
  } catch {
    return false
  }
}

describe('ImportResolver e2e parity (groups 1–6) - Node + local FS', () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(async () => {
    originalCwd = process.cwd()
    tempDir = await mkdtemp(join(tmpdir(), 'import-resolver-test-'))
    process.chdir(tempDir)
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    await rm(tempDir, { recursive: true, force: true })
  })

  describe('#group1 - Versioned folders on first import', () => {
    it('creates versioned folder for @openzeppelin/contracts-upgradeable', async function () {
      this.timeout(60000)
      const io = new NodeIOAdapter()
      const resolver = new ImportResolver(io as any, 'UpgradeableNFT.sol', true)

      const ozUpgradeable = '@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol'
      const content = await resolver.resolveAndSave(ozUpgradeable)
      expect(content).to.be.a('string')

      const depsDirExists = await exists('.deps/npm')
      expect(depsDirExists).to.equal(true)

      const tryVersions = ['5.4.0', '5.3.0', '5.2.0', '5.1.0', '5.0.0', '4.9.6', '4.8.3']
      let found = false
      for (const v of tryVersions) {
        // eslint-disable-next-line no-await-in-loop
        if (await exists(`.deps/npm/@openzeppelin/contracts-upgradeable@${v}/package.json`)) { found = true; break }
      }
      if (!found) {
        try {
          const ozDir = await fs.readdir('.deps/npm/@openzeppelin')
          found = ozDir.some((name) => name.startsWith('contracts-upgradeable@'))
        } catch { found = false }
      }
      expect(found, 'expected a versioned contracts-upgradeable folder to be created').to.equal(true)
    })
  })

  describe('#group2 - Workspace package.json version resolution', () => {
    it('uses version from workspace package.json and updates when changed', async function () {
      this.timeout(70000)
      await writeFile('package.json', JSON.stringify({
        name: 'test-workspace',
        version: '1.0.0',
        dependencies: { '@openzeppelin/contracts': '4.8.3' }
      }, null, 2))

      const io = new NodeIOAdapter()
      let resolver = new ImportResolver(io as any, 'TokenWithDeps.sol', true)

      await resolver.resolveAndSave('@openzeppelin/contracts/token/ERC20/ERC20.sol')
      expect(await exists('.deps/npm/@openzeppelin/contracts@4.8.3/package.json')).to.equal(true)

      await writeFile('package.json', JSON.stringify({
        name: 'test-workspace',
        version: '1.0.0',
        dependencies: { '@openzeppelin/contracts': '5.4.0' }
      }, null, 2))

      resolver = new ImportResolver(io as any, 'TokenWithDeps.sol', true)
      await resolver.resolveAndSave('@openzeppelin/contracts/token/ERC20/ERC20.sol')
      expect(await exists('.deps/npm/@openzeppelin/contracts@5.4.0/package.json')).to.equal(true)
    })
  })

  describe('#group3 - Explicit versioned imports deduplicate to canonical version', () => {
    it('normalizes explicit version equal to canonical mapping', async function () {
      this.timeout(60000)
      await writeFile('package.json', JSON.stringify({
        name: 'test-workspace',
        version: '1.0.0',
        dependencies: { '@openzeppelin/contracts': '4.8.3' }
      }, null, 2))

      const io = new NodeIOAdapter()
      const resolver = new ImportResolver(io as any, 'ExplicitVersions.sol', true)
      const original = '@openzeppelin/contracts@4.8.3/token/ERC20/ERC20.sol'
      await resolver.resolveAndSave(original)
      const mapped = resolver.getResolution(original)
      expect(mapped).to.equal('@openzeppelin/contracts@4.8.3/token/ERC20/ERC20.sol')
    })
  })

  describe('#group4 - Explicit version override', () => {
    it('respects explicit @5 even if workspace pins 4.8.3', async function () {
      this.timeout(70000)
      await writeFile('package.json', JSON.stringify({
        name: 'conflict-test',
        version: '1.0.0',
        dependencies: { '@openzeppelin/contracts': '4.8.3' }
      }, null, 2))

      const io = new NodeIOAdapter()
      const resolver = new ImportResolver(io as any, 'ConflictingVersions.sol', true)
      const original = '@openzeppelin/contracts@5/token/ERC20/IERC20.sol'
      await resolver.resolveAndSave(original)
      const mapped = resolver.getResolution(original)
      expect(mapped).to.be.ok
      expect(mapped?.includes('@openzeppelin/contracts@5')).to.equal(true)
      expect(
        await exists('.deps/npm/@openzeppelin/contracts@5/package.json')
        || await exists('.deps/npm/@openzeppelin/contracts@5.0.2/package.json')
        || await exists('.deps/npm/@openzeppelin/contracts@5.4.0/package.json')
        || await exists('.deps/npm/@openzeppelin/contracts@5.0.0/package.json')
      ).to.equal(true)
      expect(mapped?.includes('@4.8.3')).to.equal(false)
    })
  })

  describe('#group5 - yarn.lock version resolution', () => {
    it('uses version from yarn.lock when present', async function () {
      this.timeout(70000)
      await writeFile('yarn.lock', `# yarn lockfile v1\n\n"@openzeppelin/contracts@^4.9.0":\n  version "4.9.6"\n`)
      const io = new NodeIOAdapter()
      const resolver = new ImportResolver(io as any, 'YarnLockTest.sol', true)
      await resolver.resolveAndSave('@openzeppelin/contracts/token/ERC20/ERC20.sol')
      expect(await exists('.deps/npm/@openzeppelin/contracts@4.9.6/package.json')).to.equal(true)
    })
  })

  describe('#group6 - package-lock.json version resolution', () => {
    it('uses version from package-lock.json when present', async function () {
      this.timeout(70000)
      await writeFile('package-lock.json', JSON.stringify({
        name: 'remix-project',
        version: '1.0.0',
        lockfileVersion: 3,
        requires: true,
        packages: {
          '': { name: 'remix-project', version: '1.0.0', dependencies: { '@openzeppelin/contracts': '^4.8.0' } },
          'node_modules/@openzeppelin/contracts': { version: '4.8.1' }
        }
      }, null, 2))
      const io = new NodeIOAdapter()
      const resolver = new ImportResolver(io as any, 'PackageLockTest.sol', true)
      await resolver.resolveAndSave('@openzeppelin/contracts/token/ERC20/ERC20.sol')
      expect(await exists('.deps/npm/@openzeppelin/contracts@4.8.1/package.json')).to.equal(true)
    })
  })
})
