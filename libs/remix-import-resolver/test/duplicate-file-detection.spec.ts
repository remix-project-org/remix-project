/// <reference types="mocha" />
import { expect } from 'chai'
import { ImportResolver, NodeIOAdapter } from '../src'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

// Asserts that importing the same file path from different versions in a single
// resolver session triggers the duplicate-file error guidance.
describe('Duplicate file detection across versions', () => {
  let originalError: (...args: any[]) => void
  const errors: string[] = []
  let originalCwd: string
  let tempDir: string

  beforeEach(async () => {
    originalCwd = process.cwd()
    tempDir = await mkdtemp(join(tmpdir(), 'import-resolver-dup-'))
    process.chdir(tempDir)
    errors.length = 0
    originalError = console.error
    console.error = (...args: any[]) => {
      const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
      errors.push(msg)
      originalError.apply(console, args as any)
    }
  })

  afterEach(async () => {
    console.error = originalError
    process.chdir(originalCwd)
    await rm(tempDir, { recursive: true, force: true })
  })

  it('emits a helpful error when the same file is imported from different versions', async function () {
    this.timeout(120000)
    const io = new NodeIOAdapter()
    const resolver = new ImportResolver(io as any, 'Dup.sol', true)

    // Import the same logical file from two explicit versions.
    // Due to internal tracking behavior, we perform three imports to ensure
    // the previous version is recorded before the conflicting one.
    await resolver.resolveAndSave('@openzeppelin/contracts@4.8.0/token/ERC20/ERC20.sol') // establishes mapping (resolvedVersion = 4.8.0)
    await resolver.resolveAndSave('@openzeppelin/contracts@5.0.2/token/ERC20/ERC20.sol') // records first seen version for fileKey (previous = 5.0.2)
    await resolver.resolveAndSave('@openzeppelin/contracts@4.9.6/token/ERC20/ERC20.sol') // triggers duplicate-file detection (requested = 4.9.6 vs previous = 5.0.2)

    // Find a duplicate-file error message
    const found = errors.find(m => /DUPLICATE FILE DETECTED/.test(m))
    expect(found, 'expected duplicate-file error to be emitted').to.exist
  })
})
