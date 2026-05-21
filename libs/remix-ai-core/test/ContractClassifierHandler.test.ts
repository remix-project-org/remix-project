/* eslint-disable no-prototype-builtins */
/* eslint-disable no-case-declarations */
/**
 * Unit tests for ContractClassifierHandler
 */

import tape from 'tape'
import { ContractClassifierHandler } from '../src/remix-mcp-server/handlers/ContractClassifierHandler'
import { ContractSkeletonExtractor, ContractClassification } from '../src/remix-mcp-server/handlers/helpers/ContractClassifier'

// Mock Plugin for testing
class MockPlugin {
  private files: { [key: string]: string } = {}
  private workspace = { name: 'default_workspace' }

  async call(module: string, method: string, ...args: any[]): Promise<any> {
    switch (`${module}.${method}`) {
    case 'filePanel.getCurrentWorkspace':
      return this.workspace

    case 'fileManager.exists':
      const filePath = args[0]
      return this.files.hasOwnProperty(filePath)

    case 'fileManager.getFile':
      const getFilePath = args[0]
      return this.files[getFilePath] || ''

    default:
      throw new Error(`Mock: Unhandled call ${module}.${method}`)
    }
  }

  setFile(path: string, content: string) {
    this.files[path] = content
  }

  private extractSolidityCode(input: string): string {
    // Look for ```solidity code blocks
    const solidityBlockRegex = /```solidity\s*\n([\s\S]*?)\n```/g
    const matches = input.match(solidityBlockRegex)

    if (matches && matches.length > 0) {
      // Extract content between ```solidity and ```
      return matches.map(match => {
        return match.replace(/```solidity\s*\n/, '').replace(/\n```$/, '')
      }).join('\n')
    }

    // If no solidity blocks found, return original input
    return input
  }
}

// Test data
const SIMPLE_CONTRACT = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SimpleStorage {
    uint256 public value;
    
    function setValue(uint256 _value) public {
        value = _value;
    }
    
    function getValue() public view returns (uint256) {
        return value;
    }
}
`

const ERC20_CONTRACT = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MyToken is ERC20, Ownable {
    constructor() ERC20("MyToken", "MTK") {
        _mint(msg.sender, 1000000 * 10**18);
    }
    
    function transfer(address to, uint256 amount) public override returns (bool) {
        return super.transfer(to, amount);
    }
    
    function balanceOf(address account) public view override returns (uint256) {
        return super.balanceOf(account);
    }
}
`

