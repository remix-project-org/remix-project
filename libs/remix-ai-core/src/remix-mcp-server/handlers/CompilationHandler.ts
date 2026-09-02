import { remixAILogger } from '../../helpers/logger'
/**
 * Compilation Tool Handlers for Remix MCP Server
 */

import { CompilerAbstract } from '@remix-project/remix-solidity';
import { IMCPToolResult } from '../../types/mcp';
import { BaseToolHandler } from '../registry/RemixToolRegistry';
import {
  ToolCategory,
  RemixToolDefinition,
  SolidityCompileArgs,
  CompilerConfigArgs,
  CompilationResult
} from '../types/mcpTools';
import { Plugin } from '@remixproject/engine';
import isElectron from 'is-electron';
import { fetchContractFromEtherscan, Network } from '@remix-project/core-plugin' // eslint-disable-line

/** Every .sol file in the workspace, depth-limited so a deep tree can't stall a tool call. */
async function listSolidityFiles(plugin: Plugin, dir = '/', depth = 0): Promise<string[]> {
  if (depth > 3) return [];
  let entries: Record<string, any> = {};
  try {
    entries = await plugin.call('fileManager', 'readdir', dir);
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const name of Object.keys(entries ?? {})) {
    // readdir keys are sometimes already full paths (see DirectoryListHandler).
    const full = name.includes('/') ? name : (dir === '/' ? name : `${dir}/${name}`);
    let isDir = entries[name]?.isDirectory;
    if (isDir === undefined) {
      try {
        isDir = await plugin.call('fileManager', 'isDirectory', full);
      } catch {
        isDir = false;
      }
    }
    if (isDir) found.push(...await listSolidityFiles(plugin, full, depth + 1));
    else if (full.endsWith('.sol')) found.push(full);
  }
  return found;
}

/**
 * Resolve the path the model asked for against what the workspace actually has.
 */
async function resolveSolidityPath(
  plugin: Plugin,
  requested: string
): Promise<{ path?: string; candidates?: string[] }> {
  const attempts = [requested, requested.replace(/^\/+/, ''), `/${requested.replace(/^\/+/, '')}`];
  for (const attempt of attempts) {
    if (!attempt) continue;
    try {
      if (await plugin.call('fileManager', 'exists', attempt)) return { path: attempt };
    } catch { /* fileManager unavailable for this path — try the next spelling */ }
  }
  const all = await listSolidityFiles(plugin);
  const wanted = requested.split('/').pop()?.toLowerCase();
  const byName = all.find((f) => f.split('/').pop()?.toLowerCase() === wanted);
  return byName ? { path: byName } : { candidates: all };
}

/**
 * Solidity Compile Tool Handler
 */
