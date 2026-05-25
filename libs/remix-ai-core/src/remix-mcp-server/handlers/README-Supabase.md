# Supabase MCP Handler

A Model Context Protocol (MCP) server that provides a comprehensive admin layer for Supabase, integrated into the Remix IDE. This handler allows AI assistants to manage Supabase databases, including schema operations, data manipulation, security policies, and storage management.

## Features

### Schema Introspection
- **supabase_list_tables**: List all tables in the public schema with row counts
- **supabase_get_table_schema**: Get detailed schema information including columns, types, and relationships

### Schema Management
- **supabase_create_table**: Create new tables with automatic id and created_at columns
- **supabase_add_column**: Add columns to existing tables
- **supabase_drop_table**: Delete tables (requires confirmation for safety)

### Data Operations
- **supabase_query_rows**: Query table data with filtering, ordering, and pagination
- **supabase_insert_rows**: Insert single or multiple rows
- **supabase_update_rows**: Update rows based on filters
- **supabase_delete_rows**: Delete rows based on filters (filters required for safety)

### Security & RLS
- **supabase_enable_rls**: Enable Row Level Security on tables
- **supabase_create_rls_policy**: Create RLS policies with USING and CHECK expressions
- **supabase_list_rls_policies**: List all RLS policies for a table

### Storage
- **supabase_list_buckets**: List all storage buckets
- **supabase_create_bucket**: Create new storage buckets (public/private)

### Edge Functions
- **supabase_list_edge_functions**: List deployed edge functions (placeholder for Management API)

## Environment Variables

Set these in your Remix IDE environment or .env file:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Security Features

- **Input Validation**: All inputs are validated against strict patterns
- **SQL Injection Protection**: Dangerous SQL patterns are blocked
- **System Table Protection**: Operations on system tables are prevented
- **Required Confirmations**: Destructive operations require explicit confirmation
- **Filter Requirements**: DELETE operations must include filters to prevent accidental data loss

## Usage Examples

### Create a table
```json
{
  "name": "create_table",
  "arguments": {
    "table_name": "users",
    "columns": [
      {"name": "email", "type": "text", "unique": true},
      {"name": "name", "type": "text", "nullable": false},
      {"name": "age", "type": "integer"}
    ]
  }
}
```

### Query data with filters
```json
{
  "name": "query_rows",
  "arguments": {
    "table_name": "users",
    "filters": [
      {"column": "age", "operator": "gte", "value": 18}
    ],
    "order_by": {"column": "created_at", "ascending": false},
    "limit": 20
  }
}
```

### Create RLS policy
```json
{
  "name": "create_rls_policy",
  "arguments": {
    "table_name": "users",
    "policy_name": "users_can_view_own_profile",
    "command": "SELECT",
    "using_expression": "auth.uid() = user_id"
  }
}
```

## Error Handling

All tools return a consistent response format:

**Success:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "error": "Description of the error"
}
```

## Architecture

The handler is structured in multiple layers:

- **SupabaseHandler**: Main MCP tool handler
- **supabase.ts**: Client management and connection
- **supabase-validation.ts**: Input validation and security checks  
- **supabase-sql.ts**: SQL query builders and execution helpers

## Integration with Remix IDE

The SupabaseHandler is integrated into the RemixMCPServer and automatically loaded when the MCP server starts. Tools are made available alongside other Remix IDE MCP tools.

## Limitations

- Edge Functions listing requires Management API access (not yet implemented)
- Row counts in table listing are set to 0 for performance (can be enhanced)
- Some advanced Supabase features not yet exposed (triggers, functions, etc.)

## Future Enhancements

- Full Management API integration for edge functions
- Support for database functions and triggers  
- Real-time subscriptions support
- Migration management tools
- Backup and restore capabilities
- Multi-schema support beyond public schema

## Contributing

This handler follows the established patterns in the Remix MCP server. When adding new tools:

1. Add validation for all inputs
2. Follow the consistent error handling pattern
3. Update this README with new tool documentation
4. Add appropriate security checks
5. Test thoroughly with various input scenarios