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
  GIT = 'git'
}

export interface AccountInfo {
  address: string;
  balance?: string;
  displayName?: string;
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

export interface DebugSessionArgs {
  transactionHash?: string;
}

export interface BreakpointArgs {
  sourceFile: string;
  lineNumber: number;
  condition?: string;
  hitCount?: number;
}

export interface DebugStepArgs {
  sessionId: string;
  stepType: 'into' | 'over' | 'out' | 'continue';
}

export interface DebugWatchArgs {
  sessionId: string;
  expression: string;
  watchType?: 'variable' | 'expression' | 'memory';
}

export interface DebugEvaluateArgs {
  sessionId: string;
  expression: string;
  context?: 'current' | 'global' | 'local';
}

export interface DebugCallStackArgs {
  sessionId: string;
}

export interface DebugVariablesArgs {
  sessionId: string;
  scope?: 'local' | 'global' | 'storage' | 'memory';
}

export interface StartDebuggerArgs {
  txHash: string;
}

export interface SetBreakpointArgs {
  file: string;
  line: number;
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
 * Tool result types
 */
export interface FileOperationResult {
  success: boolean;
  path: string;
  message?: string;
  content?: string;
  size?: number;
  lastModified?: string;
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
  sources: Record<string, any>;
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

export interface BreakpointResult {
  success: boolean;
  breakpointId: string;
  sourceFile: string;
  lineNumber: number;
  condition?: string;
  hitCount?: number;
  enabled: boolean;
  setAt: string;
}

export interface DebugStepResult {
  success: boolean;
  sessionId: string;
  stepType: string;
  currentLocation: {
    sourceFile: string;
    lineNumber: number;
    columnNumber?: number;
  };
  stackTrace: {
    function: string;
    sourceFile: string;
    lineNumber: number;
  }[];
  steppedAt: string;
}

export interface DebugInfo {
  currentStep: number;
  totalSteps: number;
  currentFile: string;
  currentLine: number;
  callStack: any[];
  variables: Record<string, any>;
  memory: string;
  stack: string[];
  storage: Record<string, string>;
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