/**
 * IPFS Publishing Tool Handlers for Remix MCP Server
 */

import { IMCPToolResult } from '../../types/mcp';
import { BaseToolHandler } from '../registry/RemixToolRegistry';
import {
  ToolCategory,
  RemixToolDefinition,
  PublishToIPFSArgs,
  PublishMultipleToIPFSArgs,
  IPFSPublishResult
} from '../types/mcpTools';
import { Plugin } from '@remixproject/engine';

/**
 * Publish File to IPFS Tool Handler
 */
export class PublishFileToIPFSHandler extends BaseToolHandler {
  name = 'publish_file_to_ipfs';
  description = 'Publish a single file to IPFS';
  inputSchema = {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Path to the file to publish'
      },
      ipfsUrl: {
        type: 'string',
        description: 'IPFS node URL (optional, defaults to Infura)',
        default: 'ipfs.infura.io'
      },
      ipfsPort: {
        type: 'number',
        description: 'IPFS node port (optional)',
        default: 5001
      },
      ipfsProtocol: {
        type: 'string',
        description: 'IPFS protocol (http or https)',
        enum: ['http', 'https'],
        default: 'https'
      },
      projectId: {
        type: 'string',
        description: 'IPFS project ID for authentication (optional)'
      },
      projectSecret: {
        type: 'string',
        description: 'IPFS project secret for authentication (optional)'
      }
    },
    required: ['filePath']
  };

  getPermissions(): string[] {
    return ['ipfs:publish', 'file:read'];
  }

  validate(args: PublishToIPFSArgs): boolean | string {
    const required = this.validateRequired(args, ['filePath']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      filePath: 'string',
      ipfsUrl: 'string',
      ipfsPort: 'number',
      ipfsProtocol: 'string',
      projectId: 'string',
      projectSecret: 'string'
    });
    if (types !== true) return types;

    if (args.ipfsProtocol && !['http', 'https'].includes(args.ipfsProtocol)) {
      return 'Invalid IPFS protocol: must be "http" or "https"';
    }

    return true;
  }

  async execute(args: PublishToIPFSArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Check if file exists
      const exists = await plugin.call('fileManager', 'exists', args.filePath);
      if (!exists) {
        return this.createErrorResult(`File not found: ${args.filePath}`);
      }

      // Read file content
      const content = await plugin.call('fileManager', 'readFile', args.filePath);

      // Prepare IPFS configuration
      const ipfsConfig = {
        host: args.ipfsUrl || 'ipfs.infura.io',
        port: args.ipfsPort || 5001,
        protocol: args.ipfsProtocol || 'https'
      };

      // Add authentication if provided
      const headers: any = {};
      if (args.projectId && args.projectSecret) {
        const auth = 'Basic ' + Buffer.from(`${args.projectId}:${args.projectSecret}`).toString('base64');
        headers.Authorization = auth;
      }

      // Publish to IPFS using the ipfs-http-client
      const IpfsHttpClient = require('ipfs-http-client');
      const ipfs = IpfsHttpClient({
        ...ipfsConfig,
        headers: Object.keys(headers).length > 0 ? headers : undefined
      });

      const result = await ipfs.add(content);
      const ipfsHash = result.path;
      const ipfsUrl = `dweb:/ipfs/${ipfsHash}`;

      // Save the file to ipfs folder in Remix
      try {
        await plugin.call('fileManager', 'writeFile', `ipfs/${ipfsHash}`, content);
      } catch (writeError) {
        console.warn('Failed to write to ipfs folder:', writeError);
      }

      const publishResult: IPFSPublishResult = {
        success: true,
        fileName: args.filePath,
        hash: ipfsHash,
        url: ipfsUrl,
        size: content.length
      };

      return this.createSuccessResult(publishResult);

    } catch (error) {
      return this.createErrorResult(`Failed to publish to IPFS: ${error.message}`);
    }
  }
}

/**
 * Publish Multiple Files to IPFS Tool Handler
 */
export class PublishMultipleFilesToIPFSHandler extends BaseToolHandler {
  name = 'publish_multiple_files_to_ipfs';
  description = 'Publish multiple files to IPFS';
  inputSchema = {
    type: 'object',
    properties: {
      filePaths: {
        type: 'array',
        description: 'Array of file paths to publish',
        items: {
          type: 'string'
        },
        minItems: 1
      },
      ipfsUrl: {
        type: 'string',
        description: 'IPFS node URL (optional, defaults to Infura)',
        default: 'ipfs.infura.io'
      },
      ipfsPort: {
        type: 'number',
        description: 'IPFS node port (optional)',
        default: 5001
      },
      ipfsProtocol: {
        type: 'string',
        description: 'IPFS protocol (http or https)',
        enum: ['http', 'https'],
        default: 'https'
      },
      projectId: {
        type: 'string',
        description: 'IPFS project ID for authentication (optional)'
      },
      projectSecret: {
        type: 'string',
        description: 'IPFS project secret for authentication (optional)'
      }
    },
    required: ['filePaths']
  };

