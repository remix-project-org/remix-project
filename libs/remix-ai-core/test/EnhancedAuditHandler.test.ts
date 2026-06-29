/* eslint-disable no-prototype-builtins */
/* eslint-disable no-case-declarations */
/**
 * Unit tests for EnhancedAuditHandler
 */

import tape from 'tape'
import { EnhancedAuditHandler, SlitherDetector } from '../src/remix-mcp-server/handlers/EnhancedAuditHandler'

// Mock Plugin for testing
class MockPlugin {
  private files: { [key: string]: string } = {}
  private workspace = { name: 'default_workspace' }
  private compilationData: any = null
  private slitherResponse: any = null

  async call(module: string, method: string, ...args: any[]): Promise<any> {
    switch (`${module}.${method}`) {
    case 'filePanel.getCurrentWorkspace':
      return this.workspace

    case 'fileManager.exists':
      // eslint-disable-next-line no-case-declarations
      const filePath = args[0]
      return this.files.hasOwnProperty(filePath)

    case 'fileManager.getFile':
      // eslint-disable-next-line no-case-declarations
      const getFilePath = args[0]
      return this.files[getFilePath] || ''

    case 'compilerArtefacts.getCompilerAbstract':
      return this.compilationData

    case 'solidity.getCurrentCompilerConfig':
      return { currentVersion: '0.8.19' }

    case 'contractflattener.flattenContract':
      return this.files[args[1]] || ''

    default:
      throw new Error(`Mock: Unhandled call ${module}.${method}`)
    }
  }

  setFile(path: string, content: string) {
    this.files[path] = content
  }

  setCompilation(data: any) {
    this.compilationData = data
  }

