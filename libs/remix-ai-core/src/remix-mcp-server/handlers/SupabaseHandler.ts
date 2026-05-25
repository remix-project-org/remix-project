/**
 * Supabase Tool Handlers for Remix MCP Server
 */

import { IMCPToolResult } from '../../types/mcp';
import { BaseToolHandler } from '../registry/RemixToolRegistry';
import { ToolCategory, RemixToolDefinition } from '../types/mcpTools';
import { Plugin } from '@remixproject/engine';
import { getSupabaseClient } from '../../helpers/supabase';
import {
  validateTableName,
  validateColumnName,
  validateBucketName,
  validatePolicyName,
  validateFilters,
  sanitizeInput
} from '../../helpers/supabase-validation';
import {
  buildCreateTableSQL,
  buildAddColumnSQL,
  buildDropTableSQL,
  buildEnableRLSSQL,
  buildCreatePolicySQL,
  buildGetTableSchemaSQL,
  buildListTablesSQL,
  buildListRLSPoliciesSQL,
  executeSQLWithSupabase,
  ColumnDefinition
} from '../../helpers/supabase-sql';

/**
 * List Tables Tool Handler
 */
export class ListTablesHandler extends BaseToolHandler {
  name = 'supabase_list_tables';
  description = 'Lists all tables in the public schema with row counts';
  inputSchema = {
    type: 'object',
    properties: {},
    required: []
  };

  getPermissions(): string[] {
    return ['supabase:read'];
  }

  async execute(_args: any, _plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const client = getSupabaseClient();
      const sql = buildListTablesSQL();
      const data = await executeSQLWithSupabase(client, sql);
      
      return this.createSuccessResult({
        success: true,
        tables: data || []
      });
    } catch (error: any) {
      return this.createErrorResult(`Failed to list tables: ${error.message}`);
    }
  }
}

/**
 * Get Table Schema Tool Handler
 */
export class GetTableSchemaHandler extends BaseToolHandler {
  name = 'supabase_get_table_schema';
  description = 'Get detailed schema information for a specific table including columns and relationships';
  inputSchema = {
    type: 'object',
    properties: {
      table_name: {
        type: 'string',
        description: 'Name of the table to inspect'
      }
    },
    required: ['table_name']
  };

  getPermissions(): string[] {
    return ['supabase:read'];
  }

  validate(args: { table_name: string }): boolean | string {
    const required = this.validateRequired(args, ['table_name']);
    if (required !== true) return required;

    const error = validateTableName(args.table_name);
    if (error) return error;

    return true;
  }

  async execute(args: { table_name: string }, _plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const client = getSupabaseClient();
      const sql = buildGetTableSchemaSQL(args.table_name);
      const data = await executeSQLWithSupabase(client, sql);
      
      return this.createSuccessResult({
        success: true,
        table_name: args.table_name,
        schema: data || []
      });
    } catch (error: any) {
      return this.createErrorResult(`Failed to get table schema: ${error.message}`);
    }
  }
}

/**
 * Create Table Tool Handler
 */
export class CreateTableHandler extends BaseToolHandler {
  name = 'supabase_create_table';
  description = 'Create a new table with specified columns. Automatically adds id (uuid, primary key) and created_at (timestamptz) columns';
  inputSchema = {
    type: 'object',
    properties: {
      table_name: {
        type: 'string',
        description: 'Name of the table to create'
      },
      columns: {
        type: 'array',
        description: 'Array of column definitions',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string' },
            nullable: { type: 'boolean', default: true },
            default: { type: 'string' },
            unique: { type: 'boolean', default: false }
          },
          required: ['name', 'type']
        }
      }
    },
    required: ['table_name', 'columns']
  };

  getPermissions(): string[] {
    return ['supabase:write', 'supabase:schema'];
  }

  validate(args: { table_name: string; columns: ColumnDefinition[] }): boolean | string {
    const required = this.validateRequired(args, ['table_name', 'columns']);
    if (required !== true) return required;

    const tableError = validateTableName(args.table_name);
    if (tableError) return tableError;

    if (!Array.isArray(args.columns) || args.columns.length === 0) {
      return 'At least one column is required';
    }

    for (const col of args.columns) {
      const colError = validateColumnName(col.name);
      if (colError) return `Invalid column '${col.name}': ${colError}`;
    }

    return true;
  }

  async execute(args: { table_name: string; columns: ColumnDefinition[] }, _plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const sql = buildCreateTableSQL(args.table_name, args.columns);
      const client = getSupabaseClient();
      await executeSQLWithSupabase(client, sql);
      
      return this.createSuccessResult({
        success: true,
        message: `Table '${args.table_name}' created successfully`,
        table_name: args.table_name
      });
    } catch (error: any) {
      return this.createErrorResult(`Failed to create table: ${error.message}`);
    }
  }
}

