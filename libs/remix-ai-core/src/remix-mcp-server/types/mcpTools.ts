/**
 * Types and interfaces for Remix IDE MCP Tools
 */

import { IMCPTool, IMCPToolCall, IMCPToolResult } from '../../types/mcp';
import { Plugin } from '@remixproject/engine';

/**
 * Base interface for all Remix MCP tool handlers
 */
export interface RemixToolHandler {
  name: string;
  description: string;
  inputSchema: IMCPTool['inputSchema'];
  execute(args: any, plugin:Plugin): Promise<IMCPToolResult>;
  getPermissions?(): string[];
  validate?(args: any): boolean | string;
}

export enum ToolCategory {
  FILE_MANAGEMENT = 'file_management',
  COMPILATION = 'compilation',
  DEPLOYMENT = 'deployment',
  DEBUGGING = 'debugging',
  ANALYSIS = 'analysis',
  WORKSPACE = 'workspace',
  TESTING = 'testing',
  GIT = 'git',
  COORDINATION = 'coordination'
}

export interface AccountInfo {
  alias: string,
  account: string,
  balance?: string,
  symbol?: string
  isSmartAccount?: boolean;
}

/**
 * Tool execution context
 */
export interface ToolExecutionContext {
  userId?: string;
  sessionId?: string;
  workspace?: string;
  currentFile?: string;
  permissions: string[];
  timestamp: Date | number;
  requestId?: string;
}

/**
 * File management tool argument types
 */
export interface FileReadArgs {
  path: string;
}

export interface FileReplacerArgs {
  path: string
  contentToReplace: string
  regEx: string
}

export interface FileWriteArgs {
  path: string;
  content: string;
  encoding?: string;
}

export interface FileCreateArgs {
  path: string;
  content?: string;
  type?: 'file' | 'directory';
}

export interface FileDeleteArgs {
  path: string;
}

export interface FileMoveArgs {
  from: string;
  to: string;
}

export interface FileCopyArgs {
  from: string;
  to: string;
}

export interface DirectoryListArgs {
  path: string;
  recursive?: boolean;
}

export interface FileReadChunkArgs {
  path: string;
  offset?: number;
  limit?: number;
}

export interface FileGrepArgs {
  path: string;
  pattern: string;
  ignoreCase?: boolean;
  lineNumbers?: boolean;
  contextBefore?: number;
  contextAfter?: number;
  maxMatches?: number;
}

export interface SolidityCompileArgs {
  file?: string;
  version?: string;
  optimize?: boolean;
  runs?: number;
  evmVersion?: string;
}

export interface CompilerConfigArgs {
  version: string;
  optimize: boolean;
  runs: number;
  evmVersion: string;
  language: string;
}

export interface DeployContractArgs {
  contractName: string;
  constructorArgs: any[];
  gasLimit?: number;
  gasPrice?: string;
  value?: string;
  account?: string;
  file: string;
}

export interface CallContractArgs {
  contractName: string;
  address: string;
  abi: any[];
  methodName: string;
  args?: any[];
  gasLimit?: number;
  gasPrice?: string;
  value?: string;
  account?: string;
}

export interface SendTransactionArgs {
  to: string;
  value?: string;
  data?: string;
  gasLimit?: number;
  gasPrice?: string;
  from?: string;
}

export interface SimulateTransactionArgs {
  from: string;
  to?: string;
  value?: string;
  maxFeePerGas?: string;
  data?: string;
  validation?: boolean;
  traceTransfers?: boolean;
  shouldDecodeLogs?: boolean;
}

export interface RunScriptArgs {
  file: string
}

export interface AddInstanceArgs {
  contractAddress: string;
  abi: any[] | string;
  contractName: string;
}

/**
 * Math utilities argument types
 */
export interface WeiToEtherArgs {
  wei: string;
}

export interface EtherToWeiArgs {
  ether: string;
}

export interface DecimalToHexArgs {
  decimal: string | number;
}

export interface HexToDecimalArgs {
  hex: string;
}

export interface TimestampToDateArgs {
  timestamp: string | number;
  format?: 'iso' | 'local' | 'utc';
}

export interface DebugSessionArgs {
  transactionHash?: string;
}

export interface StartDebuggerArgs {
  txHash: string;
}

export interface InspectVariableArgs {
  variable: string;
  scope?: string;
}

/**
 * Analysis tool argument types
 */
export interface StaticAnalysisArgs {
  file?: string;
  modules?: string[];
}

export interface SecurityScanArgs {
  file?: string;
  depth?: 'basic' | 'detailed' | 'comprehensive';
}

