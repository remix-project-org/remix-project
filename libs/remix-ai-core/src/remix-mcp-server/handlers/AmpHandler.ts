/* eslint-disable no-async-promise-executor */
/**
 * Amp Query Tool Handlers for Remix MCP Server
 *
 * Provides functionality to query data using the Amp hosted server
 */
import { IMCPToolResult } from '../../types/mcp';
import { BaseToolHandler } from '../registry/RemixToolRegistry';
import {
  ToolCategory,
  RemixToolDefinition
} from '../types/mcpTools';
import { Plugin } from '@remixproject/engine';

/**
 * Amp Query argument types
 */
export interface AmpQueryArgs {
  query: string
}

/**
 * Amp Query result types
 */
export interface AmpQueryResult<T = any> {
  success: boolean;
  data: Array<T>;
  rowCount: number;
  query: string;
  error?: string;
}

/**
 * Amp Query Tool Handler
 */
export class AmpQueryHandler extends BaseToolHandler {
  name = 'amp_query';
  description = 'Execute SQL queries against the Amp hosted server to retrieve blockchain data';
  inputSchema = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'SQL query to execute against the Amp server'
      }
    },
    required: ['query']
  };

  getPermissions(): string[] {
    return ['amp:query'];
  }

  validate(args: AmpQueryArgs): boolean | string {
    const required = this.validateRequired(args, ['query']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      query: 'string'
    });
    if (types !== true) return types;

    if (args.query.trim().length === 0) {
      return 'Query cannot be empty';
    }

    return true;
  }

  async execute(args: AmpQueryArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Show a notification that the query is being executed
      plugin.call('notification', 'toast', `Executing Amp query...`);

      const authToken: string | undefined = await plugin.call('config', 'getEnv', 'AMP_QUERY_TOKEN');
      const baseUrl: string | undefined = await plugin.call('config', 'getEnv', 'AMP_QUERY_URL');
      // Perform the Amp query
      const data = await plugin.call('amp', 'performAmpQuery', args.query, baseUrl, authToken)

      const result: AmpQueryResult = {
        success: true,
        data: data,
        rowCount: data.length,
        query: args.query
      };

      // Show success notification
      plugin.call('notification', 'toast', `Query completed successfully. Retrieved ${data.length} rows.`);

      return this.createSuccessResult(result);

    } catch (error) {
      console.error('Amp query error:', error?.cause?.rawMessage);

      const errorMessage = error?.cause?.rawMessage

      // Show error notification
      plugin.call('notification', 'toast', `Amp query failed: ${errorMessage}`);

      return this.createErrorResult(`Amp query failed: ${errorMessage}`);
    }
  }
}

/**
 * Amp Dataset Manifest argument types
 */
export interface AmpDatasetManifestArgs {
  datasetName: string;
  version: string;
}

/**
 * Amp Dataset Manifest result types
 */
export interface AmpDatasetManifestResult {
  success: boolean;
  manifest?: any;
  datasetName: string;
  version: string;
  error?: string;
}

/**
 * Amp Dataset List result types
 */
export interface AmpDatasetListResult {
  success: boolean;
  result: any
}

/**
 * Amp Dataset Manifest Tool Handler
 */
export class AmpDatasetManifestHandler extends BaseToolHandler {
  name = 'amp_dataset_manifest';
  description = 'Fetch manifest information for a specific Amp dataset version';
  inputSchema = {
    type: 'object',
    properties: {
      datasetName: {
        type: 'string',
        description: 'Dataset name in format owner/name (e.g., "shiyasmohd/counter")'
      },
      version: {
        type: 'string',
        description: 'Dataset version (e.g., "0.0.2")'
      }
    },
    required: ['datasetName', 'version']
  };

  getPermissions(): string[] {
    return ['amp:dataset:manifest'];
  }

  validate(args: AmpDatasetManifestArgs): boolean | string {
    const required = this.validateRequired(args, ['datasetName', 'version']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      datasetName: 'string',
      version: 'string'
    });
    if (types !== true) return types;

    if (args.datasetName.trim().length === 0) {
      return 'Dataset name cannot be empty';
    }

    if (args.version.trim().length === 0) {
      return 'Version cannot be empty';
    }

    return true;
  }

  async execute(args: AmpDatasetManifestArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Show a notification that the manifest is being fetched
      plugin.call('notification', 'toast', `Fetching manifest for ${args.datasetName}@${args.version}...`);

      const response = await plugin.call('amp', 'fetchManifest', args.datasetName, args.version)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const manifest = await response.json();

      const result: AmpDatasetManifestResult = {
        success: true,
        manifest: manifest,
        datasetName: args.datasetName,
        version: args.version
      };

      // Show success notification
      plugin.call('notification', 'toast', `Manifest fetched successfully for ${args.datasetName}@${args.version}`);

      return this.createSuccessResult(result);

    } catch (error) {
      console.error('Amp dataset manifest fetch error:', error?.cause?.rawMessage);

      const errorMessage = error?.cause?.rawMessage

      // Show error notification
      plugin.call('notification', 'toast', `Failed to fetch manifest: ${errorMessage}`);

      return this.createErrorResult(`Failed to fetch manifest: ${errorMessage}`);
    }
  }
}

/**
 * Amp Dataset Manifest Tool Handler
 */
export class AmpDatasetListHandler extends BaseToolHandler {
  name = 'amp_dataset_manifest';
  description = 'Fetch list of available public dataset in Amp';
  inputSchema = {
    type: 'object',
    properties: {},
    required: []
  };

  getPermissions(): string[] {
    return ['amp:dataset:list'];
  }

  validate(args: AmpDatasetManifestArgs): boolean | string {
    return true;
  }

  async execute(args: any, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Show a notification that the manifest is being fetched
      const response = await plugin.call('amp', 'listDatasets')

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const list = await response.json()
      const result: AmpDatasetListResult = {
        success: true,
        result: list.result?.data?.json?.datasets.map((d) => {
          const short = {
            latest_version: d.latest_version
          }
          return { indexing_chains: d.indexing_chains, description: d.description, ...short }
        })
      };

      console.log(result)
      return this.createSuccessResult(result);

    } catch (error) {
      console.error('Amp dataset listt fetch error:', error);

      const errorMessage = error instanceof Error ? error.message : String(error);

      return this.createErrorResult(`Failed to fetch manifest: ${errorMessage}`);
    }
  }
}

/**
 * Create Amp tool definitions
 */
export function createAmpTools(): RemixToolDefinition[] {
  return [
    {
      name: 'amp_query',
      description: 'Execute SQL queries against the Amp hosted server to retrieve blockchain data',
      inputSchema: new AmpQueryHandler().inputSchema,
      category: ToolCategory.ANALYSIS,
      permissions: ['amp:query'],
      handler: new AmpQueryHandler()
    },
    {
      name: 'amp_dataset_manifest',
      description: 'Fetch manifest information for a specific Amp dataset version',
      inputSchema: new AmpDatasetManifestHandler().inputSchema,
      category: ToolCategory.ANALYSIS,
      permissions: ['amp:dataset:manifest'],
      handler: new AmpDatasetManifestHandler()
    },
    {
      name: 'amp_dataset_list',
      description: 'Fetch list of available dataset',
      inputSchema: new AmpDatasetListHandler().inputSchema,
      category: ToolCategory.ANALYSIS,
      permissions: ['amp:dataset:list'],
      handler: new AmpDatasetListHandler()
    }
  ];
}