export class SolidityCompileHandler extends BaseToolHandler {
  name = 'solidity_compile';
  description = 'Compile one Solidity file. Reads the source itself — never read_file first.';
  inputSchema = {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Workspace-relative path, e.g. contracts/Token.sol. No leading slash.'
      },
      version: {
        type: 'string',
        description: 'e.g. 0.8.30',
        default: 'latest'
      },
      optimize: {
        type: 'boolean',
        description: 'Run the optimizer.',
        default: true
      },
      runs: {
        type: 'number',
        description: 'Optimizer runs, 1-10000.',
        default: 200
      },
      evmVersion: {
        type: 'string',
        description: 'EVM version target',
        enum: ['osaka', 'london', 'berlin', 'istanbul', 'petersburg', 'constantinople', 'byzantium'],
        default: 'london'
      }
    },
    required: ['filePath']
  };

  getPermissions(): string[] {
    return ['compile:solidity'];
  }

  validate(args: SolidityCompileArgs): boolean | string {
    // This used to type-check a `file` key the schema never declared, so the
    // one required argument went unvalidated.
    const types = this.validateTypes(args, {
      filePath: 'string',
      version: 'string',
      optimize: 'boolean',
      runs: 'number',
      evmVersion: 'string'
    });
    if (types !== true) return types;

    if (typeof args.filePath !== 'string' || args.filePath.trim() === '') {
      return 'filePath is required — pass the workspace path of the .sol file to compile';
    }
    if (!args.filePath.endsWith('.sol')) {
      return `filePath must point at a Solidity file (.sol), got '${args.filePath}'`;
    }

    if (args.runs !== undefined && (args.runs < 1 || args.runs > 10000)) {
      return 'Optimization runs must be between 1 and 10000';
    }

    return true;
  }

  async execute(args: SolidityCompileArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      let compilerConfig: any = {};
      // The path actually compiled, after resolution below.
      let filePath = args.filePath;

      await plugin.call('sidePanel', 'showContent', 'solidity')

      try {
        // Try to get existing compiler config
        compilerConfig = await plugin.call('solidity' as any , 'getCurrentCompilerConfig');
      } catch (error) {
        compilerConfig = {
          version: args.version || 'latest',
          optimize: args.optimize !== undefined ? args.optimize : true,
          runs: args.runs || 200,
          evmVersion: args.evmVersion || 'london',
          language: 'Solidity'
        };
      }

      let compilationResult: any;
      if (args.filePath) {
        const resolved = await resolveSolidityPath(plugin, args.filePath)
        if (!resolved.path) {
          return this.createErrorResult(
            `File not found: '${args.filePath}'. ` +
            (resolved.candidates?.length
              ? `Solidity files in this workspace: ${resolved.candidates.join(', ')}. Call solidity_compile again with one of these paths.`
              : 'This workspace contains no .sol files.')
          );
        }
        // Compile whatever the workspace actually calls this file — the model's
        // spelling is only a request.
        filePath = resolved.path
        await plugin.call('solidity' as any, 'compile', filePath) // this will enable the UI
        // Compile specific file - need to use plugin API or direct compilation
        const content = await plugin.call('fileManager', 'readFile', filePath);
        const contract = {}
        contract[filePath] = { content: content }
        const compilerPayload: CompilerAbstract = await plugin.call('solidity' as any, 'compileWithParameters', contract, compilerConfig)
        const errors = compilerPayload.getErrors(false)
        remixAILogger.log('Compilation errors:', errors)
        if (errors && errors.length > 0) {
          return this.createErrorResult(`Compilation failed with errors: ${errors.map((e) => e.formattedMessage).join('; ')}`);
        }
        compilationResult = compilerPayload
      } else {
        return this.createErrorResult(`Compilation failed: Workspace compilation not yet implemented. The argument file is not provided`);
      }
      plugin.call('compilerArtefacts', 'saveCompilerAbstract', filePath, compilationResult)
      // Process compilation result
      const result: CompilationResult = {
        success: !compilationResult.data?.errors || compilationResult.data?.errors.length === 0 || !compilationResult.data?.error,
        contracts: {},
        errors: compilationResult.data.errors || [],
        errorFiles: compilationResult?.errFiles || [],
        warnings: [], //compilationResult?.data?.errors.find((error) => error.type === 'Warning') || [],
        // sources: compilationResult?.source.sources[args.file] || {}
      };

      // Emit compilationFinished event with correct parameters to trigger UI effects
      plugin.emit('compilationFinished',
        filePath, // source target
        { sources: compilationResult?.source || {} }, // source files
        'soljson', // compiler type
        compilationResult.data, // compilation data
        { sources: compilationResult?.source || {} }, // input
        compilerConfig.version || 'latest' // version
      )

      if (compilationResult.data?.contracts) {
        for (const [fileName, fileContracts] of Object.entries(compilationResult.data.contracts)) {
          for (const [contractName, contractData] of Object.entries(fileContracts as any)) {
            const contract = contractData as any;
            if (fileName.includes(filePath)){
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
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
      return this.createSuccessResult(result);
    } catch (error) {
      return this.createErrorResult(`Compilation failed: ${error.message}`);
    }
  }
}

/**
 * Get Compilation Result Tool Handler
 */
export class GetCompilationResultHandler extends BaseToolHandler {
  name = 'get_compilation_result';
  description = 'Last compilation result: ABIs, bytecode and errors.';
  inputSchema = {
    type: 'object',
    properties: {}
  };

  getPermissions(): string[] {
    return ['compile:read'];
  }

  async execute(args: any, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const compilationResult: any = await plugin.call('solidity' as any, 'getCompilationResult')
      if (!compilationResult) {
        return this.createErrorResult('No compilation result available');
      }

      const result: CompilationResult = {
        success: !compilationResult.data?.errors || compilationResult.data?.errors.length === 0 || !compilationResult.data?.error,
        contracts: { 'target': compilationResult.source?.target },
        errors: compilationResult?.data?.errors || [],
        errorFiles: compilationResult?.errFiles || [],
        warnings: [], //compilationResult?.data?.errors.find((error) => error.type === 'Warning') || [],
        // sources: compilationResult?.source || {}
      };

      if (compilationResult.data?.contracts) {
        for (const [fileName, fileContracts] of Object.entries(compilationResult.data.contracts)) {
          for (const [contractName, contractData] of Object.entries(fileContracts as any)) {
            const contract = contractData as any;
            if (fileName.includes(result.contracts['target'] as string)){
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
      }

      return this.createSuccessResult(result);
    } catch (error) {
      return this.createErrorResult(`Failed to get compilation result: ${error.message}`);
    }
  }
}

/**
 * Get Compilation Result Tool Handler
 */
export class GetCompilationResultByFilePathHandler extends BaseToolHandler {
  name = 'get_compilation_result_sources_by_file_path';
  description = 'Compiled sources and AST for one already-compiled file.';
  inputSchema = {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Workspace-relative path of the compiled file.'
      }
    },
    required: ['filePath']
  };

  getPermissions(): string[] {
    return ['compile:read'];
  }

  async execute(args: any, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const compilationResult: any = await plugin.call('compilerArtefacts' as any, 'getCompilerAbstract', args.filePath)
      if (!compilationResult) {
        return this.createErrorResult('No compilation result available for the specified file path');
      }
      if (!compilationResult.source) {
        return this.createErrorResult('No compilation result available for the specified file path');
      }
      if (!compilationResult.source.sources) {
        return this.createErrorResult('No compilation result available for the specified file path');
      }

      remixAILogger.log('get_compilation_result_sources_by_file_path', compilationResult.source.sources)

      return this.createSuccessResult(compilationResult.source.sources);
    } catch (error) {
      return this.createErrorResult(`Failed to get compilation result: ${error.message}`);
    }
  }
}

/**
 * Set Compiler Config Tool Handler
 */
export class SetCompilerConfigHandler extends BaseToolHandler {
  name = 'set_compiler_config';
  description = 'Set the compiler settings used by later compilations.';
  inputSchema = {
    type: 'object',
    properties: {
      version: {
        type: 'string',
        description: 'Solidity version, e.g. 0.8.30. Use get_compiler_versions for the list.'
      },
      optimize: {
        type: 'boolean',
        description: 'Run the optimizer.'
      },
      runs: {
        type: 'number',
        description: 'Optimizer runs, 1-10000.'
      },
      evmVersion: {
        type: 'string',
        description: 'Default Osaka'
      },
      language: {
        type: 'string',
        description: 'Solidity or Yul.',
        default: 'Solidity'
      }
    },
    required: ['version']
  };

  getPermissions(): string[] {
    return ['compile:config'];
  }

  validate(args: CompilerConfigArgs): boolean | string {
    const required = this.validateRequired(args, ['version']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      version: 'string',
      optimize: 'boolean',
      runs: 'number',
      evmVersion: 'string',
      language: 'string'
    });
    if (types !== true) return types;

    return true;
  }

  async execute(args: CompilerConfigArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Resolve version to full compiler path (e.g., "0.8.20" -> "0.8.20+commit.a1b79de6.js")
      let resolvedVersion = args.version;

      try {
        const solJsonBinData = await plugin.call('compilerloader' as any, 'getJsonBinData');
        if (solJsonBinData) {
          // Check selectorList, wasmList, and binList for the version
          const lists = [
            ...(solJsonBinData.selectorList || []),
            ...(solJsonBinData.wasmList || []),
            ...(solJsonBinData.binList || [])
          ];

          // Try to find exact version match
          const versionEntry = lists.find((entry: any) => {
            if (!entry) return false;
            if (entry.version === args.version) return true;
            if (entry.longVersion === args.version) return true;
            if (entry.path === args.version) return true;
            return false;
          });

          if (versionEntry) {
            resolvedVersion = versionEntry.longVersion || args.version;
          }
        }
      } catch (resolveError) {
        remixAILogger.warn('Could not resolve compiler version:', resolveError.message);
      }

      const config = {
        version: resolvedVersion,
        optimize: args.optimize !== undefined ? args.optimize : true,
        runs: args.runs || 200,
        evmVersion: args.evmVersion || 'osaka',
        language: args.language || 'Solidity'
      };

      await plugin.call('solidity' as any, 'setCompilerConfig', config);

      return this.createSuccessResult({
        success: true,
        message: 'Compiler configuration updated',
        config: config,
        resolvedVersion: resolvedVersion
      });
    } catch (error) {
      return this.createErrorResult(`Failed to set compiler config: ${error.message}`);
    }
  }
}