  setSlitherResponse(response: any) {
    this.slitherResponse = response
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
const SAMPLE_CONTRACT = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestToken is ERC20 {
    constructor() ERC20("Test", "TEST") {
        _mint(msg.sender, 1000000 * 10**18);
    }
    
    function transfer(address to, uint256 amount) public override returns (bool) {
        return super.transfer(to, amount);
    }
}
`
const STORAGE_SAMPLE_CONTRACT = `// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

/**
 * @title Storage
 * @dev Store & retrieve value in a variable
 * @custom:dev-run-script ./scripts/deploy_with_ethers.ts
 */
contract Storage {

    uint256 number;

    /**
     * @dev Store value in variable
     * @param num value to store
     */
    function store(uint256 num) public {
        number = num;
    }

    /**
     * @dev Return value 
     * @return value of 'number'
     */
    function retrieve() public view returns (uint256){
        return number;
    }
}`

const MOCK_SLITHER_DETECTORS: SlitherDetector[] = [
  {
    impact: 'Medium',
    confidence: 'High',
    check: 'unchecked-transfer',
    description: 'Transfer return value not checked',
    elements: [],
    id: 'test-1',
    markdown: 'Transfer without check'
  },
  {
    impact: 'Low',
    confidence: 'Medium',
    check: 'timestamp',
    description: 'Block timestamp used',
    elements: [],
    id: 'test-2',
    markdown: 'Timestamp usage'
  }
]

tape('EnhancedAuditHandler', function (t) {

  t.test('should validate input correctly', function (st) {
    const handler = new EnhancedAuditHandler()

    // Test valid input
    st.equal(handler.validate({ filePath: 'test.sol' }), true, 'Valid .sol file should pass')

    // Test with optional parameters
    st.equal(
      handler.validate({
        filePath: 'test.sol',
        includeOptimizations: true,
        minSeverity: 'High'
      }),
      true,
      'Valid input with optional params should pass'
    )

    // Test invalid inputs
    st.equal(typeof handler.validate({} as any), 'string', 'Missing filePath should fail')
    st.equal(typeof handler.validate({ filePath: 'test.js' }), 'string', 'Non-.sol file should fail')
    st.equal(
      typeof handler.validate({ filePath: 'test.sol', minSeverity: 'Invalid' }),
      'string',
      'Invalid severity should fail'
    )

    st.end()
  })

  t.test('should perform enhanced audit successfully', async function (st) {
    const handler = new EnhancedAuditHandler()
    const mockPlugin = new MockPlugin()

    // Setup mock data
    mockPlugin.setFile('TestToken.sol', STORAGE_SAMPLE_CONTRACT)
    mockPlugin.setCompilation({
      source: { sources: { 'TestToken.sol': { content: STORAGE_SAMPLE_CONTRACT } } },
      data: {},
      input: {}
    })

    // Override SlitherHandler to use mock
    /*
    const mockSlitherHandler = new MockSlitherHandler()
    mockSlitherHandler.setMockResult({ detectors: MOCK_SLITHER_DETECTORS })
    */
    // Mock the SlitherHandler instantiation
    /*
    const originalHandler = handler as any
    originalHandler.runSlitherAnalysisWithCodeHandler = async () => {
      return {
        success: true,
        fileName: 'TestToken.sol',
        scanCompletedAt: new Date().toISOString(),
        analysis_result: {
          results: { detectors: MOCK_SLITHER_DETECTORS }
        }
      }
    }*/

    // Execute enhanced audit
    const result = await handler.execute({
      filePath: 'TestToken.sol',
      includeOptimizations: false,
      minSeverity: 'Low'
    }, mockPlugin as any)

    st.false(result.isError, 'Should execute successfully')
    st.equal(result.content[0]?.type, 'text', 'Should return text content')

    const data = JSON.parse(result.content[0]?.text || '{}')
    st.true(data.success, 'Should indicate success')
    st.equal(data.fileName, 'TestToken.sol', 'Should set correct filename')

    // Verify classification
    st.true(data.classification.success, 'Classification should succeed')
    st.true(data.classification.classification.has_erc20, 'Should detect ERC20 features')

    // Verify raw metrics
    st.equal(data.rawMetrics.totalSlitherFindings, 2, 'Should count Slither findings')
    st.equal(data.rawMetrics.slitherFindingsBySeverity.Medium, 1, 'Should count medium severity findings')
    st.equal(data.rawMetrics.slitherFindingsBySeverity.Low, 1, 'Should count low severity findings')

    // Verify checklist metrics
    st.true(data.rawMetrics.checklistMetrics.totalItems > 0, 'Should have checklist items')

    // Verify contract features
    st.true(Array.isArray(data.rawMetrics.contractFeatures.complexityIndicators), 'Should have complexity indicators')
    st.true(Array.isArray(data.rawMetrics.contractFeatures.riskFactors), 'Should have risk factors')

    st.end()
  })

  t.test('should handle file not found error', async function (st) {
    const handler = new EnhancedAuditHandler()
    const mockPlugin = new MockPlugin()

    // Execute audit on non-existent file
    const result = await handler.execute({ filePath: 'NonExistent.sol' }, mockPlugin as any)

    st.true(result.isError, 'Should return error for non-existent file')
    st.true(result.content[0]?.text?.includes('not found'), 'Error message should mention file not found')

    st.end()
  })

  t.test('should handle compilation failure gracefully', async function (st) {
    const handler = new EnhancedAuditHandler()
    const mockPlugin = new MockPlugin()

    // Setup mock data without compilation
    mockPlugin.setFile('TestToken.sol', SAMPLE_CONTRACT)
    // Don't set compilation data to simulate compilation failure

    // Mock SlitherHandler to fail
    const originalHandler = handler as any
    originalHandler.runSlitherAnalysisWithCodeHandler = async () => null

    // Execute enhanced audit
    const result = await handler.execute({ filePath: 'TestToken.sol' }, mockPlugin as any)

    st.false(result.isError, 'Should still execute successfully even without Slither')

    const data = JSON.parse(result.content[0]?.text || '{}')
    st.true(data.success, 'Should indicate success')
    st.equal(data.slitherScanResult, null, 'Should handle failed Slither scan')
    st.equal(data.rawMetrics.totalSlitherFindings, 0, 'Should have zero Slither findings')

    st.end()
  })

  t.test('should extract Slither detectors correctly', async function (st) {
    const handler = new EnhancedAuditHandler() as any

    // Test with valid Slither result
    const slitherResult = {
      success: true,
      fileName: 'test.sol',
      scanCompletedAt: new Date().toISOString(),
      analysis_result: {
        results: { detectors: MOCK_SLITHER_DETECTORS }
      }
    }

    const detectors = handler.extractSlitherDetectors(slitherResult)
    st.equal(detectors.length, 2, 'Should extract correct number of detectors')
    st.equal(detectors[0].check, 'unchecked-transfer', 'Should extract detector details')
    st.equal(detectors[1].impact, 'Low', 'Should extract severity information')

    // Test with null result
    const nullDetectors = handler.extractSlitherDetectors(null)
    st.equal(nullDetectors.length, 0, 'Should return empty array for null input')

    // Test with malformed result
    const malformedResult = {
      success: true,
      fileName: 'test.sol',
      analysis_result: 'invalid json'
    }

    const malformedDetectors = handler.extractSlitherDetectors(malformedResult)
    st.equal(malformedDetectors.length, 0, 'Should handle malformed analysis result')

    st.end()
  })

  t.test('should generate raw metrics correctly', async function (st) {
    const handler = new EnhancedAuditHandler() as any

    // Mock classification result
    const classification = {
      success: true,
      fileName: 'test.sol',
      classification: {
        has_proxy: false,
        has_erc20: true,
        has_erc721: false,
        has_amm_swap: false,
        has_lending: false,
        has_oracle: false,
        has_governance: false,
        has_create_opcode: false,
        has_cross_chain: false,
        has_staking: false,
        solidity_version: '0.8.0',
        oz_version: 'detected'
      }
    }

    // Mock Slither result
    const slitherResult = {
      success: true,
      fileName: 'test.sol',
      analysis_result: {
        results: { detectors: MOCK_SLITHER_DETECTORS }
      }
    }

    // Mock checklist result
    const checklistResult = {
      totalItems: 50,
      slitherTriggeredItems: [],
      aiOnlyItems: [],
      filteredCategories: ['Security', 'Token'],
      filterSummary: {
        appliedStaticFilters: [],
        slitherDetectorsMatched: [],
        itemsFilteredOut: 0
      }
    }

    const metrics = handler.generateRawMetrics(classification, slitherResult, checklistResult)

    st.equal(metrics.totalSlitherFindings, 2, 'Should count total findings')
    st.equal(metrics.slitherFindingsBySeverity.Medium, 1, 'Should count medium findings')
    st.equal(metrics.slitherFindingsBySeverity.Low, 1, 'Should count low findings')
    st.equal(metrics.checklistMetrics.totalItems, 50, 'Should include checklist metrics')
    st.true(Array.isArray(metrics.contractFeatures.complexityIndicators), 'Should include complexity indicators')
    st.true(typeof metrics.analysisContext.solidityVersion === 'string', 'Should include analysis context')

    st.end()
  })
})