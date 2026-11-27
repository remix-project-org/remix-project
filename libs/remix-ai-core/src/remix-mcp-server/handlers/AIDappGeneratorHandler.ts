/**
 * AI DApp Generator Tool Handlers for Remix MCP Server
 */

import { IMCPToolResult } from '../../types/mcp';
import { BaseToolHandler } from '../registry/RemixToolRegistry';
import {
  ToolCategory,
  RemixToolDefinition,
  GenerateAIDappArgs,
  UpdateAIDappArgs,
  AIDappGenerationResult
} from '../types/mcpTools';
import { Plugin } from '@remixproject/engine';

/**
 * Generate AI DApp Tool Handler
 */
export class GenerateAIDappHandler extends BaseToolHandler {
  name = 'generate_ai_dapp';
  description = 'Generate a DApp frontend using AI based on contract ABI and user description';
  inputSchema = {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'Description of the DApp to generate (user requirements, features, UI preferences)'
      },
      contractAddress: {
        type: 'string',
        description: 'Contract address',
        pattern: '^0x[a-fA-F0-9]{40}$'
      },
      contractName: {
        type: 'string',
        description: 'Name of the contract'
      },
      abi: {
        type: 'array',
        description: 'Contract ABI',
        items: {
          type: 'object'
        }
      },
      chainId: {
        type: ['string', 'number'],
        description: 'Chain ID (decimal or hex string)'
      },
      outputDirectory: {
        type: 'string',
        description: 'Directory to save generated files (default: "dapp")',
        default: 'dapp'
      }
    },
    required: ['description', 'contractAddress', 'contractName', 'abi', 'chainId']
  };

  getPermissions(): string[] {
    return ['ai:generate', 'file:write', 'file:create'];
  }

  validate(args: GenerateAIDappArgs): boolean | string {
    const required = this.validateRequired(args, ['description', 'contractAddress', 'contractName', 'abi', 'chainId']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      description: 'string',
      contractAddress: 'string',
      contractName: 'string',
      abi: 'object',
      outputDirectory: 'string'
    });
    if (types !== true) return types;

    if (!args.contractAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return 'Invalid contract address format';
    }

    if (!Array.isArray(args.abi)) {
      return 'ABI must be an array';
    }

    if (args.abi.length === 0) {
      return 'ABI cannot be empty';
    }

    return true;
  }

  async execute(args: GenerateAIDappArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Call the ai-dapp-generator plugin
      const pages: Record<string, string> = await plugin.call('ai-dapp-generator', 'generateDapp', {
        description: args.description,
        address: args.contractAddress,
        abi: args.abi,
        chainId: args.chainId,
        contractName: args.contractName
      });

      if (!pages || Object.keys(pages).length === 0) {
        return this.createErrorResult('AI DApp generation failed: No files were generated');
      }

      // Prepare output directory
      const outputDir = args.outputDirectory || 'dapp';

      // Remove existing directory if it exists
      try {
        await plugin.call('fileManager', 'remove', outputDir);
      } catch (e) {
        // Directory doesn't exist, that's fine
      }

      // Create the output directory
      await plugin.call('fileManager', 'mkdir', outputDir);

      const createdFiles: string[] = [];
      const errors: string[] = [];

      // Write all generated files
      for (const [rawFilename, content] of Object.entries(pages)) {
        try {
          // Sanitize filename to prevent path traversal
          const safeParts = rawFilename.replace(/\\/g, '/')
            .split('/')
            .filter(part => part !== '..' && part !== '.' && part !== '');

          if (safeParts.length === 0) {
            errors.push(`Invalid filename: ${rawFilename}`);
            continue;
          }

          const safeFilename = safeParts.join('/');
          const fullPath = `${outputDir}/${safeFilename}`;

          // Create subdirectories if needed
          if (safeParts.length > 1) {
            const subFolders = safeParts.slice(0, -1);
            let currentPath = outputDir;
            for (const folder of subFolders) {
              currentPath = `${currentPath}/${folder}`;
              try {
                await plugin.call('fileManager', 'mkdir', currentPath);
              } catch (e) {
                // Directory might already exist
              }
            }
          }

          // Write the file
          await plugin.call('fileManager', 'writeFile', fullPath, content);
          createdFiles.push(fullPath);

        } catch (fileError) {
          errors.push(`Failed to create ${rawFilename}: ${fileError.message}`);
        }
      }

      const result: AIDappGenerationResult = {
        success: true,
        outputDirectory: outputDir,
        filesGenerated: createdFiles,
        totalFiles: createdFiles.length,
        errors: errors.length > 0 ? errors : undefined
      };

      return this.createSuccessResult(result);

    } catch (error) {
      return this.createErrorResult(`AI DApp generation failed: ${error.message}`);
    }
  }
}