/**
 * Get Compiler Config Tool Handler
 */
export class GetCompilerConfigHandler extends BaseToolHandler {
  name = 'get_compiler_config';
  description = 'Current compiler settings.';
  inputSchema = {
    type: 'object',
    properties: {}
  };

  getPermissions(): string[] {
    return ['compile:read'];
  }

  async execute(args: any, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      let config = await plugin.call('solidity' as any , 'getCurrentCompilerConfig');
      if (!config) {
        config = {
          version: 'latest',
          optimize: true,
          runs: 200,
          evmVersion: 'london',
          language: 'Solidity'
        };
      }

      return this.createSuccessResult({
        success: true,
        config: config
      });
    } catch (error) {
      return this.createErrorResult(`Failed to get compiler config: ${error.message}`);
    }
  }
}

/**
 * Compile with Hardhat Tool Handler
 */
export class CompileWithHardhatHandler extends BaseToolHandler {
  name = 'compile_with_hardhat';
  description = 'Compile the workspace with Hardhat. Needs remixd.';
  inputSchema = {
    type: 'object',
    properties: {
      configPath: {
        type: 'string',
        description: 'Path to hardhat.config.js file',
        default: 'hardhat.config.js'
      }
    }
  };

  getPermissions(): string[] {
    return ['compile:hardhat'];
  }

