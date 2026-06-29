/// <reference types="mocha" />
import { expect } from 'chai'
import { Logger, PackageVersionResolver, DependencyStore, ConflictChecker, NodeIOAdapter } from '../src'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

// ConflictChecker emits structured warnings/errors when imported or peer dependency
// versions are inconsistent with what is actually resolved. These tests simulate
// realistic scenarios to ensure developers are alerted to risky version skews.
describe('ConflictChecker', () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(async () => {
    originalCwd = process.cwd()
    tempDir = await mkdtemp(join(tmpdir(), 'import-resolver-conflict-'))
    process.chdir(tempDir)
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    await rm(tempDir, { recursive: true, force: true })
  })
  it('warns on peer dependency major mismatch', async () => {
    const io = new NodeIOAdapter()
    const pvr = new PackageVersionResolver(io, true)
    const depStore = new DependencyStore()
    // Provide a minimal yarn.lock in the isolated temp dir so peer dep resolves deterministically
    await writeFile('yarn.lock', `# yarn lockfile v1\n\n"@openzeppelin/contracts@^4.9.0":\n  version "5.0.2"\n`)
    // Ensure lockfile versions are loaded so peer dep can resolve
    await pvr.loadLockFileVersions()

    const messages: { type: string; value: string }[] = []
    const logger = new Logger(undefined, true)
    // Monkey-patch terminal to capture messages
    ;(logger as any).terminal = async (type: string, value: string) => {
      messages.push({ type, value })
    }

    const checker = new ConflictChecker({
      logger,
      versionResolver: pvr,
      depStore: depStore,
      getImportMapping: (_key: string) => undefined // no imported mapping
    })

    // Simulate a package.json with a conflicting peer dependency
    const pkgName = 'example-pkg'
    const pkgVersion = '1.0.0'
    const packageJson = {
      peerDependencies: {
        '@openzeppelin/contracts': '^4.9.0'
      }
    }

    await checker.checkPackageDependencies(pkgName, pkgVersion, packageJson)

    // Expect an error (major version mismatch) mentioning Peer Dependency
    const found = messages.find(m => m.type === 'error' && /Peer Dependency/.test(m.value))
    expect(found, 'expected peer dependency mismatch error').to.exist
  }).timeout(10000)

  it('warns on imported dependency major mismatch', async () => {
    const io = new NodeIOAdapter()
    const pvr = new PackageVersionResolver(io, true)
    const depStore = new DependencyStore()
    // No lockfile needed for imported dependency case (we inject imported mapping)

    const messages: { type: string; value: string }[] = []
    const logger = new Logger(undefined, true)
    ;(logger as any).terminal = async (type: string, value: string) => {
      messages.push({ type, value })
    }

    // Simulate that '@openzeppelin/contracts' was imported and mapped to version 5.0.2
    const getImportMapping = (key: string) => {
      if (key === '__PKG__@openzeppelin/contracts') return '@openzeppelin/contracts@5.0.2'
      return undefined
    }

    const checker = new ConflictChecker({
      logger,
      versionResolver: pvr,
      depStore: depStore,
      getImportMapping
    })

    const pkgName = 'another-pkg'
    const pkgVersion = '1.0.0'
    const packageJson = {
      dependencies: {
        '@openzeppelin/contracts': '^4.9.0'
      }
    }

    await checker.checkPackageDependencies(pkgName, pkgVersion, packageJson)

    const found = messages.find(m => (m.type === 'error' || m.type === 'warn') && /MAJOR VERSION MISMATCH|Dependency version mismatch/.test(m.value))
    expect(found, 'expected dependency mismatch warning or error').to.exist
  }).timeout(10000)
})
