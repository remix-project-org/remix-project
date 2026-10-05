/**
 * Foundry and Hardhat Tool Handlers for Remix MCP Server
 *
 * These handlers enable AI agents to interact with Foundry and Hardhat frameworks
 * through their respective Remix plugins, executing compilation and sync operations.
 */

import { IMCPToolResult } from '../../types/mcp';
import { BaseToolHandler } from '../registry/RemixToolRegistry';
import {
  ToolCategory,
  RemixToolDefinition,
} from '../types/mcpTools';
import { Plugin } from '@remixproject/engine';

/**
 * Foundry Compile Tool Handler
 *
 * Executes Foundry compilation by calling the foundryPlugin.
 * This runs `forge build` in the current working directory.
 */
export class FoundryCompileHandler extends BaseToolHandler {
  name = 'foundry_compile';
  description = 'Compile Solidity contracts using Foundry (forge build). This command builds your Foundry project, compiling all contracts in the src directory according to foundry.toml configuration.';
  inputSchema = {
    type: 'object',
    properties: {
      sync: {
        type: 'boolean',
        description: 'Whether to sync the compilation result with Remix Web3 after compilation',
        default: true
      }
    }
  };

  getPermissions(): string[] {
    return ['foundry:compile'];
  }

  validate(args: { sync?: boolean }): boolean | string {
    if (args.sync !== undefined) {
      const types = this.validateTypes(args, { sync: 'boolean' });
      if (types !== true) return types;
    }
    return true;
  }

  async execute(_args: { sync?: boolean }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Call the foundry plugin's compile method
      await plugin.call('foundry' as any, 'compile');

      return this.createSuccessResult({
        success: true,
        message: 'Foundry compilation completed successfully. Contracts were compiled using forge build.',
        framework: 'foundry',
        command: 'forge build'
      });
    } catch (error) {
      return this.createErrorResult(`Foundry compilation failed: ${error.message}`);
    }
  }
}

/**
 * Foundry Sync Tool Handler
 *
 * Syncs Foundry compilation artifacts with Remix Web3.
 * This reads the cache and emits compilation results for the current file.
 */
export class FoundrySyncHandler extends BaseToolHandler {
  name = 'foundry_sync';
  description = 'Sync Foundry compilation artifacts with Remix Web3. This updates Remix with the latest Foundry build artifacts from the out/ and cache/ directories.';
  inputSchema = {
    type: 'object',
    properties: {}
  };

  getPermissions(): string[] {
    return ['foundry:sync'];
  }

  async execute(_args: any, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Call the foundry plugin's sync method
      await plugin.call('foundry' as any, 'sync');

      return this.createSuccessResult({
        success: true,
        message: 'Foundry artifacts synced successfully with Remix Web3',
        framework: 'foundry'
      });
    } catch (error) {
      return this.createErrorResult(`Foundry sync failed: ${error.message}`);
    }
  }
}

/**
 * Hardhat Compile Tool Handler
 *
 * Executes Hardhat compilation by calling the hardhatPlugin.
 * This runs `npx hardhat compile` in the current working directory.
 */
export class HardhatCompileHandler extends BaseToolHandler {
  name = 'hardhat_compile';
  description = 'Compile Solidity contracts using Hardhat (npx hardhat compile). This command builds your Hardhat project, compiling all contracts in the contracts directory according to hardhat.config.js configuration.';
  inputSchema = {
    type: 'object',
    properties: {
      sync: {
        type: 'boolean',
        description: 'Whether to sync the compilation result with Remix Web3 after compilation',
        default: true
      }
    }
  };

  getPermissions(): string[] {
    return ['hardhat:compile'];
  }

  validate(args: { sync?: boolean }): boolean | string {
    if (args.sync !== undefined) {
      const types = this.validateTypes(args, { sync: 'boolean' });
      if (types !== true) return types;
    }
    return true;
  }

  async execute(_args: { sync?: boolean }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Call the hardhat plugin's compile method
      await plugin.call('hardhat' as any, 'compile');

      return this.createSuccessResult({
        success: true,
        message: 'Hardhat compilation completed successfully. Contracts were compiled using npx hardhat compile.',
        framework: 'hardhat',
        command: 'npx hardhat compile'
      });
    } catch (error) {
      return this.createErrorResult(`Hardhat compilation failed: ${error.message}`);
    }
  }
}