/**
 * Update AI DApp Tool Handler
 */
export class UpdateAIDappHandler extends BaseToolHandler {
  name = 'update_ai_dapp';
  description = 'Update an existing AI-generated DApp with new description/requirements';
  inputSchema = {
    type: 'object',
    properties: {
      contractAddress: {
        type: 'string',
        description: 'Contract address of the DApp to update',
        pattern: '^0x[a-fA-F0-9]{40}$'
      },
      description: {
        type: 'string',
        description: 'Update description (what changes to make)'
      },
      currentFiles: {
        type: 'object',
        description: 'Current DApp files (filename -> content mapping)',
        additionalProperties: {
          type: 'string'
        }
      },
      outputDirectory: {
        type: 'string',
        description: 'Directory to save updated files (default: "dapp")',
        default: 'dapp'
      }
    },
    required: ['contractAddress', 'description', 'currentFiles']
  };

  getPermissions(): string[] {
    return ['ai:generate', 'file:write', 'file:read'];
  }

  validate(args: UpdateAIDappArgs): boolean | string {
    const required = this.validateRequired(args, ['contractAddress', 'description', 'currentFiles']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      contractAddress: 'string',
      description: 'string',
      currentFiles: 'object',
      outputDirectory: 'string'
    });
    if (types !== true) return types;

    if (!args.contractAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return 'Invalid contract address format';
    }

    if (typeof args.currentFiles !== 'object' || args.currentFiles === null) {
      return 'currentFiles must be an object';
    }

    return true;
  }

  async execute(args: UpdateAIDappArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Call the ai-dapp-generator plugin's updateDapp method
      const pages: Record<string, string> = await plugin.call('ai-dapp-generator', 'updateDapp',
        args.contractAddress,
        args.description,
        args.currentFiles
      );

      if (!pages || Object.keys(pages).length === 0) {
        return this.createErrorResult('AI DApp update failed: No files were generated');
      }

      // Prepare output directory
      const outputDir = args.outputDirectory || 'dapp';

      const updatedFiles: string[] = [];
      const errors: string[] = [];

      // Write all updated files
      for (const [rawFilename, content] of Object.entries(pages)) {
        try {
          // Sanitize filename
          const safeParts = rawFilename.replace(/\\/g, '/')
            .split('/')
            .filter(part => part !== '..' && part !== '.' && part !== '');

          if (safeParts.length === 0) {
            errors.push(`Invalid filename: ${rawFilename}`);
            continue;
          }

          const safeFilename = safeParts.join('/');
          const fullPath = `${outputDir}/${safeFilename}`;

          // Create subdirectories if needed
          if (safeParts.length > 1) {
            const subFolders = safeParts.slice(0, -1);
            let currentPath = outputDir;
            for (const folder of subFolders) {
              currentPath = `${currentPath}/${folder}`;
              try {
                await plugin.call('fileManager', 'mkdir', currentPath);
              } catch (e) {
                // Directory might already exist
              }
            }
          }

          // Write the file
          await plugin.call('fileManager', 'writeFile', fullPath, content);
          updatedFiles.push(fullPath);

        } catch (fileError) {
          errors.push(`Failed to update ${rawFilename}: ${fileError.message}`);
        }
      }

      const result: AIDappGenerationResult = {
        success: true,
        outputDirectory: outputDir,
        filesGenerated: updatedFiles,
        totalFiles: updatedFiles.length,
        errors: errors.length > 0 ? errors : undefined
      };

      return this.createSuccessResult(result);

    } catch (error) {
      return this.createErrorResult(`AI DApp update failed: ${error.message}`);
    }
  }
}

/**
 * Reset AI DApp Context Tool Handler
 */
export class ResetAIDappHandler extends BaseToolHandler {
  name = 'reset_ai_dapp';
  description = 'Reset the AI DApp generation context for a specific contract address';
  inputSchema = {
    type: 'object',
    properties: {
      contractAddress: {
        type: 'string',
        description: 'Contract address to reset context for',
        pattern: '^0x[a-fA-F0-9]{40}$'
      }
    },
    required: ['contractAddress']
  };

  getPermissions(): string[] {
    return ['ai:generate'];
  }

  validate(args: { contractAddress: string }): boolean | string {
    const required = this.validateRequired(args, ['contractAddress']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      contractAddress: 'string'
    });
    if (types !== true) return types;

    if (!args.contractAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return 'Invalid contract address format';
    }

