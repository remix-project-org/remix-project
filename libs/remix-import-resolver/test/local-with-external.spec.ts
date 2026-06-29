/// <reference types="mocha" />
import { expect } from 'chai'
import { promises as fs } from 'fs'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join, dirname } from 'path'

import { DependencyResolver, NodeIOAdapter } from '../src'

async function exists(path: string): Promise<boolean> {
  try { await fs.stat(path); return true } catch { return false }
}

// Simulates E2E group22: complex local imports with external dependencies
// Verifies:
// - Local relative imports are not recorded in the resolution index
// - External npm imports are resolved to .deps/npm/<pkg>@<version>/...
// - Resolution index contains external mappings for the main file
describe('Local project with external OpenZeppelin dependencies', () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(async () => {
    originalCwd = process.cwd()
    tempDir = await mkdtemp(join(tmpdir(), 'import-resolver-local-ext-'))
    process.chdir(tempDir)
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    await rm(tempDir, { recursive: true, force: true })
  })

  it('builds dependency tree and records only external mappings', async function () {
    this.timeout(240000)

    // Workspace package.json with exact OZ version to keep deterministic
    await writeFile('package.json', JSON.stringify({
      name: 'local-external-fixture',
      version: '1.0.0',
      dependencies: {
        '@openzeppelin/contracts': '4.9.6'
      }
    }, null, 2), 'utf8')

    // Create local project files
    await fs.mkdir(dirname('contracts/interfaces/IStorage.sol'), { recursive: true })
    await writeFile('contracts/interfaces/IStorage.sol', `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
interface IStorage { function get() external view returns (uint256); }
`, 'utf8')

    await fs.mkdir(dirname('contracts/libraries/Math.sol'), { recursive: true })
    await writeFile('contracts/libraries/Math.sol', `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
library Math { function add(uint256 a, uint256 b) internal pure returns (uint256) { return a + b; } }
`, 'utf8')

    await fs.mkdir(dirname('contracts/base/BaseContract.sol'), { recursive: true })
    await writeFile('contracts/base/BaseContract.sol', `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "../interfaces/IStorage.sol";
contract BaseContract { IStorage internal store; constructor(IStorage s) { store = s; } }
`, 'utf8')

    await fs.mkdir(dirname('contracts'), { recursive: true })
    await writeFile('contracts/TokenVault.sol', `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "./base/BaseContract.sol";
contract TokenVault is BaseContract { constructor(IStorage s) BaseContract(s) {} }
`, 'utf8')

    // Main file mixes local imports and external OZ imports
    await fs.mkdir(dirname('contracts/main/Staking.sol'), { recursive: true })
    await writeFile('contracts/main/Staking.sol', `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "../base/BaseContract.sol";
import "../libraries/Math.sol";
import "../interfaces/IStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
contract Staking is BaseContract, Ownable, Pausable {
  constructor(IStorage s) BaseContract(s) {}
}
`, 'utf8')

    const io = new NodeIOAdapter()
    const dep = new DependencyResolver(io as any, 'contracts/main/Staking.sol', true)

    // Build dep tree
    const bundle = await dep.buildDependencyTree('contracts/main/Staking.sol')
    expect(bundle.size).to.be.greaterThan(0)

    // Ensure OZ sources materialized under .deps/npm
    const npmDepsExist = await exists('.deps/npm/@openzeppelin')
    expect(npmDepsExist).to.equal(true)

    // Persist and inspect the resolution index
    await dep.saveResolutionIndex()
    const idxRaw = await fs.readFile('.deps/npm/.resolution-index.json', 'utf8')
    const idx = JSON.parse(idxRaw)

    // Find Staking.sol entry
    const keys: string[] = Object.keys(idx || {})
    const stakingKey = keys.find(k => k.endsWith('contracts/main/Staking.sol'))
    expect(!!stakingKey).to.equal(true)
    const mappings = idx[stakingKey!]

    // Local relative imports SHOULD appear as keys in the index (they need to be mapped!)
    const mappingKeys = Object.keys(mappings || {})
    const hasLocal = mappingKeys.some(k => k.includes('../base/BaseContract.sol') || k.includes('../libraries/Math.sol') || k.includes('../interfaces/IStorage.sol'))
    expect(hasLocal).to.equal(true) // Changed: local imports should be tracked

    // External OZ imports should be mapped to versioned namespace
    const hasOZ = mappingKeys.some(k => k.includes('@openzeppelin/contracts'))
    expect(hasOZ).to.equal(true)
    const resolvedTargets = Object.values(mappings || {}).map(String)
    const hasVersionedOZ = resolvedTargets.some(p => p.includes('.deps') ? p.includes('@openzeppelin/contracts@') : p.includes('@openzeppelin/contracts@'))
    expect(hasVersionedOZ).to.equal(true)
  })

  it('materializes OZ files under .deps/npm and exposes unversioned aliases in bundle', async function () {
    this.timeout(240000)

    await writeFile('package.json', JSON.stringify({
      name: 'local-external-fixture',
      version: '1.0.0',
      dependencies: {
        '@openzeppelin/contracts': '4.9.6'
      }
    }, null, 2), 'utf8')

    // Ensure the exact directory exists; dirname('contracts/main') would only create 'contracts'
    await fs.mkdir('contracts/main', { recursive: true })
    await writeFile('contracts/main/Staking.sol', `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/access/Ownable.sol";
contract Staking is Ownable {}
`, 'utf8')

    const io = new NodeIOAdapter()
    const dep = new DependencyResolver(io as any, 'contracts/main/Staking.sol', true)

    const bundle = await dep.buildDependencyTree('contracts/main/Staking.sol')
    await dep.saveResolutionIndex()

    // Check the concrete saved file under .deps/npm for version 4.9.6
    expect(await exists('.deps/npm/@openzeppelin/contracts@4.9.6/access/Ownable.sol')).to.equal(true)

    // Bundle should includes unversioned OZ paths
    const bundleKeys = Array.from(bundle.keys())
    const hasVersioned = bundleKeys.some(k => k.includes('@openzeppelin/contracts/access/Ownable.sol'))
    expect(hasVersioned).to.equal(true)

    // Resolution index value should be versioned for the original import path
    const idxRaw = await fs.readFile('.deps/npm/.resolution-index.json', 'utf8')
    const idx = JSON.parse(idxRaw)
    const key = Object.keys(idx).find(k => k.endsWith('contracts/main/Staking.sol'))
    expect(!!key).to.equal(true)
    const value = idx[key!]['@openzeppelin/contracts/access/Ownable.sol']
    expect(typeof value).to.equal('string')
    expect(value.includes('@openzeppelin/contracts@4.9.6')).to.equal(true)
  })
})