/**
 * Hardhat Sync Tool Handler
 *
 * Syncs Hardhat compilation artifacts with Remix Web3.
 * This reads the artifacts and emits compilation results for the current file.
 */
export class HardhatSyncHandler extends BaseToolHandler {
  name = 'hardhat_sync';
  description = 'Sync Hardhat compilation artifacts with Remix Web3. This updates Remix with the latest Hardhat build artifacts from the artifacts/ and cache/ directories.';
  inputSchema = {
    type: 'object',
    properties: {}
  };

  getPermissions(): string[] {
    return ['hardhat:sync'];
  }

  async execute(_args: any, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Call the hardhat plugin's sync method
      await plugin.call('hardhat' as any, 'sync');

      return this.createSuccessResult({
        success: true,
        message: 'Hardhat artifacts synced successfully with Remix Web3',
        framework: 'hardhat'
      });
    } catch (error) {
      return this.createErrorResult(`Hardhat sync failed: ${error.message}`);
    }
  }
}

/**
 * Foundry Run Command Tool Handler
 *
 * Executes any Foundry command (forge, cast, anvil) through the foundryPlugin.
 */
export class FoundryRunCommandHandler extends BaseToolHandler {
  name = 'foundry_run_command';
  description = 'Run any Foundry command (forge, cast, or anvil) in the current working directory. Examples: "forge test", "forge script", "cast call", "anvil".';
  inputSchema = {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The Foundry command to execute. Must start with "forge", "cast", or "anvil". Example: "forge test -vvv" or "forge script scripts/Deploy.s.sol"'
      }
    },
    required: ['command']
  };

  getPermissions(): string[] {
    return ['foundry:command'];
  }

  validate(args: { command: string }): boolean | string {
    const required = this.validateRequired(args, ['command']);
    if (required !== true) return required;

    const types = this.validateTypes(args, { command: 'string' });
    if (types !== true) return types;

    // Validate command starts with allowed Foundry commands
    const allowedCommands = ['forge', 'cast', 'anvil'];
    const commandParts = args.command.trim().split(' ');
    const baseCommand = commandParts[0];

    if (!allowedCommands.includes(baseCommand)) {
      return `Command must start with one of: ${allowedCommands.join(', ')}`;
    }

    return true;
  }

  async execute(args: { command: string }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Call the foundry plugin's runCommand method
      const result: any = await plugin.call('foundry' as any, 'runCommand', args.command);

      return this.createSuccessResult({
        success: true,
        message: `Foundry command executed successfully: ${args.command}`,
        command: args.command,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr
      });
    } catch (error) {
      return this.createErrorResult(`Foundry command failed: ${error.message}`);
    }
  }
}

/**
 * Hardhat Run Command Tool Handler
 *
 * Executes any Hardhat command through the hardhatPlugin.
 */
export class HardhatRunCommandHandler extends BaseToolHandler {
  name = 'hardhat_run_command';
  description = 'Run any Hardhat command in the current working directory. Examples: "npx hardhat test", "npx hardhat run scripts/deploy.js", "npx hardhat node".';
  inputSchema = {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The Hardhat command to execute. Must be a hardhat command, typically prefixed with "npx hardhat". Example: "npx hardhat test" or "npx hardhat run scripts/deploy.js --network localhost"'
      }
    },
    required: ['command']
  };

  getPermissions(): string[] {
    return ['hardhat:command'];
  }

  validate(args: { command: string }): boolean | string {
    const required = this.validateRequired(args, ['command']);
    if (required !== true) return required;

    const types = this.validateTypes(args, { command: 'string' });
    if (types !== true) return types;

    // Validate command is a Hardhat command
    const commandParts = args.command.trim().split(' ');

    if (commandParts[0] === 'npx' && commandParts[1] !== 'hardhat') {
      return 'Command must be an npx hardhat command';
    } else if (commandParts[0] !== 'npx' && commandParts[0] !== 'hardhat') {
      return 'Command must be a hardhat command (use "npx hardhat" or "hardhat")';
    }

    return true;
  }

  async execute(args: { command: string }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Call the hardhat plugin's runCommand method
      const result: any = await plugin.call('hardhat' as any, 'runCommand', args.command);

      return this.createSuccessResult({
        success: true,
        message: `Hardhat command executed successfully: ${args.command}`,
        command: args.command,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr
      });
    } catch (error) {
      return this.createErrorResult(`Hardhat command failed: ${error.message}`);
    }
  }
}

