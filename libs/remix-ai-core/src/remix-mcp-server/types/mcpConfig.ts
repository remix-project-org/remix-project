export interface MCPSecurityConfig {
  maxRequestsPerMinute?: number;
  maxFileSize?: number;
  allowedFileTypes?: string[];
  blockedPaths?: string[];
  allowedPaths?: string[];
  requirePermissions?: boolean;
  enableAuditLog?: boolean;
  maxExecutionTime?: number;
  excludeTools?: string[];
  permissions?: {
    requirePermissions: boolean
    defaultPermissions: string[];
    roles?: {
      [roleName: string]: string[];
    };
  };
  rateLimit?: {
    enabled: boolean;
    requestsPerMinute: number;
    burstAllowance?: number;
  };
}

export interface MCPValidationConfig {
  validateSchemas?: boolean;
  validateTypes?: boolean;
  validateRanges?: boolean;
  validateFormats?: boolean;
  strictMode: boolean;
  toolValidation?: {
    [toolName: string]: {
      requiredFields?: string[];
      forbiddenFields?: string[];
      patterns?: {
        [fieldName: string]: string; // regex pattern
      };
    };
  };

  fileOperations?: {
    maxFileSize?: number;
    allowedExtensions?: string[];
    blockedPatterns?: string[];
  };

  networkOperations?: {
    allowedNetworks?: string[];
    warnOnMainnet?: boolean;
    maxGasLimit?: number;
  };
}

export interface MCPResourceConfig {
  enableCache: boolean;
  cacheTTL: number;
  excludeResources?: string[];
  allowResources?: string[];
  accessPatterns?: {
    allowedPatterns?: string[];
    blockedPatterns?: string[];
  };
}

export interface MCPConfig {
  version: string;
  security: MCPSecurityConfig;
  validation: MCPValidationConfig;
  resources?: MCPResourceConfig;
  features?: {
    compilation?: boolean;
    deployment?: boolean;
    debugging?: boolean;
    analysis?: boolean;
    testing?: boolean;
    git?: boolean;
  };
  logging?: {
    level: 'debug' | 'info' | 'warn' | 'error';
    console: boolean;
    logFile?: string;
  };
}

export const defaultMCPConfig: MCPConfig = {
  version: '1.0.0',
  security: {
    allowedFileTypes: ['sol', 'js', 'ts', 'json', 'md', 'txt', 'toml', 'yaml', 'yml', 'sql'],
    blockedPaths: ['.env', '.git', 'node_modules', '.ssh', 'private', 'secret'],
    allowedPaths: [],
    maxExecutionTime: 30000,
    excludeTools: [],
    permissions: {
      requirePermissions: true,
      defaultPermissions: ['*']
    },
    rateLimit: {
      enabled: true,
      requestsPerMinute: 60,
      burstAllowance: 10
    }
  },
  validation: {
    validateSchemas: true,
    validateTypes: true,
    validateRanges: true,
    validateFormats: true,
    strictMode: false,
    toolValidation: {},
    fileOperations: {
      maxFileSize: 10 * 1024 * 1024, // 10MB
      allowedExtensions: ['sol', 'js', 'ts', 'json', 'md', 'txt', 'toml', 'yaml', 'yml', 'sql'],
      blockedPatterns: ['**/node_modules/**', '**/.git/**']
    },
    networkOperations: {
      allowedNetworks: ['sepolia', 'goerli', 'localhost', 'vm', 'mainnet'],
      warnOnMainnet: true,
      maxGasLimit: 15000000
    }
  },
  resources: {
    enableCache: true,
    cacheTTL: 300000, // 5 minutes
    excludeResources: [],
    allowResources: [],
    accessPatterns: {
      allowedPatterns: [],
      blockedPatterns: []
    }
  },
  features: {
    compilation: true,
    deployment: true,
    debugging: true,
    analysis: true,
    testing: true,
    git: true
  },
  logging: {
    level: 'info',
    console: true
  }
}

export const minimalMCPConfig: MCPConfig = defaultMCPConfig