  getPermissions(): string[] {
    return ['ipfs:publish', 'file:read'];
  }

  validate(args: PublishMultipleToIPFSArgs): boolean | string {
    const required = this.validateRequired(args, ['filePaths']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      filePaths: 'object',
      ipfsUrl: 'string',
      ipfsPort: 'number',
      ipfsProtocol: 'string',
      projectId: 'string',
      projectSecret: 'string'
    });
    if (types !== true) return types;

    if (!Array.isArray(args.filePaths)) {
      return 'filePaths must be an array';
    }

    if (args.filePaths.length === 0) {
      return 'filePaths array cannot be empty';
    }

    if (args.ipfsProtocol && !['http', 'https'].includes(args.ipfsProtocol)) {
      return 'Invalid IPFS protocol: must be "http" or "https"';
    }

    return true;
  }

  async execute(args: PublishMultipleToIPFSArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Prepare IPFS configuration
      const ipfsConfig = {
        host: args.ipfsUrl || 'ipfs.infura.io',
        port: args.ipfsPort || 5001,
        protocol: args.ipfsProtocol || 'https'
      };

      // Add authentication if provided
      const headers: any = {};
      if (args.projectId && args.projectSecret) {
        const auth = 'Basic ' + Buffer.from(`${args.projectId}:${args.projectSecret}`).toString('base64');
        headers.Authorization = auth;
      }

      // Initialize IPFS client
      const IpfsHttpClient = require('ipfs-http-client');
      const ipfs = IpfsHttpClient({
        ...ipfsConfig,
        headers: Object.keys(headers).length > 0 ? headers : undefined
      });

      const results: IPFSPublishResult[] = [];
      const errors: string[] = [];

      // Process each file
      for (const filePath of args.filePaths) {
        try {
          // Check if file exists
          const exists = await plugin.call('fileManager', 'exists', filePath);
          if (!exists) {
            errors.push(`File not found: ${filePath}`);
            continue;
          }

          // Read file content
          const content = await plugin.call('fileManager', 'readFile', filePath);

          // Publish to IPFS
          const result = await ipfs.add(content);
          const ipfsHash = result.path;
          const ipfsUrl = `dweb:/ipfs/${ipfsHash}`;

          // Save the file to ipfs folder in Remix
          try {
            await plugin.call('fileManager', 'writeFile', `ipfs/${ipfsHash}`, content);
          } catch (writeError) {
            console.warn(`Failed to write to ipfs folder for ${filePath}:`, writeError);
          }

          results.push({
            success: true,
            fileName: filePath,
            hash: ipfsHash,
            url: ipfsUrl,
            size: content.length
          });

        } catch (fileError) {
          errors.push(`Failed to publish ${filePath}: ${fileError.message}`);
        }
      }

      if (results.length === 0) {
        return this.createErrorResult(`Failed to publish any files. Errors: ${errors.join(', ')}`);
      }

      const response = {
        success: true,
        published: results,
        totalPublished: results.length,
        totalFailed: errors.length,
        errors: errors.length > 0 ? errors : undefined
      };

      return this.createSuccessResult(response);

    } catch (error) {
      return this.createErrorResult(`Failed to publish files to IPFS: ${error.message}`);
    }
  }
}

/**
 * Create IPFS tool definitions
 */
export function createIPFSTools(): RemixToolDefinition[] {
  return [
    {
      name: 'publish_file_to_ipfs',
      description: 'Publish a single file to IPFS',
      inputSchema: new PublishFileToIPFSHandler().inputSchema,
      category: ToolCategory.FILE_MANAGEMENT,
      permissions: ['ipfs:publish', 'file:read'],
      handler: new PublishFileToIPFSHandler()
    },
    {
      name: 'publish_multiple_files_to_ipfs',
      description: 'Publish multiple files to IPFS',
      inputSchema: new PublishMultipleFilesToIPFSHandler().inputSchema,
      category: ToolCategory.FILE_MANAGEMENT,
      permissions: ['ipfs:publish', 'file:read'],
      handler: new PublishMultipleFilesToIPFSHandler()
    }
  ];
}