  validate(args: { configPath?: string }): boolean | string {
    const types = this.validateTypes(args, { configPath: 'string' });
    if (types !== true) return types;

    return true;
  }

  async execute(args: { configPath?: string }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const configPath = args.configPath || 'hardhat.config.js';

      // Check if hardhat config exists
      const exists = await plugin.call('fileManager', 'exists', configPath);
      if (!exists) {
        return this.createErrorResult(`Hardhat config file not found: ${configPath}`);
      }

      const result = await plugin.call('solidity' as any , 'compileWithHardhat', configPath);

      return this.createSuccessResult({
        success: true,
        message: 'Compiled with Hardhat successfully',
        result: result
      });
    } catch (error) {
      return this.createErrorResult(`Hardhat compilation failed: ${error.message}`);
    }
  }
}

/**
 * Compile with Foundry Tool Handler
 */
export class CompileWithFoundryHandler extends BaseToolHandler {
  name = 'compile_with_foundry';
  description = 'Compile the workspace with Foundry. Needs remixd.';
  inputSchema = {
    type: 'object',
    properties: {
      configPath: {
        type: 'string',
        description: 'Path to foundry.toml file',
        default: 'foundry.toml'
      }
    }
  };

  getPermissions(): string[] {
    return ['compile:foundry'];
  }