const PROXY_CONTRACT = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract UpgradeableToken is ERC20Upgradeable, UUPSUpgradeable {
    function initialize() public initializer {
        __ERC20_init("UpgradeableToken", "UTK");
        __UUPSUpgradeable_init();
    }
    
    function _authorizeUpgrade(address newImplementation) internal override {}
}
`

tape('ContractClassifierHandler', function (t) {

  t.test('should validate input correctly', function (st) {
    const handler = new ContractClassifierHandler()

    // Test valid input
    st.equal(handler.validate({ filePath: 'test.sol' }), true, 'Valid .sol file should pass')

    // Test invalid inputs
    st.equal(typeof handler.validate({} as any), 'string', 'Missing filePath should fail')
    st.equal(typeof handler.validate({ filePath: 'test.js' }), 'string', 'Non-.sol file should fail')
    st.equal(typeof handler.validate({ filePath: 123 as any }), 'string', 'Non-string filePath should fail')

    st.end()
  })

  t.test('should classify simple storage contract', async function (st) {
    const handler = new ContractClassifierHandler()
    const mockPlugin = new MockPlugin()

    // Setup mock file
    mockPlugin.setFile('SimpleStorage.sol', SIMPLE_CONTRACT)

    // Execute classification
    const result = await handler.execute({ filePath: 'SimpleStorage.sol' }, mockPlugin as any)
    st.false(result.isError, 'Should execute successfully')
    st.equal(result.content[0]?.type, 'text', 'Should return text content')

    const data = JSON.parse(result.content[0]?.text || '{}')
    st.true(data.success, 'Should indicate success')
    st.equal(data.classification.solidity_version, '0.8.0', 'Should detect Solidity version')
    st.false(data.classification.has_erc20, 'Simple contract should not be classified as ERC20')
    st.false(data.classification.has_proxy, 'Simple contract should not be classified as proxy')
    st.equal(data.classification.oz_version, 'unknown', 'Should not detect OpenZeppelin')

    st.end()
  })

  t.test('should classify ERC20 token contract', async function (st) {
    const handler = new ContractClassifierHandler()
    const mockPlugin = new MockPlugin()

    // Setup mock file
    mockPlugin.setFile('MyToken.sol', ERC20_CONTRACT)

    // Execute classification
    const result = await handler.execute({ filePath: 'MyToken.sol' }, mockPlugin as any)

    st.false(result.isError, 'Should execute successfully')

    const data = JSON.parse(result.content[0]?.text || '{}')
    st.true(data.success, 'Should indicate success')
    st.true(data.classification.has_erc20, 'Should detect ERC20 features')
    st.false(data.classification.has_proxy, 'Should not detect proxy features')
    st.equal(data.classification.oz_version, 'detected', 'Should detect OpenZeppelin usage')

    st.end()
  })

  t.test('should classify upgradeable proxy contract', async function (st) {
    const handler = new ContractClassifierHandler()
    const mockPlugin = new MockPlugin()

    // Setup mock file
    mockPlugin.setFile('UpgradeableToken.sol', PROXY_CONTRACT)

    // Execute classification
    const result = await handler.execute({ filePath: 'UpgradeableToken.sol' }, mockPlugin as any)

    st.false(result.isError, 'Should execute successfully')

    const data = JSON.parse(result.content[0]?.text || '{}')
    st.true(data.success, 'Should indicate success')
    st.true(data.classification.has_erc20, 'Should detect ERC20 features')
    st.true(data.classification.has_proxy, 'Should detect proxy/upgradeable features')
    st.equal(data.classification.oz_version, 'detected', 'Should detect OpenZeppelin usage')

    st.end()
  })

  t.test('should handle non-existent file', async function (st) {
    const handler = new ContractClassifierHandler()
    const mockPlugin = new MockPlugin()

    // Execute classification on non-existent file
    const result = await handler.execute({ filePath: 'NonExistent.sol' }, mockPlugin as any)

    st.true(result.isError, 'Should return error for non-existent file')
    st.true(result.content[0]?.text?.includes('not found'), 'Error message should mention file not found')

    st.end()
  })

  t.test('should handle empty file', async function (st) {
    const handler = new ContractClassifierHandler()
    const mockPlugin = new MockPlugin()

    // Setup empty file
    mockPlugin.setFile('Empty.sol', '')

    // Execute classification
    const result = await handler.execute({ filePath: 'Empty.sol' }, mockPlugin as any)

    st.true(result.isError, 'Should return error for empty file')
    st.true(result.content[0]?.text?.includes('empty'), 'Error message should mention empty file')

    st.end()
  })
})

tape('ContractSkeletonExtractor', function (t) {

  t.test('should extract contract skeleton correctly', function (st) {
    const skeleton = ContractSkeletonExtractor.extractSkeleton(ERC20_CONTRACT)

    st.equal(skeleton.pragma.length, 1, 'Should extract pragma statements')
    st.true(skeleton.pragma[0].includes('0.8.0'), 'Should extract Solidity version')

    st.equal(skeleton.imports.length, 2, 'Should extract import statements')
    st.true(skeleton.imports.some(imp => imp.includes('ERC20.sol')), 'Should extract ERC20 import')

    st.true(skeleton.inheritance.length > 0, 'Should extract contract declarations')
    st.true(skeleton.inheritance.some(inh => inh.includes('ERC20')), 'Should extract inheritance')

    st.true(skeleton.functionSignatures.length > 0, 'Should extract function signatures')
    st.true(skeleton.functionSignatures.some(fn => fn.includes('transfer')), 'Should extract transfer function')

    st.end()
  })

  t.test('should handle contract without imports', function (st) {
    const skeleton = ContractSkeletonExtractor.extractSkeleton(SIMPLE_CONTRACT)

    st.equal(skeleton.pragma.length, 1, 'Should extract pragma statements')
    st.equal(skeleton.imports.length, 0, 'Should handle no imports')
    st.true(skeleton.inheritance.length > 0, 'Should extract contract declaration')
    st.true(skeleton.functionSignatures.length >= 2, 'Should extract function signatures')

    st.end()
  })

  t.test('should convert skeleton to string format', function (st) {
    const skeleton = ContractSkeletonExtractor.extractSkeleton(SIMPLE_CONTRACT)
    const skeletonString = ContractSkeletonExtractor.skeletonToString(skeleton)

    st.true(typeof skeletonString === 'string', 'Should return string')
    st.true(skeletonString.includes('PRAGMA'), 'Should include section headers')
    st.true(skeletonString.includes('CONTRACT DECLARATION'), 'Should include contract section')
    st.true(skeletonString.includes('FUNCTION SIGNATURES'), 'Should include functions section')

    st.end()
  })
})