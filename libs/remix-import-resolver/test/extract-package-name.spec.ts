import { expect } from 'chai'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { ImportResolver } from '../src/resolvers/import-resolver'
import { extractPackageName } from '../src/utils/parser-utils'
import { NodeIOAdapter } from '../src/adapters/node-io-adapter'

// Parser util checks: ensure alias-aware package name extraction returns the
// alias key when present (e.g., @module_remapping) and falls back to the
// scoped package name for standard npm paths.
describe('extractPackageName (alias-aware)', function () {
  let originalCwd: string
  let tempDir: string

  beforeEach(async () => {
    originalCwd = process.cwd()
    tempDir = await mkdtemp(join(tmpdir(), 'extract-pkgname-test-'))
    process.chdir(tempDir)
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    await rm(tempDir, { recursive: true, force: true })
  })

  it('returns alias key for npm alias remapping (e.g., @module_remapping)', async function () {
    await writeFile('package.json', JSON.stringify({
      name: 'alias-ws', private: true,
      dependencies: { '@module_remapping': 'npm:@openzeppelin/contracts@4.9.0' }
    }, null, 2))

    const io = new NodeIOAdapter()
    const resolver = new ImportResolver(io as any, 'Alias.spec.ts', false)
    // Ensure workspace resolutions are loaded so alias keys are known to the resolver
    await (resolver as any).packageVersionResolver.loadWorkspaceResolutions()

    const pkg = extractPackageName(
      '@module_remapping/token/ERC20/ERC20.sol',
      (resolver as any).packageVersionResolver.getWorkspaceResolutions()
    )
    expect(pkg).to.equal('@module_remapping')
  })

  it('returns scoped package for standard scoped import', async function () {
    await writeFile('package.json', JSON.stringify({ name: 'basic-ws', private: true }, null, 2))

    const io = new NodeIOAdapter()
    const resolver = new ImportResolver(io as any, 'Alias.spec.ts', false)
    await (resolver as any).packageVersionResolver.loadWorkspaceResolutions()

    const pkg = extractPackageName(
      '@openzeppelin/contracts/token/ERC20/ERC20.sol',
      (resolver as any).packageVersionResolver.getWorkspaceResolutions()
    )
    expect(pkg).to.equal('@openzeppelin/contracts')
  })
})
