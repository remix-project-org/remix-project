/**
 * Compilation Tool Handlers for Remix MCP Server
 */

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

/**
 * Solidity Compile Tool Handler
 */
export class SolidityCompileHandler extends BaseToolHandler {
  name = 'solidity_compile';
  description = 'Compile Solidity smart contracts';
  inputSchema = {
    type: 'object',
    properties: {
      file: {
        type: 'string',
        description: 'Specific file to compile (optional, compiles all if not specified)'
      },
      version: {
        type: 'string',
        description: 'Solidity compiler version (e.g., 0.8.30)',
        default: 'latest'
      },
      optimize: {
        type: 'boolean',
        description: 'Enable optimization',
        default: true
      },
      runs: {
        type: 'number',
        description: 'Number of optimization runs',
        default: 200
      },
      evmVersion: {
        type: 'string',
        description: 'EVM version target',
        enum: ['london', 'berlin', 'istanbul', 'petersburg', 'constantinople', 'byzantium'],
        default: 'london'
      }
    },
    required: ['file']
  };

  getPermissions(): string[] {
    return ['compile:solidity'];
  }

  validate(args: SolidityCompileArgs): boolean | string {
    const types = this.validateTypes(args, {
      file: 'string',
      version: 'string',
      optimize: 'boolean',
      runs: 'number',
      evmVersion: 'string'
    });
    if (types !== true) return types;

    if (args.runs !== undefined && (args.runs < 1 || args.runs > 10000)) {
      return 'Optimization runs must be between 1 and 10000';
    }

    return true;
  }

  async execute(args: SolidityCompileArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      let compilerConfig: any = {};

      await plugin.call('sidePanel', 'showContent', 'solidity' )

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

      // if (args.version) compilerConfig.version = args.version;
      // if (args.optimize !== undefined) compilerConfig.optimize = args.optimize;
      // if (args.runs) compilerConfig.runs = args.runs;
      // if (args.evmVersion) compilerConfig.evmVersion = args.evmVersion;

      // await plugin.call('solidity' as any, 'setCompilerConfig', JSON.stringify(compilerConfig));

      let compilationResult: any;
      if (args.file) {
        // Compile specific file - need to use plugin API or direct compilation
        const content = await plugin.call('fileManager', 'readFile', args.file);
        const contract = {}
        contract[args.file] = { content: content }

        const compilerPayload = await plugin.call('solidity' as any, 'compileWithParameters', contract, compilerConfig)
        await plugin.call('solidity' as any, 'compile', args.file) // this will enable the UI
        compilationResult = compilerPayload
      } else {
        return this.createErrorResult(`Compilation failed: Workspace compilation not yet implemented. The argument file is not provided`);
      }
      // Process compilation result
      const result: CompilationResult = {
        success: !compilationResult.data?.errors || compilationResult.data?.errors.length === 0 || !compilationResult.data?.error,
        contracts: {},
        errors: compilationResult.data.errors || [],
        errorFiles: compilationResult?.errFiles || [],
        warnings: [], //compilationResult?.data?.errors.find((error) => error.type === 'Warning') || [],
        sources: compilationResult?.source.sources[args.file] || {}
      };

      // Emit compilationFinished event with correct parameters to trigger UI effects
      plugin.emit('compilationFinished',
        args.file, // source target
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
            if (fileName.includes(args.file)){
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
      return this.createErrorResult(`Compilation failed: ${error.message}`);
    }
  }
}

/**
 * Get Compilation Result Tool Handler
 */
export class GetCompilationResultHandler extends BaseToolHandler {
  name = 'get_compilation_result';
  description = 'Get the latest compilation result';
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
        sources: compilationResult?.source || {}
      };

      if (compilationResult.data?.contracts) {
        for (const [fileName, fileContracts] of Object.entries(compilationResult.data.contracts)) {
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

      return this.createSuccessResult(result);
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
  description = 'Set Solidity compiler configuration';
  inputSchema = {
    type: 'object',
    properties: {
      version: {
        type: 'string',
        description: 'Compiler version'
      },
      optimize: {
        type: 'boolean',
        description: 'Enable optimization'
      },
      runs: {
        type: 'number',
        description: 'Number of optimization runs'
      },
      evmVersion: {
        type: 'string',
        description: 'EVM version target'
      },
      language: {
        type: 'string',
        description: 'Programming language',
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
      const config = {
        version: args.version,
        optimize: args.optimize !== undefined ? args.optimize : true,
        runs: args.runs || 200,
        evmVersion: args.evmVersion || 'london',
        language: args.language || 'Solidity'
      };

      await plugin.call('solidity' as any, 'setCompilerConfig', JSON.stringify(config));

      return this.createSuccessResult({
        success: true,
        message: 'Compiler configuration updated',
        config: config
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
  description = 'Get current Solidity compiler configuration';
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
  description = 'Compile using Hardhat framework';
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
  description = 'Compile using Foundry framework';
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
  description = 'Compile using Truffle framework';
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
  description = 'Get list of available Solidity compiler versions';
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
 * Create compilation tool definitions
 */
export function createCompilationTools(): RemixToolDefinition[] {
  return [
    {
      name: 'solidity_compile',
      description: 'Compile Solidity smart contracts',
      inputSchema: new SolidityCompileHandler().inputSchema,
      category: ToolCategory.COMPILATION,
      permissions: ['compile:solidity'],
      handler: new SolidityCompileHandler()
    },
    {
      name: 'get_compilation_result',
      description: 'Get the latest compilation result',
      inputSchema: new GetCompilationResultHandler().inputSchema,
      category: ToolCategory.COMPILATION,
      permissions: ['compile:read'],
      handler: new GetCompilationResultHandler()
    },
    {
      name: 'set_compiler_config',
      description: 'Set Solidity compiler configuration',
      inputSchema: new SetCompilerConfigHandler().inputSchema,
      category: ToolCategory.COMPILATION,
      permissions: ['compile:config'],
      handler: new SetCompilerConfigHandler()
    },
    {
      name: 'get_compiler_config',
      description: 'Get current Solidity compiler configuration',
      inputSchema: new GetCompilerConfigHandler().inputSchema,
      category: ToolCategory.COMPILATION,
      permissions: ['compile:read'],
      handler: new GetCompilerConfigHandler()
    },
    {
      name: 'compile_with_hardhat',
      description: 'Compile using Hardhat framework',
      inputSchema: new CompileWithHardhatHandler().inputSchema,
      category: ToolCategory.COMPILATION,
      permissions: ['compile:hardhat'],
      handler: new CompileWithHardhatHandler()
    },
    {
      name: 'compile_with_foundry',
      description: 'Compile using Foundry framework',
      inputSchema: new CompileWithFoundryHandler().inputSchema,
      category: ToolCategory.COMPILATION,
      permissions: ['compile:foundry'],
      handler: new CompileWithFoundryHandler()
    },
    {
      name: 'compile_with_truffle',
      description: 'Compile using Truffle framework',
      inputSchema: new CompileWithTruffleHandler().inputSchema,
      category: ToolCategory.COMPILATION,
      permissions: ['compile:truffle'],
      handler: new CompileWithTruffleHandler()
    },
    {
      name: 'get_compiler_versions',
      description: 'Get list of available Solidity compiler versions',
      inputSchema: new GetCompilerVersionsHandler().inputSchema,
      category: ToolCategory.COMPILATION,
      permissions: ['compile:read'],
      handler: new GetCompilerVersionsHandler()
    }
  ];
}