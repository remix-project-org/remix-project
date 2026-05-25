export interface SupabaseResult<T = any> {
  success: boolean
  data?: T
  error?: string
}

export function createResult<T>(data: T): SupabaseResult<T> {
  return { success: true, data }
}

export function createError(error: string): SupabaseResult {
  return { success: false, error }
}

const TABLE_NAME_REGEX = /^[a-z][a-z0-9_]*$/
const SYSTEM_SCHEMAS = ['pg_', 'information_schema', 'auth.', 'storage.']

export function validateTableName(tableName: string): string | null {
  if (!tableName || typeof tableName !== 'string') {
    return 'Table name must be a non-empty string'
  }
  
  if (tableName.trim() !== tableName) {
    return 'Table name cannot have leading or trailing whitespace'
  }
  
  if (!TABLE_NAME_REGEX.test(tableName)) {
    return 'Table name must start with lowercase letter and contain only lowercase letters, numbers, and underscores'
  }
  
  if (SYSTEM_SCHEMAS.some(schema => tableName.startsWith(schema))) {
    return 'Cannot operate on system tables'
  }
  
  if (tableName.length > 63) {
    return 'Table name must be 63 characters or less'
  }
  
  return null
}

export function validateColumnName(columnName: string): string | null {
  if (!columnName || typeof columnName !== 'string') {
    return 'Column name must be a non-empty string'
  }
  
  if (columnName.trim() !== columnName) {
    return 'Column name cannot have leading or trailing whitespace'
  }
  
  if (!TABLE_NAME_REGEX.test(columnName)) {
    return 'Column name must start with lowercase letter and contain only lowercase letters, numbers, and underscores'
  }
  
  if (columnName.length > 63) {
    return 'Column name must be 63 characters or less'
  }
  
  return null
}

const ALLOWED_DATA_TYPES = [
  'uuid', 'text', 'varchar', 'char', 'integer', 'bigint', 'smallint',
  'decimal', 'numeric', 'real', 'double precision', 'boolean',
  'date', 'time', 'timestamp', 'timestamptz', 'interval',
  'json', 'jsonb', 'bytea', 'inet', 'cidr', 'macaddr'
]

export function validateDataType(dataType: string): string | null {
  if (!dataType || typeof dataType !== 'string') {
    return 'Data type must be a non-empty string'
  }
  
  const normalizedType = dataType.toLowerCase().trim()
  
  // Check for varchar/char with length
  if (normalizedType.match(/^varchar\(\d+\)$/) || normalizedType.match(/^char\(\d+\)$/)) {
    return null
  }
  
  // Check for decimal/numeric with precision
  if (normalizedType.match(/^(decimal|numeric)\(\d+(,\d+)?\)$/)) {
    return null
  }
  
  if (!ALLOWED_DATA_TYPES.includes(normalizedType)) {
    return `Invalid data type. Allowed types: ${ALLOWED_DATA_TYPES.join(', ')}`
  }
  
  return null
}

export function validateBucketName(bucketName: string): string | null {
  if (!bucketName || typeof bucketName !== 'string') {
    return 'Bucket name must be a non-empty string'
  }
  
  if (bucketName.trim() !== bucketName) {
    return 'Bucket name cannot have leading or trailing whitespace'
  }
  
  // Bucket names should follow S3 naming conventions
  if (!/^[a-z0-9][a-z0-9\-]*[a-z0-9]$/.test(bucketName) && bucketName.length > 1) {
    return 'Bucket name must contain only lowercase letters, numbers, and hyphens'
  }
  
  if (bucketName.length < 3 || bucketName.length > 63) {
    return 'Bucket name must be between 3 and 63 characters'
  }
  
  if (bucketName.includes('..') || bucketName.includes('.-') || bucketName.includes('-.')) {
    return 'Bucket name cannot contain consecutive periods or period-hyphen combinations'
  }
  
  return null
}

export function validatePolicyName(policyName: string): string | null {
  if (!policyName || typeof policyName !== 'string') {
    return 'Policy name must be a non-empty string'
  }
  
  if (policyName.trim() !== policyName) {
    return 'Policy name cannot have leading or trailing whitespace'
  }
  
  if (!/^[a-z][a-z0-9_]*$/.test(policyName)) {
    return 'Policy name must start with lowercase letter and contain only lowercase letters, numbers, and underscores'
  }
  
  if (policyName.length > 63) {
    return 'Policy name must be 63 characters or less'
  }
  
  return null
}

export function sanitizeInput(input: any): any {
  if (typeof input === 'string') {
    // Remove potential SQL injection attempts
    const dangerous = ['--', ';', '/*', '*/', 'xp_', 'sp_', 'DROP ', 'DELETE ', 'TRUNCATE ', 'ALTER ']
    const lowerInput = input.toLowerCase()
    
    for (const pattern of dangerous) {
      if (lowerInput.includes(pattern.toLowerCase())) {
        throw new Error(`Input contains potentially dangerous SQL: ${pattern}`)
      }
    }
    
    return input.trim()
  }
  
  return input
}

export function validateFilters(filters: Array<{ column: string; operator: string; value: any }>): string | null {
  if (!Array.isArray(filters)) {
    return 'Filters must be an array'
  }
  
  if (filters.length === 0) {
    return 'At least one filter is required'
  }
  
  const allowedOperators = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in', 'is', 'not.is']
  
  for (const filter of filters) {
    if (!filter.column || typeof filter.column !== 'string') {
      return 'Each filter must have a column name'
    }
    
    const columnError = validateColumnName(filter.column)
    if (columnError) {
      return `Invalid filter column: ${columnError}`
    }
    
    if (!allowedOperators.includes(filter.operator)) {
      return `Invalid operator. Allowed operators: ${allowedOperators.join(', ')}`
    }
    
    if (filter.value === undefined) {
      return 'Each filter must have a value'
    }
  }
  
  return null
}