export interface GasEstimationArgs {
  contractName: string;
  methodName?: string;
  args?: any[];
}

/**
 * Amp query argument types
 */
export interface AmpQueryArgs {
  query: string;
  baseUrl?: string;
  authToken?: string;
}

/**
 * Workspace tool argument types
 */
export interface CreateWorkspaceArgs {
  name: string;
  template?: string;
  isLocalhost?: boolean;
}

export interface SwitchWorkspaceArgs {
  name: string;
}

export interface ImportProjectArgs {
  source: 'github' | 'ipfs' | 'url';
  path: string;
  workspace?: string;
}

/**
 * Skill loader argument types
 */
export interface LoadSkillArgs {
  skill_id: string;
}

export interface ListSkillsArgs {
  // No parameters needed
}

/**
 * Tool result types
 */
export interface FileOperationResult {
  success: boolean;
  path: string;
  message?: string;
  payload?: string;
  size?: number;
  lastModified?: string;
}

export interface FileReadChunkResult {
  success: boolean;
  path: string;
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  hasMore: boolean;
}

export interface FileGrepResult {
  success: boolean;
  path: string;
  pattern: string;
  matches: Array<{
    lineNumber: number;
    line: string;
    contextBefore?: string[];
    contextAfter?: string[];
  }>;
  totalMatches: number;
  truncated: boolean;
}

export interface CompilationResult {
  success: boolean;
  contracts: Record<string, {
    abi?: any[];
    bytecode?: string;
    deployedBytecode?: string;
    metadata?: any;
    gasEstimates?: any;
  }>;
  errors: any[];
  errorFiles?: any[];
  warnings: any[];
  // sources: Record<string, any>; // comment out to avoid large payloads, can be added back if needed
}

export interface DeploymentResult {
  success: boolean;
  contractAddress?: string;
  transactionHash: string;
  gasUsed: number | bigint;
  effectiveGasPrice: string;
  blockNumber: number | bigint;
  logs: any[];
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface RunScriptResult {}

export interface AddInstanceResult {
  success: boolean;
  contractAddress: string;
  contractName: string;
  message?: string;
}

export interface ContractInteractionResult {
  success: boolean;
  result?: any;
  transactionHash?: string;
  gasUsed?: number | bigint;
  logs?: any[];
  error?: string;
}

export interface DebugSessionResult {
  success: boolean;
  transactionHash?: string;
  status: string;
  createdAt: string;
}

export interface AnalysisResult {
  file: string;
  issues: {
    severity: 'error' | 'warning' | 'info';
    message: string;
    line?: number;
    column?: number;
    rule?: string;
  }[];
  metrics: {
    complexity: number;
    linesOfCode: number;
    maintainabilityIndex: number;
  };
}

export interface TestResult {
  success: boolean;
  tests: {
    name: string;
    status: 'passed' | 'failed' | 'skipped';
    duration: number;
    error?: string;
  }[];
  coverage?: {
    statements: number;
    branches: number;
    functions: number;
    lines: number;
  };
}

export interface AmpQueryResult<T = any> {
  success: boolean;
  data: Array<T>;
  rowCount: number;
  query: string;
  error?: string;
}

export interface LoadSkillResult extends FileOperationResult {
  skill_id: string;
  skill_name: string;
  skill_description: string;
  files_created: string[];
  total_files: number;
}

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
}

export interface ListSkillsResult {
  success: boolean;
  skills: SkillInfo[];
  total_skills: number;
}

export interface RemixToolDefinition extends IMCPTool {
  category: ToolCategory;
  permissions: string[];
  handler: RemixToolHandler;
}

/**
 * Tool registry interface
 */
export interface ToolRegistry {
  register(tool: RemixToolDefinition): void;
  unregister(name: string): void;
  get(name: string): RemixToolDefinition | undefined;
  list(category?: ToolCategory): RemixToolDefinition[];
  execute(call: IMCPToolCall, context: ToolExecutionContext, plugin: Plugin): Promise<IMCPToolResult>;
  registerBatch(tools: RemixToolDefinition[]): void;
  has(name: string): boolean;
  clear(): void;
  getByCategory(category: ToolCategory): RemixToolDefinition[];
  getCategories(): ToolCategory[];
  getCategoryStats(): Record<ToolCategory, number>;
  getToolMetadata(name: string): any;
  search(query: string): RemixToolDefinition[];

  // Event handling methods
  on(event: string, listener: (...args: any[]) => void): void;
  off(event: string, listener: (...args: any[]) => void): void;
  emit(event: string, ...args: any[]): boolean;
}