    return true;
  }

  async execute(args: { contractAddress: string }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      await plugin.call('ai-dapp-generator', 'resetDapp', args.contractAddress);

      return this.createSuccessResult({
        success: true,
        message: `AI DApp context reset for address ${args.contractAddress}`
      });

    } catch (error) {
      return this.createErrorResult(`Failed to reset AI DApp context: ${error.message}`);
    }
  }
}

/**
 * Open QuickDApp Preview Tool Handler
 */
export class OpenQuickDappPreviewHandler extends BaseToolHandler {
  name = 'open_quickdapp_preview';
  description = 'Open the QuickDApp plugin to display and preview a generated DApp';
  inputSchema = {
    type: 'object',
    properties: {
      contractAddress: {
        type: 'string',
        description: 'Contract address',
        pattern: '^0x[a-fA-F0-9]{40}$'
      },
      contractName: {
        type: 'string',
        description: 'Name of the contract'
      },
      abi: {
        type: 'array',
        description: 'Contract ABI',
        items: {
          type: 'object'
        }
      },
      network: {
        type: 'string',
        description: 'Network name (e.g., "Sepolia", "Mainnet")',
        default: 'Custom'
      },
      devdoc: {
        type: 'object',
        description: 'Developer documentation (optional)',
        additionalProperties: true
      },
      metadata: {
        type: 'string',
        description: 'Contract metadata JSON string (optional)'
      },
      pages: {
        type: 'object',
        description: 'Generated DApp pages (filename -> content mapping)',
        additionalProperties: {
          type: 'string'
        }
      }
    },
    required: ['contractAddress', 'contractName', 'abi']
  };

  getPermissions(): string[] {
    return ['ui:navigate', 'plugin:call'];
  }

  validate(args: any): boolean | string {
    const required = this.validateRequired(args, ['contractAddress', 'contractName', 'abi']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      contractAddress: 'string',
      contractName: 'string',
      abi: 'object',
      network: 'string',
      devdoc: 'object',
      metadata: 'string',
      pages: 'object'
    });
    if (types !== true) return types;

    if (!args.contractAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return 'Invalid contract address format';
    }

    if (!Array.isArray(args.abi)) {
      return 'ABI must be an array';
    }

    return true;
  }

  async execute(args: any, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Prepare payload for quick-dapp-v2 plugin
      const payload: any = {
        address: args.contractAddress,
        abi: args.abi,
        name: args.contractName,
        network: args.network || 'Custom',
        devdoc: args.devdoc || null,
        methodIdentifiers: null,
        solcVersion: '',
        htmlTemplate: args.pages || null
      };

      // Extract solc version from metadata if provided
      if (args.metadata) {
        try {
          const metadataObj = typeof args.metadata === 'string'
            ? JSON.parse(args.metadata)
            : args.metadata;
          if (metadataObj.compiler && metadataObj.compiler.version) {
            payload.solcVersion = metadataObj.compiler.version;
          }
        } catch (e) {
          console.warn('Failed to parse metadata for solcVersion:', e);
        }
      }

      // Call quick-dapp-v2 plugin to edit/display the instance
      await plugin.call('quick-dapp-v2', 'edit', payload);

      // Focus the quick-dapp-v2 tab to bring it to front
      await plugin.call('tabs', 'focus', 'quick-dapp-v2');

      return this.createSuccessResult({
        success: true,
        message: 'QuickDApp plugin opened successfully',
        plugin: 'quick-dapp-v2',
        contractAddress: args.contractAddress,
        contractName: args.contractName
      });

    } catch (error) {
      return this.createErrorResult(`Failed to open QuickDApp preview: ${error.message}`);
    }
  }
}

/**
 * Create AI DApp Generator tool definitions
 */
export function createAIDappGeneratorTools(): RemixToolDefinition[] {
  return [
    {
      name: 'generate_ai_dapp',
      description: 'Generate a DApp frontend using AI based on contract ABI and user description',
      inputSchema: new GenerateAIDappHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['ai:generate', 'file:write', 'file:create'],
      handler: new GenerateAIDappHandler()
    },
    {
      name: 'update_ai_dapp',
      description: 'Update an existing AI-generated DApp with new description/requirements',
      inputSchema: new UpdateAIDappHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['ai:generate', 'file:write', 'file:read'],
      handler: new UpdateAIDappHandler()
    },
    {
      name: 'reset_ai_dapp',
      description: 'Reset the AI DApp generation context for a specific contract address',
      inputSchema: new ResetAIDappHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['ai:generate'],
      handler: new ResetAIDappHandler()
    },
    {
      name: 'open_quickdapp_preview',
      description: 'Open the QuickDApp plugin to display and preview a generated DApp',
      inputSchema: new OpenQuickDappPreviewHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['ui:navigate', 'plugin:call'],
      handler: new OpenQuickDappPreviewHandler()
    }
  ];
}