/**
 * Drop Table Tool Handler
 */
export class DropTableHandler extends BaseToolHandler {
  name = 'supabase_drop_table';
  description = 'Delete a table permanently. Requires confirm=true to prevent accidental drops';
  inputSchema = {
    type: 'object',
    properties: {
      table_name: { type: 'string' },
      confirm: { type: 'boolean', description: 'Must be true to confirm deletion' }
    },
    required: ['table_name', 'confirm']
  };

  getPermissions(): string[] {
    return ['supabase:delete', 'supabase:schema'];
  }

  validate(args: { table_name: string; confirm: boolean }): boolean | string {
    const required = this.validateRequired(args, ['table_name', 'confirm']);
    if (required !== true) return required;

    const tableError = validateTableName(args.table_name);
    if (tableError) return tableError;

    if (!args.confirm) {
      return 'Table deletion requires confirm=true to prevent accidental drops';
    }

    return true;
  }

  async execute(args: { table_name: string; confirm: boolean }, _plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const sql = buildDropTableSQL(args.table_name);
      const client = getSupabaseClient();
      await executeSQLWithSupabase(client, sql);
      
      return this.createSuccessResult({
        success: true,
        message: `Table '${args.table_name}' dropped successfully`,
        table_name: args.table_name
      });
    } catch (error: any) {
      return this.createErrorResult(`Failed to drop table: ${error.message}`);
    }
  }
}

/**
 * Query Rows Tool Handler
 */
export class QueryRowsHandler extends BaseToolHandler {
  name = 'supabase_query_rows';
  description = 'Query rows from a table with optional filtering, ordering, and limits';
  inputSchema = {
    type: 'object',
    properties: {
      table_name: { type: 'string' },
      select: {
        type: 'array',
        items: { type: 'string' },
        description: 'Columns to select (default: all)'
      },
      filters: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            column: { type: 'string' },
            operator: { 
              type: 'string', 
              enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in', 'is', 'not.is']
            },
            value: {}
          },
          required: ['column', 'operator', 'value']
        }
      },
      order_by: {
        type: 'object',
        properties: {
          column: { type: 'string' },
          ascending: { type: 'boolean', default: true }
        },
        required: ['column']
      },
      limit: { type: 'number', default: 10, maximum: 1000 }
    },
    required: ['table_name']
  };

  getPermissions(): string[] {
    return ['supabase:read'];
  }

  validate(args: any): boolean | string {
    const required = this.validateRequired(args, ['table_name']);
    if (required !== true) return required;

    const tableError = validateTableName(args.table_name);
    if (tableError) return tableError;

    if (args.filters) {
      const filterError = validateFilters(args.filters);
      if (filterError) return filterError;
    }

    return true;
  }

  async execute(args: any, _plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const client = getSupabaseClient();
      let query = client.from(args.table_name).select(
        args.select && args.select.length > 0 ? args.select.join(', ') : '*'
      );

      if (args.filters && args.filters.length > 0) {
        for (const filter of args.filters) {
          query = query.filter(filter.column, filter.operator, filter.value);
        }
      }

      if (args.order_by) {
        query = query.order(args.order_by.column, { ascending: args.order_by.ascending !== false });
      }

      const finalLimit = Math.min(args.limit || 10, 1000);
      query = query.limit(finalLimit);

      const { data, error } = await query;
      if (error) {
        return this.createErrorResult(`Query failed: ${error.message}`);
      }

      return this.createSuccessResult({
        success: true,
        table_name: args.table_name,
        rows: data || [],
        count: data?.length || 0
      });
    } catch (error: any) {
      return this.createErrorResult(`Failed to query rows: ${error.message}`);
    }
  }
}

