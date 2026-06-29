/// <reference types="mocha" />
import { expect } from 'chai'
import { promises as fs } from 'fs'
import { mkdtemp, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { ImportResolver, NodeIOAdapter } from '../src'

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

// These tests exercise behaviors that previously lived in remix-solidity e2e "groups 7–9".
// We run them against the standalone resolver with the Node IO adapter to ensure
// parity in a minimal, fast, app-independent environment. Each test explains the
// user-observable intent in plain English so reviewers can quickly see what's covered.
describe('ImportResolver e2e parity (groups 7–9) - Node + local FS', () => {
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

  // group7: When a package depends on another package, imports of the child package
  // should be resolved to the version declared in the parent’s package.json.
  // Case: contracts-ccip@1.6.1 depends on @chainlink/contracts@1.4.0; we verify
  // that importing @chainlink/contracts resolves to 1.4.0 (and not a newer 1.5.x).
  describe('#group7 - Chainlink CCIP parent dependency resolution', () => {
    it('uses parent package.json (contracts-ccip@1.6.1) to resolve @chainlink/contracts to 1.4.0', async function () {
      this.timeout(60000)
      const io = new NodeIOAdapter()
      const resolver = new ImportResolver(io as any, 'ChainlinkCCIP.sol', true)

      await resolver.resolveAndSave('@chainlink/contracts-ccip@1.6.1/package.json')

      const original = '@chainlink/contracts/package.json'
      await resolver.resolveAndSave(original)

      const hasCcip = await exists('.deps/npm/@chainlink/contracts-ccip@1.6.1/package.json')
      const hasContracts14 = await exists('.deps/npm/@chainlink/contracts@1.4.0/package.json')

      expect(hasCcip, 'contracts-ccip@1.6.1 package.json should be saved').to.equal(true)
      expect(hasContracts14, '@chainlink/contracts should resolve to 1.4.0 from parent deps').to.equal(true)

      const hasContracts15 = await exists('.deps/npm/@chainlink/contracts@1.5.0/package.json')
      expect(hasContracts15, '@chainlink/contracts@1.5.0 should NOT be resolved here').to.equal(false)
    })
  })

  // group8: Ensure alias syntax and CDN URLs behave like first-class npm imports.
  // - npm: prefix should be treated as an npm path and saved under a versioned folder
  // - jsDelivr/unpkg URLs should normalize to npm paths and be saved under versioned folders
  describe('#group8 - npm alias and external URL normalization', () => {
    it('resolves npm: alias syntax to the correct versioned npm path', async function () {
      this.timeout(60000)
      const io = new NodeIOAdapter()
      const resolver = new ImportResolver(io as any, 'NpmAliasTest.sol', true)

      const original = 'npm:@openzeppelin/contracts@4.9.0/token/ERC20/ERC20.sol'
      const content = await resolver.resolveAndSave(original)
      expect(content).to.be.a('string')
      expect(content.length).to.be.greaterThan(200)

      const resolved = resolver.getResolution(original)
      expect(resolved).to.equal('@openzeppelin/contracts@4.9.0/token/ERC20/ERC20.sol')

      const fileExists = await exists(`.deps/npm/@openzeppelin/contracts@4.9.0/token/ERC20/ERC20.sol`)
      expect(fileExists).to.equal(true)
    })

    it('normalizes jsDelivr CDN requests to npm paths and saves under versioned folders', async function () {
      this.timeout(60000)
      const io = new NodeIOAdapter()
      const resolver = new ImportResolver(io as any, 'JsDelivrImport.sol', true)

      const original = 'https://cdn.jsdelivr.net/npm/@openzeppelin/contracts@4.8.0/token/ERC20/IERC20.sol'
      const content = await resolver.resolveAndSave(original)
      expect(content).to.be.a('string')

      const resolved = resolver.getResolution(original)
      expect(resolved).to.equal('@openzeppelin/contracts@4.8.0/token/ERC20/IERC20.sol')

      const fileExists = await exists('.deps/npm/@openzeppelin/contracts@4.8.0/token/ERC20/IERC20.sol')
      expect(fileExists).to.equal(true)
    })

    it('normalizes unpkg CDN requests to npm paths and saves under versioned folders', async function () {
      this.timeout(60000)
      const io = new NodeIOAdapter()
      const resolver = new ImportResolver(io as any, 'UnpkgImport.sol', true)

      const original = 'https://unpkg.com/@openzeppelin/contracts@4.8.0/token/ERC20/IERC20.sol'
      const content = await resolver.resolveAndSave(original)
      expect(content).to.be.a('string')

      const resolved = resolver.getResolution(original)
      expect(resolved).to.equal('@openzeppelin/contracts@4.8.0/token/ERC20/IERC20.sol')

      const fileExists = await exists('.deps/npm/@openzeppelin/contracts@4.8.0/token/ERC20/IERC20.sol')
      expect(fileExists).to.equal(true)
    })
  })

  // group9: After resolving imports, a resolution index is persisted so IDE features
  // like "Go to Definition" can map from the original import to the actual saved path.
  // We verify that the index file exists and contains correct mappings for all imports.
  describe('#group9 - Resolution index mapping for Go to Definition', () => {
    it('saves a .resolution-index.json with mappings for imported npm paths', async function () {
      this.timeout(60000)
      const io = new NodeIOAdapter()
      const targetFile = 'ResolutionIndexTest.sol'
      const resolver = new ImportResolver(io as any, targetFile, true)

      const imports = [
        '@openzeppelin/contracts/token/ERC20/ERC20.sol',
        '@openzeppelin/contracts/access/Ownable.sol',
        '@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol'
      ]

      for (const imp of imports) {
        // eslint-disable-next-line no-await-in-loop
        await resolver.resolveAndSave(imp)
      }

      await resolver.saveResolutionsToIndex()

      const idxPath = '.deps/npm/.resolution-index.json'
      const idxExists = await exists(idxPath)
      expect(idxExists, 'resolution index should be written').to.equal(true)

      const raw = await fs.readFile(idxPath, 'utf8')
      const json = JSON.parse(raw)
      expect(json).to.have.property(targetFile)
      const mappings = json[targetFile]
      expect(mappings).to.be.an('object')
      for (const imp of imports) {
        expect(mappings).to.have.property(imp)
        const resolved: string = mappings[imp]
        expect(resolved).to.match(/@openzeppelin\/contracts@\d+\./)
      }
    })
  })
})
