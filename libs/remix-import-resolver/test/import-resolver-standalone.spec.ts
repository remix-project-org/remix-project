/// <reference types="mocha" />
import { expect } from 'chai'
import { ImportResolver, NodeIOAdapter } from '../src'
import { promises as fs } from 'fs'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const INDEX_PATH = '.deps/npm/.resolution-index.json'

// Basic smoke-test to ensure the standalone resolver resolves npm imports,
// records a versioned mapping, and persists a resolution index for IDE features.
describe('ImportResolver standalone (via NodeIOAdapter)', () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(async () => {
    originalCwd = process.cwd()
    tempDir = await mkdtemp(join(tmpdir(), 'import-resolver-standalone-'))
    process.chdir(tempDir)
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    await rm(tempDir, { recursive: true, force: true })
  })
  it('resolves and saves an npm import without explicit version', async () => {
    const io = new NodeIOAdapter()
    const resolver = new ImportResolver(io as any, 'contracts/Test.sol', true)

    const original = '@openzeppelin/contracts/token/ERC20/ERC20.sol'
    const content = await resolver.resolveAndSave(original)

    expect(content).to.be.a('string')
    expect(content.length).to.be.greaterThan(500)

    // Resolution should include a version mapping
    const resolved = resolver.getResolution(original)
    expect(resolved).to.be.a('string')
    expect(resolved).to.match(/^@openzeppelin\/contracts@\d+\./)

    // The resolved Solidity file should be saved under .deps; npm paths under .deps/npm/
    const savedExists = await fs.stat(`.deps/${resolved}`).then(() => true).catch(() => false)
    const savedNpmExists = await fs.stat(`.deps/npm/${resolved}`).then(() => true).catch(() => false)
    expect(savedExists || savedNpmExists, `expected saved file at .deps/${resolved} (or .deps/npm/${resolved})`).to.equal(true)

    // Save index and verify file is created
    await resolver.saveResolutionsToIndex()
    const exists = await fs.stat(INDEX_PATH).then(() => true).catch(() => false)
    expect(exists).to.equal(true)
  }).timeout(20000)
})