/**
 * Insert Rows Tool Handler
 */
export class InsertRowsHandler extends BaseToolHandler {
  name = 'supabase_insert_rows';
  description = 'Insert one or more rows into a table';
  inputSchema = {
    type: 'object',
    properties: {
      table_name: { type: 'string' },
      rows: {
        type: 'array',
        items: { type: 'object' },
        description: 'Array of objects representing rows to insert'
      }
    },
    required: ['table_name', 'rows']
  };

  getPermissions(): string[] {
    return ['supabase:write'];
  }

  validate(args: { table_name: string; rows: any[] }): boolean | string {
    const required = this.validateRequired(args, ['table_name', 'rows']);
    if (required !== true) return required;

    const tableError = validateTableName(args.table_name);
    if (tableError) return tableError;

    if (!Array.isArray(args.rows) || args.rows.length === 0) {
      return 'At least one row is required for insertion';
    }

    return true;
  }

  async execute(args: { table_name: string; rows: any[] }, _plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const sanitizedRows = args.rows.map(row => {
        const sanitized: any = {};
        for (const [key, value] of Object.entries(row)) {
          sanitized[key] = sanitizeInput(value);
        }
        return sanitized;
      });

      const client = getSupabaseClient();
      const { data, error } = await client
        .from(args.table_name)
        .insert(sanitizedRows)
        .select();

      if (error) {
        return this.createErrorResult(`Insert failed: ${error.message}`);
      }

      return this.createSuccessResult({
        success: true,
        message: `Inserted ${args.rows.length} row(s) into '${args.table_name}'`,
        table_name: args.table_name,
        inserted_rows: data || [],
        count: data?.length || 0
      });
    } catch (error: any) {
      return this.createErrorResult(`Failed to insert rows: ${error.message}`);
    }
  }
}

/**
 * Enable RLS Tool Handler
 */
export class EnableRLSHandler extends BaseToolHandler {
  name = 'supabase_enable_rls';
  description = 'Enable Row Level Security on a table';
  inputSchema = {
    type: 'object',
    properties: {
      table_name: { type: 'string' }
    },
    required: ['table_name']
  };

  getPermissions(): string[] {
    return ['supabase:security', 'supabase:schema'];
  }

  validate(args: { table_name: string }): boolean | string {
    const required = this.validateRequired(args, ['table_name']);
    if (required !== true) return required;

    const tableError = validateTableName(args.table_name);
    if (tableError) return tableError;

    return true;
  }

  async execute(args: { table_name: string }, _plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const sql = buildEnableRLSSQL(args.table_name);
      const client = getSupabaseClient();
      await executeSQLWithSupabase(client, sql);
      
      return this.createSuccessResult({
        success: true,
        message: `RLS enabled on table '${args.table_name}'`,
        table_name: args.table_name
      });
    } catch (error: any) {
      return this.createErrorResult(`Failed to enable RLS: ${error.message}`);
    }
  }
}

/**
 * List Buckets Tool Handler
 */
export class ListBucketsHandler extends BaseToolHandler {
  name = 'supabase_list_buckets';
  description = 'List all storage buckets';
  inputSchema = {
    type: 'object',
    properties: {},
    required: []
  };

  getPermissions(): string[] {
    return ['supabase:storage'];
  }

