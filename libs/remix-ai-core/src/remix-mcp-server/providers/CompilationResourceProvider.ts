/**
 * Compilation Resource Provider - Provides access to compilation results and artifacts
 */

import { Plugin } from '@remixproject/engine';
import { IMCPResource, IMCPResourceContent } from '../../types/mcp';
import { BaseResourceProvider } from '../registry/RemixResourceProviderRegistry';
import { ResourceCategory } from '../types/mcpResources';

export class CompilationResourceProvider extends BaseResourceProvider {
  name = 'compilation';
  description = 'Provides access to compilation results, artifacts, and contract metadata';
  private _plugin

  constructor (plugin){
    super()
    this._plugin = plugin
  }
  async getResources(plugin: Plugin): Promise<IMCPResource[]> {
    const resources: IMCPResource[] = [];

    try {
      // Add compilation results
      resources.push(
        this.createResource(
          'compilation://latest',
          'Latest Compilation Result',
          'Most recent compilation output with contracts and errors',
          'application/json',
          {
            category: ResourceCategory.COMPILATION_RESULTS,
            tags: ['compilation', 'latest', 'results'],
            priority: 9
          }
        )
      );

      resources.push(
        this.createResource(
          'compilation://contracts',
          'Compiled Contracts',
          'All successfully compiled contracts with metadata',
          'application/json',
          {
            category: ResourceCategory.COMPILATION_RESULTS,
            tags: ['contracts', 'abi', 'bytecode'],
            priority: 8
          }
        )
      );

      resources.push(
        this.createResource(
          'compilation://errors',
          'Compilation Errors',
          'Latest compilation errors and warnings',
          'application/json',
          {
            category: ResourceCategory.COMPILATION_RESULTS,
            tags: ['errors', 'warnings', 'diagnostics'],
            priority: 7
          }
        )
      );

      resources.push(
        this.createResource(
          'compilation://artifacts',
          'Build Artifacts',
          'Compilation artifacts and build outputs',
          'application/json',
          {
            category: ResourceCategory.COMPILATION_RESULTS,
            tags: ['artifacts', 'build', 'output'],
            priority: 6
          }
        )
      );

      resources.push(
        this.createResource(
          'compilation://dependencies',
          'Compilation Dependencies',
          'Contract dependencies and import graph',
          'application/json',
          {
            category: ResourceCategory.COMPILATION_RESULTS,
            tags: ['dependencies', 'imports', 'graph'],
            priority: 5
          }
        )
      );

      resources.push(
        this.createResource(
          'compilation://config',
          'Compiler Configuration',
          'Current compiler settings and configuration',
          'application/json',
          {
            category: ResourceCategory.COMPILATION_RESULTS,
            tags: ['config', 'compiler', 'settings'],
            priority: 5
          }
        )
      );

      // Add individual contract resources if available
      await this.addContractResources(plugin, resources);

    } catch (error) {
      console.warn('Failed to get compilation resources:', error);
    }

    return resources;
  }

  async getResourceContent(uri: string, plugin: Plugin): Promise<IMCPResourceContent> {
    if (uri === 'compilation://latest') {
      return this.getLatestCompilationResult(plugin);
    }

    if (uri === 'compilation://contracts') {
      return this.getCompiledContracts(plugin);
    }

    if (uri === 'compilation://errors') {
      return this.getCompilationErrors(plugin);
    }

    if (uri === 'compilation://artifacts') {
      return this.getBuildArtifacts(plugin);
    }

    if (uri === 'compilation://dependencies') {
      return this.getCompilationDependencies(plugin);
    }

    if (uri === 'compilation://config') {
      return this.getCompilerConfig(plugin);
    }

    if (uri.startsWith('contract://')) {
      return this.getContractDetails(uri, plugin);
    }

    throw new Error(`Unsupported compilation resource URI: ${uri}`);
  }

  canHandle(uri: string): boolean {
    return uri.startsWith('compilation://') || uri.startsWith('contract://');
  }

  private async addContractResources(plugin: Plugin, resources: IMCPResource[]): Promise<void> {
    try {
      // TODO: Get actual compilation result from Remix API
      const mockContracts = ['MyToken', 'TokenSale', 'Ownable']; // Mock data

      for (const contractName of mockContracts) {
        resources.push(
          this.createResource(
            `contract://${contractName}`,
            `${contractName} Contract`,
            `Detailed information about ${contractName} contract`,
            'application/json',
            {
              category: ResourceCategory.COMPILATION_RESULTS,
              tags: ['contract', contractName.toLowerCase(), 'details'],
              contractName,
              priority: 4
            }
          )
        );
      }
    } catch (error) {
      console.warn('Failed to add contract resources:', error);
    }
  }