/**
 * Get Foundry/Hardhat Info Tool Handler
 *
 * Provides information about how to use Foundry and Hardhat commands in Remix.
 */
export class GetFoundryHardhatInfoHandler extends BaseToolHandler {
  name = 'get_foundry_hardhat_info';
  description = 'Get information about using Foundry and Hardhat in Remix Web3, including available commands and usage patterns.';
  inputSchema = {
    type: 'object',
    properties: {
      framework: {
        type: 'string',
        enum: ['foundry', 'hardhat', 'both'],
        description: 'Which framework to get info about',
        default: 'both'
      }
    }
  };

  getPermissions(): string[] {
    return ['foundry:info', 'hardhat:info'];
  }

  validate(args: { framework?: string }): boolean | string {
    if (args.framework && !['foundry', 'hardhat', 'both'].includes(args.framework)) {
      return 'Framework must be one of: foundry, hardhat, both';
    }
    return true;
  }

  async execute(args: { framework?: string }, _plugin: Plugin): Promise<IMCPToolResult> {
    const framework = args.framework || 'both';

    const foundryInfo = {
      name: 'Foundry',
      description: 'A blazing fast, portable and modular toolkit for Ethereum application development written in Rust.',
      commands: {
        compile: {
          tool: 'foundry_compile',
          description: 'Compiles all contracts in your Foundry project using forge build',
          underlyingCommand: 'forge build',
          outputDirectory: 'out/',
          cacheDirectory: 'cache/',
          configFile: 'foundry.toml'
        },
        sync: {
          tool: 'foundry_sync',
          description: 'Syncs Foundry compilation artifacts with Remix Web3',
          usage: 'Use after external compilation or to refresh artifacts'
        },
        runCommand: {
          tool: 'foundry_run_command',
          description: 'Execute any Foundry command (forge, cast, anvil)',
          usage: 'Pass any valid Foundry command as a string',
          examples: [
            'forge test',
            'forge test -vvv',
            'forge test --match-test testMyFunction',
            'forge script scripts/Deploy.s.sol',
            'forge script scripts/Deploy.s.sol --rpc-url $RPC_URL --broadcast',
            'cast call <contract_address> "balanceOf(address)" <address>',
            'cast send <contract_address> "transfer(address,uint256)" <to> <amount>',
            'anvil'
          ],
          supportedTools: ['forge', 'cast', 'anvil']
        }
      },
      projectStructure: {
        src: 'Source contracts directory',
        test: 'Test files directory',
        script: 'Deployment scripts directory',
        out: 'Compiled artifacts output',
        cache: 'Compilation cache',
        lib: 'Dependencies directory'
      },
      setupInstructions: [
        'Ensure Foundry is installed (foundryup)',
        'Initialize a Foundry project with: forge init',
        'Place contracts in the src/ directory',
        'Configure foundry.toml as needed',
        'Use foundry_compile to build your contracts'
      ]
    };

    const hardhatInfo = {
      name: 'Hardhat',
      description: 'A development environment to compile, deploy, test, and debug Ethereum software.',
      commands: {
        compile: {
          tool: 'hardhat_compile',
          description: 'Compiles all contracts in your Hardhat project using npx hardhat compile',
          underlyingCommand: 'npx hardhat compile',
          outputDirectory: 'artifacts/',
          cacheDirectory: 'cache/',
          configFile: 'hardhat.config.js or hardhat.config.ts'
        },
        sync: {
          tool: 'hardhat_sync',
          description: 'Syncs Hardhat compilation artifacts with Remix Web3',
          usage: 'Use after external compilation or to refresh artifacts'
        },
        runCommand: {
          tool: 'hardhat_run_command',
          description: 'Execute any Hardhat command',
          usage: 'Pass any valid Hardhat command as a string (typically prefixed with "npx hardhat")',
          examples: [
            'npx hardhat test',
            'npx hardhat test --grep "MyTest"',
            'npx hardhat run scripts/deploy.js',
            'npx hardhat run scripts/deploy.js --network localhost',
            'npx hardhat node',
            'npx hardhat verify --network mainnet <contract_address> <constructor_args>',
            'npx hardhat accounts',
            'npx hardhat console'
          ]
        }
      },
      projectStructure: {
        contracts: 'Source contracts directory',
        test: 'Test files directory',
        scripts: 'Deployment scripts directory',
        artifacts: 'Compiled artifacts output',
        cache: 'Compilation cache',
        node_modules: 'Dependencies directory'
      },
      setupInstructions: [
        'Ensure Node.js and npm are installed',
        'Initialize a Hardhat project with: npx hardhat',
        'Place contracts in the contracts/ directory',
        'Configure hardhat.config.js as needed',
        'Install dependencies with: npm install',
        'Use hardhat_compile to build your contracts'
      ]
    };

    const result: any = {};

    if (framework === 'foundry' || framework === 'both') {
      result.foundry = foundryInfo;
    }

    if (framework === 'hardhat' || framework === 'both') {
      result.hardhat = hardhatInfo;
    }

    if (framework === 'both') {
      result.comparison = {
        foundry: {
          pros: ['Very fast compilation', 'Written in Rust', 'Built-in fuzzing', 'Gas-efficient testing'],
          useCases: ['Performance-critical projects', 'Advanced testing needs', 'Rust ecosystem integration']
        },
        hardhat: {
          pros: ['JavaScript/TypeScript ecosystem', 'Large plugin ecosystem', 'Mature tooling', 'Easy debugging'],
          useCases: ['JavaScript-based teams', 'Complex deployment scripts', 'Extensive plugin requirements']
        }
      };
    }

    return this.createSuccessResult({
      success: true,
      framework: framework,
      info: result
    });
  }
}

