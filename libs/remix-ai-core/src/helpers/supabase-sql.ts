import { validateTableName, validateColumnName, validateDataType } from './supabase-validation'

export interface ColumnDefinition {
  name: string
  type: string
  primary?: boolean
  nullable?: boolean
  default?: string
  unique?: boolean
}

export function buildCreateTableSQL(tableName: string, columns: ColumnDefinition[]): string {
  const tableNameError = validateTableName(tableName)
  if (tableNameError) {
    throw new Error(`Invalid table name: ${tableNameError}`)
  }
  
  if (!columns || columns.length === 0) {
    throw new Error('At least one column is required')
  }
  
  // Always add standard columns
  const standardColumns: ColumnDefinition[] = [
    { name: 'id', type: 'uuid', primary: true, default: 'gen_random_uuid()' },
    { name: 'created_at', type: 'timestamptz', default: 'now()', nullable: false }
  ]
  
  // Check if user provided conflicting standard columns
  const userColumnNames = columns.map(col => col.name)
  if (userColumnNames.includes('id') || userColumnNames.includes('created_at')) {
    throw new Error('id and created_at columns are automatically added and cannot be specified manually')
  }
  
  const allColumns = [...standardColumns, ...columns]
  
  const columnDefinitions = allColumns.map(col => {
    const nameError = validateColumnName(col.name)
    if (nameError) {
      throw new Error(`Invalid column name '${col.name}': ${nameError}`)
    }
    
    const typeError = validateDataType(col.type)
    if (typeError) {
      throw new Error(`Invalid data type '${col.type}': ${typeError}`)
    }
    
    let def = `"${col.name}" ${col.type.toUpperCase()}`
    
    if (col.primary) {
      def += ' PRIMARY KEY'
    }
    
    if (!col.nullable && !col.primary) {
      def += ' NOT NULL'
    }
    
    if (col.unique && !col.primary) {
      def += ' UNIQUE'
    }
    
    if (col.default) {
      def += ` DEFAULT ${col.default}`
    }
    
    return def
  })
  
  return `CREATE TABLE "${tableName}" (${columnDefinitions.join(', ')})`
}

export function buildAddColumnSQL(tableName: string, column: ColumnDefinition): string {
  const tableNameError = validateTableName(tableName)
  if (tableNameError) {
    throw new Error(`Invalid table name: ${tableNameError}`)
  }
  
  const nameError = validateColumnName(column.name)
  if (nameError) {
    throw new Error(`Invalid column name: ${nameError}`)
  }
  
  const typeError = validateDataType(column.type)
  if (typeError) {
    throw new Error(`Invalid data type: ${typeError}`)
  }
  
  let columnDef = `"${column.name}" ${column.type.toUpperCase()}`
  
  if (!column.nullable) {
    columnDef += ' NOT NULL'
  }
  
  if (column.unique) {
    columnDef += ' UNIQUE'
  }
  
  if (column.default) {
    columnDef += ` DEFAULT ${column.default}`
  }
  
  return `ALTER TABLE "${tableName}" ADD COLUMN ${columnDef}`
}

export function buildDropTableSQL(tableName: string): string {
  const tableNameError = validateTableName(tableName)
  if (tableNameError) {
    throw new Error(`Invalid table name: ${tableNameError}`)
  }
  
  return `DROP TABLE "${tableName}"`
}

export function buildEnableRLSSQL(tableName: string): string {
  const tableNameError = validateTableName(tableName)
  if (tableNameError) {
    throw new Error(`Invalid table name: ${tableNameError}`)
  }
  
  return `ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY`
}

export function buildCreatePolicySQL(
  tableName: string,
  policyName: string,
  command: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL',
  usingExpression: string,
  checkExpression?: string
): string {
  const tableNameError = validateTableName(tableName)
  if (tableNameError) {
    throw new Error(`Invalid table name: ${tableNameError}`)
  }
  
  if (!policyName || typeof policyName !== 'string') {
    throw new Error('Policy name is required')
  }
  
  const allowedCommands = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL']
  if (!allowedCommands.includes(command)) {
    throw new Error(`Invalid command. Allowed: ${allowedCommands.join(', ')}`)
  }
  
  if (!usingExpression || typeof usingExpression !== 'string') {
    throw new Error('Using expression is required')
  }
  
  let sql = `CREATE POLICY "${policyName}" ON "${tableName}" FOR ${command} USING (${usingExpression})`
  
  if (checkExpression && (command === 'INSERT' || command === 'UPDATE' || command === 'ALL')) {
    sql += ` WITH CHECK (${checkExpression})`
  }
  
  return sql
}

export function buildGetTableSchemaSQL(tableName: string): string {
  const tableNameError = validateTableName(tableName)
  if (tableNameError) {
    throw new Error(`Invalid table name: ${tableNameError}`)
  }
  
  return `
    SELECT 
      c.column_name,
      c.data_type,
      c.is_nullable,
      c.column_default,
      tc.constraint_type,
      kcu.table_name as foreign_table,
      kcu.column_name as foreign_column
    FROM information_schema.columns c
    LEFT JOIN information_schema.key_column_usage kcu 
      ON c.table_name = kcu.table_name 
      AND c.column_name = kcu.column_name
    LEFT JOIN information_schema.table_constraints tc 
      ON kcu.constraint_name = tc.constraint_name
    WHERE c.table_schema = 'public' 
      AND c.table_name = '${tableName}'
    ORDER BY c.ordinal_position
  `
}

export function buildListTablesSQL(): string {
  return `
    SELECT 
      table_name,
      0 as row_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `
}

export function buildListRLSPoliciesSQL(tableName: string): string {
  const tableNameError = validateTableName(tableName)
  if (tableNameError) {
    throw new Error(`Invalid table name: ${tableNameError}`)
  }
  
  return `
    SELECT 
      policyname as policy_name,
      cmd as command,
      qual as using_expression,
      with_check as check_expression
    FROM pg_policies 
    WHERE tablename = '${tableName}'
      AND schemaname = 'public'
    ORDER BY policyname
  `
}

export async function executeSQLWithSupabase(supabase: any, sql: string): Promise<any> {
  try {
    // Use Supabase Management API for DDL operations
    const { data, error } = await supabase.rpc('exec_sql', { sql })
    
    if (error) {
      throw new Error(`SQL execution failed: ${error.message}`)
    }
    
    return data
  } catch (err: any) {
    // Fallback to direct database query if exec_sql RPC doesn't exist
    if (err.message.includes('function exec_sql')) {
      throw new Error('exec_sql RPC function not available. Please create it in your Supabase database or use the Management API')
    }
    throw err
  }
}