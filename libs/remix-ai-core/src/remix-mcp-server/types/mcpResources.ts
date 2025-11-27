/**
 * Types and interfaces for Remix IDE MCP Resources
 */

import { IMCPResource, IMCPResourceContent } from '../../types/mcp';
import { Plugin } from '@remixproject/engine';

/**
 * Base interface for all Remix MCP resource providers
 */
export interface RemixResourceProvider {
  name: string;
  description: string;
  getResources(plugin: Plugin): Promise<IMCPResource[]>;
  getResourceContent(uri: string, plugin: Plugin): Promise<IMCPResourceContent>;
  canHandle(uri: string): boolean;
  getMetadata?(): any;
}

/**
 * Categories of Remix resources
 */
export enum ResourceCategory {
  PROJECT_FILES = 'project_files',
  CODE = 'CODE',
  COMPILATION_RESULTS = 'compilation_results',
  TUTORIALS = 'tutorials',
  DEPLOYMENT_DATA = 'deployment_data',
  DEBUG_SESSIONS = 'debug_sessions',
  ANALYSIS_REPORTS = 'analysis_reports',
  DOCUMENTATION = 'documentation',
  TEMPLATES = 'templates',
  CONFIGURATION = 'configuration',
  TRANSACTION_HISTORY = 'transaction_history'
}

/**
 * Resource metadata interface
 */
export interface ResourceMetadata {
  category: ResourceCategory;
  lastModified: Date;
  size: number;
  encoding?: string;
  language?: string;
  version?: string;
  author?: string;
  tags?: string[];
  dependencies?: string[];
}

export interface DeployedContractInstance {
  name: string;
  address: string;
  abi: any[];
  timestamp: string;
  from: string;
  transactionHash: string;
  blockNumber: number;
  blockHash?: string;
  gasUsed: number;
  gasPrice: string;
  value: string;
  status: string;
  constructorArgs: any[];
  verified: boolean;
  index: number;
}

export interface DeployedContractsByNetwork {
  [networkProvider: string]: {
    [contractAddress: string]: DeployedContractInstance;
  };
}

/**
 * Project file resource
 */
export interface ProjectFileResource extends IMCPResource {
  metadata: ResourceMetadata & {
    category: ResourceCategory.PROJECT_FILES;
    path: string;
    isDirectory: boolean;
    extension?: string;
    syntax?: string;
  };
}

/**
 * Compilation result resource
 */
export interface CompilationResultResource extends IMCPResource {
  metadata: ResourceMetadata & {
    category: ResourceCategory.COMPILATION_RESULTS;
    contractName: string;
    compiler: string;
    compilerVersion: string;
    sourceFile: string;
    compiledAt: Date;
    optimized: boolean;
    evmVersion: string;
  };
}

/**
 * Deployment data resource
 */
export interface DeploymentDataResource extends IMCPResource {
  metadata: ResourceMetadata & {
    category: ResourceCategory.DEPLOYMENT_DATA;
    contractName: string;
    contractAddress: string;
    transactionHash: string;
    network: string;
    deployedAt: Date;
    deployer: string;
    gasUsed: number;
    constructorArgs: any[];
  };
}

/**
 * Debug session resource
 */
export interface DebugSessionResource extends IMCPResource {
  metadata: ResourceMetadata & {
    category: ResourceCategory.DEBUG_SESSIONS;
    transactionHash: string;
    contractAddress: string;
    method: string;
    startedAt: Date;
    steps: number;
    breakpoints: Array<{
      file: string;
      line: number;
    }>;
  };
}

/**
 * Analysis report resource
 */
export interface AnalysisReportResource extends IMCPResource {
  metadata: ResourceMetadata & {
    category: ResourceCategory.ANALYSIS_REPORTS;
    analyzer: string;
    targetFile: string;
    analyzedAt: Date;
    issuesFound: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    rules: string[];
  };
}

/**
 * Documentation resource
 */
export interface DocumentationResource extends IMCPResource {
  metadata: ResourceMetadata & {
    category: ResourceCategory.DOCUMENTATION;
    topic: string;
    format: 'markdown' | 'html' | 'text';
    scope: 'solidity' | 'remix' | 'web3' | 'general';
    level: 'beginner' | 'intermediate' | 'advanced';
    keywords: string[];
  };
}

/**
 * Template resource
 */
export interface TemplateResource extends IMCPResource {
  metadata: ResourceMetadata & {
    category: ResourceCategory.TEMPLATES;
    templateType: 'contract' | 'project' | 'script' | 'test';
    framework?: string;
    blockchain: string;
    complexity: 'simple' | 'intermediate' | 'advanced';
    features: string[];
  };
}

/**
 * Configuration resource
 */
export interface ConfigurationResource extends IMCPResource {
  metadata: ResourceMetadata & {
    category: ResourceCategory.CONFIGURATION;
    configType: 'compiler' | 'network' | 'workspace' | 'plugin';
    scope: 'global' | 'workspace' | 'project';
    environment?: string;
  };
}

/**
 * Transaction history resource
 */
export interface TransactionHistoryResource extends IMCPResource {
  metadata: ResourceMetadata & {
    category: ResourceCategory.TRANSACTION_HISTORY;
    transactionType: 'deployment' | 'interaction' | 'transfer';
    network: string;
    account: string;
    timestamp: Date;
    status: 'pending' | 'confirmed' | 'failed';
    gasUsed?: number;
    value?: string;
  };
}

/**
 * Resource update event
 */
export interface ResourceUpdateEvent {
  type: 'created' | 'updated' | 'deleted';
  resource: IMCPResource;
  timestamp: Date;
  provider: string;
}

/**
 * Resource query interface
 */
export interface ResourceQuery {
  category?: ResourceCategory;
  tags?: string[];
  keywords?: string[];
  dateRange?: {
    from: Date;
    to: Date;
  };
  size?: {
    min?: number;
    max?: number;
  };
  language?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'name' | 'date' | 'size' | 'relevance';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Resource search result
 */
export interface ResourceSearchResult {
  resources: IMCPResource[];
  total: number;
  hasMore: boolean;
  query: ResourceQuery;
}

/**
 * Resource provider registry interface
 */
export interface ResourceProviderRegistry {
  register(provider: RemixResourceProvider): void;
  unregister(name: string): void;
  get(name: string): RemixResourceProvider | undefined;
  list(): RemixResourceProvider[];
  getResources(query?: ResourceQuery): Promise<ResourceSearchResult>;
  getResourceContent(uri: string): Promise<IMCPResourceContent>;
  subscribe(callback: (event: ResourceUpdateEvent) => void): void;
  unsubscribe(callback: (event: ResourceUpdateEvent) => void): void;
}