  validate(args: { configPath?: string }): boolean | string {
    const types = this.validateTypes(args, { configPath: 'string' });
    if (types !== true) return types;

    return true;
  }

  async execute(args: { configPath?: string }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const configPath = args.configPath || 'foundry.toml';

      // Check if hardhat config exists
      const exists = await plugin.call('fileManager', 'exists', configPath);
      if (!exists) {
        return this.createErrorResult(`Foundry config file not found: ${configPath}`);
      }

      const result = await plugin.call('solidity' as any , 'compileWithFoundry', configPath);

      return this.createSuccessResult({
        success: true,
        message: 'Compiled with Foundry successfully',
        result: result
      });
    } catch (error) {
      return this.createErrorResult(`Foundry compilation failed: ${error.message}`);
    }
  }
}

/**
 * Compile with Truffle Tool Handler
 */
export class CompileWithTruffleHandler extends BaseToolHandler {
  name = 'compile_with_truffle';
  description = 'Compile the workspace with Truffle. Needs remixd.';
  inputSchema = {
    type: 'object',
    properties: {
      configPath: {
        type: 'string',
        description: 'Path to truffle.config.js file',
        default: 'truffle.config.js'
      }
    }
  };

  getPermissions(): string[] {
    return ['compile:truffle'];
  }

  validate(args: { configPath?: string }): boolean | string {
    const types = this.validateTypes(args, { configPath: 'string' });
    if (types !== true) return types;

    return true;
  }

  async execute(args: { configPath?: string }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const configPath = args.configPath || 'truffle.config.js';

      // Check if truffle config exists
      const exists = await plugin.call('fileManager', 'exists', configPath);
      if (!exists) {
        return this.createErrorResult(`Truffle config file not found: ${configPath}`);
      }

      const result = await plugin.call('solidity' as any , 'compileWithTruffle', configPath);

      return this.createSuccessResult({
        success: true,
        message: 'Compiled with Truffle successfully',
        result: result
      });
    } catch (error) {
      return this.createErrorResult(`Truffle compilation failed: ${error.message}`);
    }
  }
}

/**
 * Get Available Compiler Versions Tool Handler
 */
export class GetCompilerVersionsHandler extends BaseToolHandler {
  name = 'get_compiler_versions';
  description = 'Available Solidity compiler versions.';
  inputSchema = {
    type: 'object',
    properties: {}
  };

  getPermissions(): string[] {
    return ['compile:read'];
  }

  async execute(_args: any, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // TODO: Get available compiler versions from Remix API
      const compilerList = await plugin.call('compilerloader', 'listCompilers')
      //const solJson = await  plugin.call('compilerloader', 'getJsonBinData')
      const versions = ['0.8.20', '0.8.25', '0.8.26', '0.8.28', '0.8.30']; // Mock data

      return this.createSuccessResult({
        success: true,
        versions: versions || [],
        count: versions?.length || 0
      });
    } catch (error) {
      return this.createErrorResult(`Failed to get compiler versions: ${error.message}`);
    }
  }
}

/**
 * Get Verified Contract from Etherscan Tool Handler
 */
export class GetVerifiedContractFromEtherscanHandler extends BaseToolHandler {
  name = 'get_verified_contract_from_etherscan';
  description = 'Fetch a verified contract source from Etherscan into the workspace.';
  inputSchema = {
    type: 'object',
    properties: {
      contractAddress: {
        type: 'string',
        description: 'The contract address to fetch from Etherscan (0x...)',
        pattern: '^0x[a-fA-F0-9]{40}$'
      },
      network: {
        type: 'object',
        description: 'Network configuration',
        properties: {
          id: {
            type: 'number',
            description: 'Network chain ID (1 for Ethereum mainnet, 11155111 for Sepolia, etc.)'
          },
          name: {
            type: 'string',
            description: 'Network name (ethereum, sepolia, polygon, etc.)'
          }
        },
        required: ['id', 'name']
      },
      targetPath: {
        type: 'string',
        description: 'Target directory path to save the contract files',
        default: 'contracts/imported'
      }
    },
    required: ['contractAddress', 'network']
  };