/**
 * Create Foundry and Hardhat tool definitions
 */
export function createFoundryHardhatTools(): RemixToolDefinition[] {
  return [
    {
      name: 'foundry_compile',
      description: 'Compile Solidity contracts using Foundry (forge build)',
      inputSchema: new FoundryCompileHandler().inputSchema,
      category: ToolCategory.COMPILATION,
      permissions: ['foundry:compile'],
      handler: new FoundryCompileHandler()
    },
    {
      name: 'foundry_sync',
      description: 'Sync Foundry compilation artifacts with Remix Web3',
      inputSchema: new FoundrySyncHandler().inputSchema,
      category: ToolCategory.COMPILATION,
      permissions: ['foundry:sync'],
      handler: new FoundrySyncHandler()
    },
    {
      name: 'foundry_run_command',
      description: 'Run any Foundry command (forge, cast, or anvil)',
      inputSchema: new FoundryRunCommandHandler().inputSchema,
      category: ToolCategory.COMPILATION,
      permissions: ['foundry:command'],
      handler: new FoundryRunCommandHandler()
    },
    {
      name: 'hardhat_compile',
      description: 'Compile Solidity contracts using Hardhat (npx hardhat compile)',
      inputSchema: new HardhatCompileHandler().inputSchema,
      category: ToolCategory.COMPILATION,
      permissions: ['hardhat:compile'],
      handler: new HardhatCompileHandler()
    },
    {
      name: 'hardhat_sync',
      description: 'Sync Hardhat compilation artifacts with Remix Web3',
      inputSchema: new HardhatSyncHandler().inputSchema,
      category: ToolCategory.COMPILATION,
      permissions: ['hardhat:sync'],
      handler: new HardhatSyncHandler()
    },
    {
      name: 'hardhat_run_command',
      description: 'Run any Hardhat command',
      inputSchema: new HardhatRunCommandHandler().inputSchema,
      category: ToolCategory.COMPILATION,
      permissions: ['hardhat:command'],
      handler: new HardhatRunCommandHandler()
    },
    {
      name: 'get_foundry_hardhat_info',
      description: 'Get information about using Foundry and Hardhat in Remix Web3',
      inputSchema: new GetFoundryHardhatInfoHandler().inputSchema,
      category: ToolCategory.COMPILATION,
      permissions: ['foundry:info', 'hardhat:info'],
      handler: new GetFoundryHardhatInfoHandler()
    }
  ];
}
