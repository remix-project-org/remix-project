/**
 * Remix MCP Server - Main Export File
 * Provides a comprehensive in-browser MCP server for Remix IDE
 */

// Core Server
export { RemixMCPServer } from './RemixMCPServer';
import { RemixMCPServer } from './RemixMCPServer';

// Configuration
export { MCPConfigManager } from './config/MCPConfigManager';
export type {
  MCPConfig,
  MCPSecurityConfig,
  MCPValidationConfig,
  MCPResourceConfig,
} from './types/mcpConfig';
export { defaultMCPConfig } from './types/mcpConfig';

// Tool Handlers
export { createFileManagementTools } from './handlers/FileManagementHandler';
export { createCompilationTools } from './handlers/CompilationHandler';
export { createDeploymentTools } from './handlers/DeploymentHandler';
export { createDebuggingTools } from './handlers/DebuggingHandler';
export { createCodeAnalysisTools } from './handlers/CodeAnalysisHandler';
export { createChartJsTools } from './handlers/ChartJsHandler';
export { createAmpTools } from './handlers/AmpHandler';
export { createMathUtilsTools } from './handlers/MathUtilsHandler';
export { createFoundryHardhatTools } from './handlers/FoundryHardhatHandler';

// Resource Providers
export { ProjectResourceProvider } from './providers/ProjectResourceProvider';
export { CompilationResourceProvider } from './providers/CompilationResourceProvider';
export { DeploymentResourceProvider } from './providers/DeploymentResourceProvider';
export { TutorialsResourceProvider } from './providers/TutorialsResourceProvider';
export { AmpResourceProvider } from './providers/AmpResourceProvider';

// Middleware
export type {
  SecurityValidationResult,
  SecurityMiddleware,
  AuditLogEntry
} from './middleware/SecurityMiddleware';

export type {
  ValidationMiddleware,
  ValidationResult,
  ValidationError,
  ValidationWarning
} from './middleware/ValidationMiddleware';

// Registries
export {
  RemixToolRegistry,
  BaseToolHandler
} from './registry/RemixToolRegistry';

export {
  RemixResourceProviderRegistry,
  BaseResourceProvider
} from './registry/RemixResourceProviderRegistry';

// Types
export * from './types/mcpTools';
export * from './types/mcpResources';

/**
 * Factory function to create and initialize a complete Remix MCP Server
 */
export async function createRemixMCPServer(
  plugin,
  options: {
    enableSecurity?: boolean;
    enableValidation?: boolean;
    securityConfig?: any;
    validationConfig?: any;
    customTools?: any[];
    customProviders?: any[];
  } = {},
): Promise<RemixMCPServer> {
  const {
    enableSecurity = true,
    enableValidation = true,
    customTools = [],
    customProviders = []
  } = options;

  const serverConfig = {
    name: 'Remix MCP Server',
    version: '1.0.0',
    description: 'In-browser MCP server for Remix IDE providing comprehensive smart contract development tools',
    debug: false,
    maxConcurrentTools: 10,
    toolTimeout: 60000 * 10, // 10 minutes
    resourceCacheTTL: 5000,
    enableResourceCache: false,
    security: enableSecurity ? {
      enablePermissions: true,
      enableAuditLog: true,
      allowedFilePatterns: [],
      blockedFilePatterns: []
    } : undefined,
    features: {
      compilation: true,
      deployment: true,
      debugging: true,
      fileManagement: true,
      analysis: true,
      workspace: true,
      testing: true
    }
  };

  const server = new RemixMCPServer(plugin, serverConfig);

  if (customTools.length > 0) {
    // for (const tool of customTools) {
    //   server.registerTool(tool);
    // }
  }

  if (customProviders.length > 0) {
    // for (const provider of customProviders) {
    //   server.registerResourceProvider(provider);
    // }
  }

  console.log("Initializing server")
  await server.initialize();

  return server;
}

export default RemixMCPServer;