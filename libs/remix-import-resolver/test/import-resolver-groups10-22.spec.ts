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

// These tests cover a subset of remix-solidity e2e groups 10–22, ported to the standalone
// resolver. Each block explains the human-level behavior being validated.
describe('ImportResolver e2e parity (groups 10–22 subset) - Node + local FS', () => {
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

  it.skip('#group10 - debug logging toggles via localStorage (UI only)', () => {})
  it.skip('#group11 - import parsing edge cases (compiler integration)', () => {})

  // group12: Requests to CDN providers (unpkg/jsDelivr) should be normalized to npm paths.
  // Versioned CDN URLs become versioned npm paths; unversioned resolve to a workspace-pinned version.
  describe('#group12 - CDN imports normalization', () => {
    it('normalizes unpkg versioned to npm path and saves under versioned folders', async function () {
      this.timeout(60000)
      const io = new NodeIOAdapter()
      const resolver = new ImportResolver(io as any, 'UnpkgTest.sol', true)
      const original = 'https://unpkg.com/@openzeppelin/contracts@4.8.0/token/ERC20/ERC20.sol'
      const content = await resolver.resolveAndSave(original)
      expect(content).to.be.a('string').and.not.empty
      expect(await exists('.deps/npm/@openzeppelin/contracts@4.8.0/package.json')).to.equal(true)
      const mapped = resolver.getResolution(original)
      expect(mapped).to.include('@openzeppelin/contracts@4.8.0/token/ERC20/ERC20.sol')
    })

    it('normalizes jsDelivr versioned to npm path and saves under versioned folders', async function () {
      this.timeout(60000)
      const io = new NodeIOAdapter()
      const resolver = new ImportResolver(io as any, 'JsdelivrNpmTest.sol', true)
      const original = 'https://cdn.jsdelivr.net/npm/@openzeppelin/contracts@4.8.0/token/ERC20/ERC20.sol'
      const content = await resolver.resolveAndSave(original)
      expect(content).to.be.a('string').and.not.empty
      expect(await exists('.deps/npm/@openzeppelin/contracts@4.8.0/package.json')).to.equal(true)
      const mapped = resolver.getResolution(original)
      expect(mapped).to.include('@openzeppelin/contracts@4.8.0/token/ERC20/ERC20.sol')
    })

    it('normalizes unpkg unversioned to npm path and resolves version from workspace', async function () {
      this.timeout(70000)
      await writeFile('package.json', JSON.stringify({
        name: 'test-workspace', version: '1.0.0', dependencies: { '@openzeppelin/contracts': '4.9.6' }
      }, null, 2))

      const io = new NodeIOAdapter()
      const resolver = new ImportResolver(io as any, 'UnpkgUnversionedTest.sol', true)
      const original = 'https://unpkg.com/@openzeppelin/contracts/token/ERC20/ERC20.sol'
      const content = await resolver.resolveAndSave(original)
      expect(content).to.be.a('string').and.not.empty
      expect(await exists('.deps/npm/@openzeppelin/contracts@4.9.6/package.json')).to.equal(true)
      const mapped = resolver.getResolution(original)
      expect(mapped).to.include('@openzeppelin/contracts/token/ERC20/ERC20.sol')
    })

    it('normalizes jsDelivr unversioned to npm path and resolves version from workspace', async function () {
      this.timeout(70000)
      await writeFile('package.json', JSON.stringify({
        name: 'test-workspace', version: '1.0.0', dependencies: { '@openzeppelin/contracts': '4.9.6' }
      }, null, 2))

      const io = new NodeIOAdapter()
      const resolver = new ImportResolver(io as any, 'JsdelivrUnversionedTest.sol', true)
      const original = 'https://cdn.jsdelivr.net/npm/@openzeppelin/contracts/token/ERC20/ERC20.sol'
      const content = await resolver.resolveAndSave(original)
      expect(content).to.be.a('string').and.not.empty
      expect(await exists('.deps/npm/@openzeppelin/contracts@4.9.6/package.json')).to.equal(true)
      const mapped = resolver.getResolution(original)
      expect(mapped).to.include('@openzeppelin/contracts/token/ERC20/ERC20.sol')
    })
  })

  // group16: Raw GitHub imports should be saved under a deterministic github/<org>/<repo>@<ref>/ path,
  // and when possible, package.json should be fetched alongside for transitive resolution.
  describe('#group16 - raw.githubusercontent.com imports', () => {
    it('saves GitHub raw imports and fetches package.json when available', async function () {
      this.timeout(90000)
      const io = new NodeIOAdapter()
      const resolver = new ImportResolver(io as any, 'RawGithubImport.sol', true)
      const original = 'https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts-upgradeable/v5.4.0/contracts/token/ERC1155/ERC1155Upgradeable.sol'
      const content = await resolver.resolveAndSave(original)
      expect(content).to.be.a('string').and.not.empty
      expect(await exists('.deps/github/OpenZeppelin/openzeppelin-contracts-upgradeable@v5.4.0/package.json')).to.equal(true)
    })
  })

  // group17: Unversioned raw GitHub refs like refs/heads/master should normalize to @master
  // so saves are deterministic and easy to browse.
  describe('#group17 - unversioned GitHub raw import master/main normalization', () => {
    it('normalizes refs/heads/master to @master in save path', async function () {
      this.timeout(90000)
      const io = new NodeIOAdapter()
      const resolver = new ImportResolver(io as any, 'UnversionedGithubImport.sol', true)
      const original = 'https://raw.githubusercontent.com/remix-project-org/remix-project/refs/heads/master/apps/remix-ide/contracts/app/ethereum/constitution.sol'
      const content = await resolver.resolveAndSave(original)
      expect(content).to.be.a('string').and.not.empty
      const ghMasterSol = 'github/remix-project-org/remix-project@master/apps/remix-ide/contracts/app/ethereum/constitution.sol'
      const ghMasterSolDeps = `.deps/${ghMasterSol}`
      expect(await exists(ghMasterSol) || await exists(ghMasterSolDeps)).to.equal(true)
    })
  })

  // group18: npm alias keys in workspace package.json can point to different versions of the
  // same package. We verify both alias target and canonical package resolve and co-exist.
  describe('#group18 - npm alias with multiple package versions', () => {
    it('resolves both @openzeppelin/contracts and alias @openzeppelin/contracts-5', async function () {
      this.timeout(120000)
      await writeFile('package.json', JSON.stringify({
        name: 'oz-multi-version-mre', private: true,
        dependencies: { '@openzeppelin/contracts': '4.9.6', '@openzeppelin/contracts-5': 'npm:@openzeppelin/contracts@5.0.2' }
      }, null, 2))

      const io = new NodeIOAdapter()
      const resolver = new ImportResolver(io as any, 'eee.sol', true)
      await resolver.resolveAndSave('@openzeppelin/contracts/token/ERC20/ERC20.sol')
      await resolver.resolveAndSave('@openzeppelin/contracts-5/token/ERC20/ERC20.sol')

      expect(await exists('.deps/npm/@openzeppelin/contracts@4.9.6/package.json')).to.equal(true)
      expect(
        await exists('@openzeppelin/contracts@5.0.2/token/ERC20/ERC20.sol')
        || await exists('.deps/npm/@openzeppelin/contracts@5.0.2/token/ERC20/ERC20.sol')
        || await exists('@openzeppelin/contracts@5/token/ERC20/ERC20.sol')
        || await exists('.deps/npm/@openzeppelin/contracts@5/token/ERC20/ERC20.sol')
      ).to.equal(true)
      const mappedV4 = resolver.getResolution('@openzeppelin/contracts/token/ERC20/ERC20.sol')
      const mappedV5 = resolver.getResolution('@openzeppelin/contracts-5/token/ERC20/ERC20.sol')
      expect(mappedV4 && mappedV4.includes('@openzeppelin/contracts@4.9.6/')).to.equal(true)
      expect(mappedV5 && mappedV5.includes('@openzeppelin/contracts@5')).to.equal(true)
    })
  })

  // group13: When importing via a workspace alias key (module remapping), the real package.json
  // for the underlying npm package must be persisted for transitive dependency resolution.
  describe('#group13 - workspace module remapping alias saves real package.json', () => {
    it('saves the resolved package.json for the real npm package when importing via alias key', async function () {
      this.timeout(90000)
      await writeFile('package.json', JSON.stringify({
        name: 'module-remap-mre', private: true,
        dependencies: { '@module_remapping': 'npm:@openzeppelin/contracts@4.9.0' }
      }, null, 2))

      const io = new NodeIOAdapter()
      const resolver = new ImportResolver(io as any, 'ModuleRemapAlias.sol', true)

      // Import through the alias key
      await resolver.resolveAndSave('@module_remapping/token/ERC20/ERC20.sol')

      // The real package.json must be persisted for transitive resolution
      const hasRealPkg = await exists('.deps/npm/@openzeppelin/contracts@4.9.0/package.json')
      expect(hasRealPkg, 'real package.json for @openzeppelin/contracts@4.9.0 should be saved').to.equal(true)
    })
  })

  // group19: Multiple CDN imports for different versions of the same package should resolve independently
  // and have their mappings recorded in the resolution index for IDE features.
  describe('#group19 - jsDelivr multi-version imports', () => {
    it('resolves v4 ECDSA and v5 ERC20 via CDN and records mappings', async function () {
      this.timeout(120000)
      const io = new NodeIOAdapter()
      const resolver = new ImportResolver(io as any, 'MixedCDNVersions.sol', true)
      const v4 = 'https://cdn.jsdelivr.net/npm/@openzeppelin/contracts@4.9.6/utils/cryptography/ECDSA.sol'
      const v5 = 'https://cdn.jsdelivr.net/npm/@openzeppelin/contracts@5.0.2/token/ERC20/ERC20.sol'
      await resolver.resolveAndSave(v4)
      await resolver.resolveAndSave(v5)
      expect(await exists('.deps/npm/@openzeppelin/contracts@4.9.6/package.json')).to.equal(true)
      expect(await exists('.deps/npm/@openzeppelin/contracts@5.0.2/package.json') || await exists('.deps/npm/@openzeppelin/contracts@5/package.json')).to.equal(true)

      await resolver.saveResolutionsToIndex()
      const idxRaw = await fs.readFile('.deps/npm/.resolution-index.json', 'utf8')
      const idx = JSON.parse(idxRaw)
      const files = Object.keys(idx || {})
      const entry = files.find((f) => f.includes('MixedCDNVersions.sol'))
      expect(!!entry).to.equal(true)
    })
  })

  it.skip('#group13 - IPFS imports (requires gateway mapping in Node adapter)', () => {})
  it.skip('#group15 - invalid non-sol/package.json imports (frontend validation)', () => {})
  it.skip('#group21 - transitive multi-version via Chainlink (compiler integration)', () => {})
  it.skip('#group22 - complex project with local+external imports (compiler integration)', () => {})
})