  async execute(_args: any, _plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const client = getSupabaseClient();
      const { data, error } = await client.storage.listBuckets();

      if (error) {
        return this.createErrorResult(`Failed to list buckets: ${error.message}`);
      }

      return this.createSuccessResult({
        success: true,
        buckets: data || [],
        count: data?.length || 0
      });
    } catch (error: any) {
      return this.createErrorResult(`Failed to list buckets: ${error.message}`);
    }
  }
}

/**
 * Create Bucket Tool Handler
 */
export class CreateBucketHandler extends BaseToolHandler {
  name = 'supabase_create_bucket';
  description = 'Create a new storage bucket';
  inputSchema = {
    type: 'object',
    properties: {
      bucket_name: { type: 'string' },
      public: { type: 'boolean', default: false }
    },
    required: ['bucket_name']
  };

  getPermissions(): string[] {
    return ['supabase:storage', 'supabase:write'];
  }

  validate(args: { bucket_name: string; public?: boolean }): boolean | string {
    const required = this.validateRequired(args, ['bucket_name']);
    if (required !== true) return required;

    const bucketError = validateBucketName(args.bucket_name);
    if (bucketError) return bucketError;

    return true;
  }

  async execute(args: { bucket_name: string; public?: boolean }, _plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const client = getSupabaseClient();
      const { data, error } = await client.storage.createBucket(args.bucket_name, {
        public: args.public || false
      });

      if (error) {
        return this.createErrorResult(`Failed to create bucket: ${error.message}`);
      }

      return this.createSuccessResult({
        success: true,
        message: `Bucket '${args.bucket_name}' created successfully`,
        bucket_name: args.bucket_name,
        public: args.public || false,
        data
      });
    } catch (error: any) {
      return this.createErrorResult(`Failed to create bucket: ${error.message}`);
    }
  }
}

/**
 * Create Supabase tool definitions
 */
export function createSupabaseTools(): RemixToolDefinition[] {
  return [
    {
      name: 'supabase_list_tables',
      description: 'Lists all tables in the public schema with row counts',
      inputSchema: new ListTablesHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT, // Using DEPLOYMENT as closest category
      permissions: ['supabase:read'],
      handler: new ListTablesHandler()
    },
    {
      name: 'supabase_get_table_schema',
      description: 'Get detailed schema information for a specific table including columns and relationships',
      inputSchema: new GetTableSchemaHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['supabase:read'],
      handler: new GetTableSchemaHandler()
    },
    {
      name: 'supabase_create_table',
      description: 'Create a new table with specified columns. Automatically adds id and created_at columns',
      inputSchema: new CreateTableHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['supabase:write', 'supabase:schema'],
      handler: new CreateTableHandler()
    },
    {
      name: 'supabase_drop_table',
      description: 'Delete a table permanently. Requires confirm=true to prevent accidental drops',
      inputSchema: new DropTableHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['supabase:delete', 'supabase:schema'],
      handler: new DropTableHandler()
    },
    {
      name: 'supabase_query_rows',
      description: 'Query rows from a table with optional filtering, ordering, and limits',
      inputSchema: new QueryRowsHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['supabase:read'],
      handler: new QueryRowsHandler()
    },
    {
      name: 'supabase_insert_rows',
      description: 'Insert one or more rows into a table',
      inputSchema: new InsertRowsHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['supabase:write'],
      handler: new InsertRowsHandler()
    },
    {
      name: 'supabase_enable_rls',
      description: 'Enable Row Level Security on a table',
      inputSchema: new EnableRLSHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['supabase:security', 'supabase:schema'],
      handler: new EnableRLSHandler()
    },
    {
      name: 'supabase_list_buckets',
      description: 'List all storage buckets',
      inputSchema: new ListBucketsHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['supabase:storage'],
      handler: new ListBucketsHandler()
    },
    {
      name: 'supabase_create_bucket',
      description: 'Create a new storage bucket',
      inputSchema: new CreateBucketHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['supabase:storage', 'supabase:write'],
      handler: new CreateBucketHandler()
    }
  ];
}