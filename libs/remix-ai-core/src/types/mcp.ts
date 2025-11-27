/**
 * MCP (Model Context Protocol) types and interfaces for Remix AI integration
 */

export interface IMCPServer {
  name: string
  description?: string
  transport: 'stdio' | 'sse' | 'websocket' | 'http' | 'internal'
  command?: string[]
  args?: string[]
  url?: string
  env?: Record<string, string>
  autoStart?: boolean
  timeout?: number
  enabled?: boolean
  isBuiltIn?: boolean // Cannot be removed if true
}

export interface IMCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  annotations?: {
    audience?: string[];
    priority?: number;
  };
}

export interface IMCPResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export interface IMCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export interface IMCPToolCall {
  name: string;
  arguments?: Record<string, any>;
}

export interface IMCPToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export interface IMCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface IMCPServerCapabilities {
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  tools?: {
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
  logging?: Record<string, any>;
  experimental?: Record<string, any>;
}

export interface IMCPClientCapabilities {
  resources?: {
    subscribe?: boolean;
  };
  sampling?: Record<string, any>;
  roots?: {
    listChanged?: boolean;
  };
  experimental?: Record<string, any>;
}

export interface IMCPInitializeResult {
  protocolVersion: string;
  capabilities: IMCPServerCapabilities;
  serverInfo: {
    name: string;
    version: string;
  };
  instructions?: string;
}

export interface IMCPConnectionStatus {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  serverName: string;
  error?: string;
  lastAttempt?: number;
  capabilities?: IMCPServerCapabilities;
}

/**
 * MCP provider configuration for AI parameters
 */
export interface IMCPProviderParams {
  mcpServers?: string[];
  maxResources?: number;
  resourcePriorityThreshold?: number;
  enableTools?: boolean;
  toolTimeout?: number;
}

export interface IUserIntent {
  type: 'coding' | 'documentation' | 'debugging' | 'explanation' | 'generation' | 'completion';
  confidence: number;
  keywords: string[];
  domains: string[];
  complexity: 'low' | 'medium' | 'high';
  originalQuery: string;
}

export interface IResourceScore {
  resource: IMCPResource;
  serverName: string;
  score: number;
  components: {
    keywordMatch: number;
    domainRelevance: number;
    typeRelevance: number;
    priority: number;
    freshness: number;
  };
  reasoning: string;
}

export interface IResourceSelectionResult {
  selectedResources: IResourceScore[];
  totalResourcesConsidered: number;
  strategy: 'priority' | 'semantic' | 'hybrid';
  intent: IUserIntent;
}

export interface IEnhancedMCPProviderParams extends IMCPProviderParams {
  enableIntentMatching?: boolean;
  relevanceThreshold?: number;
  selectionStrategy?: 'priority' | 'semantic' | 'hybrid';
  domainWeights?: Record<string, number>;
  enableQueryExpansion?: boolean;
  maxExpansionTerms?: number;
}

export interface IMCPAwareParams {
  mcp?: IEnhancedMCPProviderParams;
}

export interface IToolCallRecord {
  name: string;
  arguments: Record<string, any>;
  result: IMCPToolResult;
  executionTime: number;
}

export interface ICodeExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  executionTime: number;
  toolsCalled: string[];
  toolCallRecords: IToolCallRecord[];
  returnValue?: any;
}

export interface IExecutionContext {
  executeToolCall: (name: string, args: Record<string, any>) => Promise<IMCPToolResult>;
  console: {
    log: (...args: any[]) => void;
    error: (...args: any[]) => void;
    warn: (...args: any[]) => void;
  };
}
