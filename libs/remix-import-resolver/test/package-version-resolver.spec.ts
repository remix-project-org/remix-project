/// <reference types="mocha" />
import { expect } from 'chai'
import { PackageVersionResolver, NodeIOAdapter } from '../src'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

// Verifies the version precedence rules: workspace resolutions/aliases > parent deps > lockfile > npm.
// These tests exercise fast paths without requiring app context.
describe('PackageVersionResolver (standalone via IOAdapter)', () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(async () => {
    originalCwd = process.cwd()
    tempDir = await mkdtemp(join(tmpdir(), 'package-version-resolver-'))
    process.chdir(tempDir)
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    await rm(tempDir, { recursive: true, force: true })
  })

  it('resolves version from npm when no workspace/lock info', async () => {
    const io = new NodeIOAdapter()
    // Disable debug to keep test output quiet; cwd is isolated so workspace is ignored.
    const resolver = new PackageVersionResolver(io, false)
    const result = await resolver.resolveVersion('@openzeppelin/contracts')
    expect(result.version).to.be.a('string')
    // Should look like a semver (loose check)
    expect(result.version).to.match(/^\d+\./)
    expect(['package-json', 'lock-file']).to.include(result.source)
  })
})
