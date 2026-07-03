// Utility for parsing and handling GraphQL files with metadata

/**
 * Supported blockchain networks for The Graph
 */
export type SupportedNetwork =
  | 'mainnet'
  | 'arbitrum-one'
  | 'avalanche'
  | 'base'
  | 'bsc'
  | 'optimism'
  | 'polygon'
  | 'unichain'
  | 'sepolia'
  | 'goerli'

/**
 * Metadata extracted from .graphql file comments
 */
export interface GraphQLFileMetadata {
  endpoint?: string
  network?: SupportedNetwork
  description?: string
  variables?: Record<string, any>
}

/**
 * Parsed GraphQL file structure
 */
export interface ParsedGraphQLFile {
  query: string
  metadata: GraphQLFileMetadata
  operationName?: string
  operationType?: 'query' | 'mutation' | 'subscription'
}

/**
 * Regular expressions for parsing metadata comments
 */
const METADATA_PATTERNS = {
  endpoint: /^#\s*@endpoint:\s*(.+)$/m,
  network: /^#\s*@network:\s*(.+)$/m,
  description: /^#\s*@description:\s*(.+)$/m,
  variables: /^#\s*@variables:\s*(.+)$/m
}

/**
 * Regular expression for operation name extraction
 */
const OPERATION_REGEX = /^\s*(query|mutation|subscription)\s+(\w+)?/m

/**
 * Parse a .graphql file content and extract metadata
 */
export const parseGraphQLFile = (content: string): ParsedGraphQLFile => {
  const metadata: GraphQLFileMetadata = {}

  // Extract metadata from comments
  const endpointMatch = content.match(METADATA_PATTERNS.endpoint)
  if (endpointMatch) {
    metadata.endpoint = endpointMatch[1].trim()
  }

  const networkMatch = content.match(METADATA_PATTERNS.network)
  if (networkMatch) {
    metadata.network = networkMatch[1].trim() as SupportedNetwork
  }

  const descriptionMatch = content.match(METADATA_PATTERNS.description)
  if (descriptionMatch) {
    metadata.description = descriptionMatch[1].trim()
  }

  const variablesMatch = content.match(METADATA_PATTERNS.variables)
  if (variablesMatch) {
    try {
      metadata.variables = JSON.parse(variablesMatch[1].trim())
    } catch (e) {
      console.warn('Failed to parse variables metadata:', e)
    }
  }

  // Remove metadata comments from query
  let query = content
  Object.values(METADATA_PATTERNS).forEach(pattern => {
    query = query.replace(pattern, '')
  })

  // Clean up leading/trailing whitespace and extra newlines
  query = query.trim()

  // Extract operation name and type
  const operationMatch = query.match(OPERATION_REGEX)
  let operationName: string | undefined
  let operationType: 'query' | 'mutation' | 'subscription' | undefined

  if (operationMatch) {
    operationType = operationMatch[1] as 'query' | 'mutation' | 'subscription'
    operationName = operationMatch[2]
  }

  return {
    query,
    metadata,
    operationName,
    operationType
  }
}

/**
 * Validate GraphQL query syntax (basic validation)
 */
export const validateGraphQLSyntax = (query: string): { valid: boolean; error?: string } => {
  // Basic validation - check for balanced braces
  let braceCount = 0
  let parenCount = 0

  for (const char of query) {
    if (char === '{') braceCount++
    if (char === '}') braceCount--
    if (char === '(') parenCount++
    if (char === ')') parenCount--

    if (braceCount < 0) {
      return { valid: false, error: 'Unmatched closing brace }' }
    }
    if (parenCount < 0) {
      return { valid: false, error: 'Unmatched closing parenthesis )' }
    }
  }

  if (braceCount !== 0) {
    return { valid: false, error: 'Unmatched braces' }
  }
  if (parenCount !== 0) {
    return { valid: false, error: 'Unmatched parentheses' }
  }

  // Check for query/mutation/subscription keyword or shorthand query
  // Skip comment lines to find the actual query start
  const lines = query.trim().split('\n')
  let queryStart = ''
  for (const line of lines) {
    const trimmedLine = line.trim()
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      queryStart = trimmedLine
      break
    }
  }

  if (!queryStart.startsWith('{') &&
      !queryStart.startsWith('query') &&
      !queryStart.startsWith('mutation') &&
      !queryStart.startsWith('subscription') &&
      !queryStart.startsWith('fragment')) {
    return { valid: false, error: 'Query must start with query, mutation, subscription, fragment, or {' }
  }

  return { valid: true }
}