  private async getLatestCompilationResult(plugin: Plugin): Promise<IMCPResourceContent> {
    try {
      const compilationResult: any = await plugin.call('solidity' as any, 'getCompilationResult')
      if (!compilationResult) {
        return this.createTextContent('compilation://latest', `Error getting compilation result`);
      }

      const result = {
        success: !compilationResult.data?.errors || compilationResult.data?.errors.length === 0 || !compilationResult.data?.error,
        timestamp: new Date().toISOString(),
        contracts: {},
        errors: compilationResult.data?.errors || [],
        errorFiles: compilationResult.errFiles || [],
        warnings: compilationResult?.data?.errors.find((error) => error.type === 'Warning') || [],
        sources: compilationResult?.source || {}
      };

      // Process contracts
      if (compilationResult.data?.contracts) {
        for (const [fileName, fileContracts] of Object.entries(compilationResult.contracts)) {
          for (const [contractName, contractData] of Object.entries(fileContracts as any)) {
            const contract = contractData as any;
            result.contracts[`${fileName}:${contractName}`] = {
              abi: contract.abi || [],
              // bytecode: contract.evm?.bytecode?.object || '',
              // deployedBytecode: contract.evm?.deployedBytecode?.object || '',
              // metadata: contract.metadata ? JSON.parse(contract.metadata) : {},
              gasEstimates: contract.evm?.gasEstimates || {}
            };
          }
        }
      }
      return this.createJsonContent('compilation://latest', result);
    } catch (error) {
      return this.createTextContent('compilation://latest', `Error getting compilation result: ${error.message}`);
    }
  }

  private async getCompiledContracts(plugin: Plugin): Promise<IMCPResourceContent> {
    try {
      const compiledContracts = await plugin.call('compilerArtefacts', 'getAllContractDatas')

      // Filter to only include abi and metadata for each contract
      const filteredContracts = {};
      for (const [fileName, fileContracts] of Object.entries(compiledContracts)) {
        filteredContracts[fileName] = {};
        for (const [contractName, contractData] of Object.entries(fileContracts as any)) {
          const contract = contractData as any;
          filteredContracts[fileName][contractName] = {
            abi: contract.abi,
            metadata: contract.metadata
          };
        }
      }

      return this.createJsonContent('compilation://contracts', {
        compiledContracts: filteredContracts,
        count: Object.keys(filteredContracts).length,
        generatedAt: new Date().toISOString()
      });
    } catch (error) {
      return this.createTextContent('compilation://contracts', `Error getting contracts: ${error.message}`);
    }
  }

  private async getCompilationErrors(plugin: Plugin): Promise<IMCPResourceContent> {
    try {
      const compilationResult: any = await plugin.call('solidity' as any, 'getCompilationResult')
      if (!compilationResult) {
        return this.createTextContent('compilation://errors', `Error getting compilation errors`);
      }

      const errors = compilationResult.data.errors || []
      return this.createJsonContent('compilation://errors', errors);
    } catch (error) {
      return this.createTextContent('compilation://errors', `Error getting compilation errors: ${error.message}`);
    }
  }

  private async getBuildArtifacts(plugin: Plugin): Promise<IMCPResourceContent> {
    try {
      const artifacts_path = 'artifacts/build-info'
      const artifacts = []
      const artifacts_exists = await plugin.call('fileManager', 'exists', artifacts_path)
      if (!artifacts_exists) {
        return this.createTextContent('compilation://errors', `Error getting build artifacts. No contract has been compiled or the folder might not exist yet`);
      }

      const buildFileList = await plugin.call('fileManager', 'fileList', artifacts_path)
      for (const buildFile of buildFileList) {
        let content = await plugin.call('fileManager', 'readFile', buildFile)
        if (content) content = JSON.parse(content)
        if (content) artifacts.push(content)
      }

      return this.createJsonContent('compilation://artifacts', artifacts);
    } catch (error) {
      return this.createTextContent('compilation://artifacts', `Error getting build artifacts: ${error.message}`);
    }
  }

  private async getCompilationDependencies(plugin: Plugin): Promise<IMCPResourceContent> {
    try {
      return this.createTextContent('compilation://dependencies', "Dependencies resolvance not implemented yet!");
    } catch (error) {
      return this.createTextContent('compilation://dependencies', `Error getting dependencies: ${error.message}`);
    }
  }

  private async getCompilerConfig(plugin: Plugin): Promise<IMCPResourceContent> {
    try {
      const compilerConfig = await plugin.call('solidity' as any , 'getCurrentCompilerConfig');
      let config: any;
      if (compilerConfig) {
        config = compilerConfig;
      } else {
        config = {
          version: 'latest',
          optimize: true,
          runs: 200,
          evmVersion: 'london',
          language: 'Solidity'
        };
      }
      return this.createJsonContent('compilation://config', config);
    } catch (error) {
      return this.createTextContent('compilation://config', `Error getting compiler config: ${error.message}`);
    }
  }

  private async getContractDetails(uri: string, plugin: Plugin): Promise<IMCPResourceContent> {
    const contractName = uri.replace('contract://', '');

    try {
      const compilationResult: any = await plugin.call('solidity' as any, 'getCompilationResult')
      if (!compilationResult) {
        return this.createTextContent(uri, 'No compilation result available');
      }

      let contractDetails = {}
      for (const contractFileObj of compilationResult.data.contracts) {
        if (Object.keys(contractFileObj).includes(contractName)) contractDetails = contractFileObj
      }
      return this.createJsonContent(uri, contractDetails);
    } catch (error) {
      return this.createTextContent(uri, `Error getting contract details: ${error.message}`);
    }
  }
}