  getPermissions(): string[] {
    return ['file:write', 'etherscan:read'];
  }

  validate(args: {
    contractAddress: string;
    network: Network;
    targetPath?: string;
  }): boolean | string {
    const required = this.validateRequired(args, ['contractAddress', 'network']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      contractAddress: 'string',
      network: 'object',
      targetPath: 'string',
    });
    if (types !== true) return types;

    // Validate contract address format
    if (!args.contractAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return 'Contract address must be a valid Ethereum address (0x followed by 40 hex characters)';
    }

    // Validate network object
    if (!args.network.id || !args.network.name) {
      return 'Network must include both id and name properties';
    }

    if (typeof args.network.id !== 'number' || args.network.id < 1) {
      return 'Network id must be a positive number';
    }

    return true;
  }

  async execute(args: {
    contractAddress: string;
    network: Network;
    targetPath?: string;
  }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const targetPath = args.targetPath || 'contracts/imported/' + args.contractAddress

      // Ensure target directory exists
      await plugin.call('fileManager', 'mkdir', targetPath);

      // Fetch contract from Etherscan
      const result = await fetchContractFromEtherscan(
        plugin,
        args.network,
        args.contractAddress,
        targetPath,
        true, // shouldSetFile
      );

      if (!result) {
        return this.createErrorResult('Failed to fetch contract from Etherscan - no result returned');
      }

      // Extract information about imported files
      const importedFiles = Object.keys(result.compilationTargets);
      const contractName = importedFiles.length > 0 ?
        importedFiles[0].split('/').pop()?.replace('.sol', '') : 'Unknown';

      return this.createSuccessResult({
        success: true,
        message: `Successfully imported verified contract from Etherscan`,
        contractAddress: args.contractAddress,
        network: args.network,
        contractName: contractName,
        compilerVersion: result.version,
        importedFiles: importedFiles,
        targetPath: targetPath,
        compilerConfig: result.config,
        optimizationUsed: result.config?.settings?.optimizer?.enabled || false,
        optimizationRuns: result.config?.settings?.optimizer?.runs || 0
      });
    } catch (error) {
      return this.createErrorResult(`Failed to fetch contract from Etherscan: ${error.message}`);
    }
  }
}

/**
 * Create compilation tool definitions
 */
export function createCompilationTools(): RemixToolDefinition[] {
  // description comes from the handler — a definition that repeats it drifts,
  // and an empty one leaves the model guessing what the tool does.
  const define = (handler: BaseToolHandler, permissions: string[]): RemixToolDefinition => ({
    name: handler.name,
    description: handler.description,
    inputSchema: handler.inputSchema,
    category: ToolCategory.COMPILATION,
    permissions,
    handler
  })

  const tools: RemixToolDefinition[] = [
    define(new SolidityCompileHandler(), ['compile:solidity']),
    define(new GetCompilationResultHandler(), ['compile:read']),
    define(new GetCompilationResultByFilePathHandler(), ['compile:read']),
    define(new SetCompilerConfigHandler(), ['compile:config']),
    define(new GetCompilerConfigHandler(), ['compile:read']),
    define(new GetCompilerVersionsHandler(), ['compile:read']),
    define(new GetVerifiedContractFromEtherscanHandler(), ['file:write', 'etherscan:read'])
  ]
  if (isElectron()) {
    tools.push(define(new CompileWithHardhatHandler(), ['compile:hardhat']))
    tools.push(define(new CompileWithFoundryHandler(), ['compile:foundry']))
    tools.push(define(new CompileWithTruffleHandler(), ['compile:truffle']))
  }
  return tools
}
