/**
 * Validation Middleware for Remix MCP Server
 */

import { Plugin } from '@remixproject/engine';
import { IMCPToolCall, IMCPToolResult } from '../../types/mcp';
import { ToolExecutionContext } from '../types/mcpTools';

export interface ValidationConfig {
  validateSchemas: boolean;
  validateTypes: boolean;
  validateRanges: boolean;
  validateFormats: boolean;
  strictMode: boolean;
  customValidators: Map<string, (value: any) => ValidationResult>;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  code: string;
  message: string;
  value?: any;
  expectedType?: string;
  actualType?: string;
}

export interface ValidationWarning {
  field: string;
  code: string;
  message: string;
  suggestion?: string;
}

/**
 * Validation middleware for MCP tool calls
 */
export class ValidationMiddleware {
  private _plugin
  constructor(private config: ValidationConfig, plugin) {
    this._plugin = plugin
  }

  /**
   * Validate a tool call and its arguments
   */
  async validateToolCall(
    call: IMCPToolCall,
    inputSchema: any,
    context: ToolExecutionContext,
    plugin: Plugin
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: []
    };

    try {
      // Validate basic call structure
      this.validateCallStructure(call, result);

      // Validate against input schema
      if (this.config.validateSchemas && inputSchema) {
        this.validateSchema(call.arguments || {}, inputSchema, result);
      }

      // Validate argument types
      if (this.config.validateTypes) {
        this.validateArgumentTypes(call.arguments || {}, inputSchema, result);
      }

      // Validate ranges and constraints
      if (this.config.validateRanges) {
        this.validateRanges(call.arguments || {}, inputSchema, result);
      }

      // Validate formats (emails, URLs, addresses, etc.)
      if (this.config.validateFormats) {
        this.validateFormats(call.arguments || {}, inputSchema, result);
      }

      // Custom validations specific to tools
      await this.customValidations(call, context, plugin, result);

      // Business logic validations
      await this.businessLogicValidations(call, context, plugin, result);

      result.valid = result.errors.length === 0;

    } catch (error) {
      result.valid = false;
      result.errors.push({
        field: 'validation',
        code: 'VALIDATION_ERROR',
        message: `Validation failed: ${error.message}`
      });
    }

    return result;
  }

  /**
   * Validate basic call structure
   */
  private validateCallStructure(call: IMCPToolCall, result: ValidationResult): void {
    if (!call.name) {
      result.errors.push({
        field: 'name',
        code: 'REQUIRED_FIELD',
        message: 'Tool name is required'
      });
    }

    if (typeof call.name !== 'string') {
      result.errors.push({
        field: 'name',
        code: 'INVALID_TYPE',
        message: 'Tool name must be a string',
        expectedType: 'string',
        actualType: typeof call.name
      });
    }

    if (call.arguments !== undefined && typeof call.arguments !== 'object') {
      result.errors.push({
        field: 'arguments',
        code: 'INVALID_TYPE',
        message: 'Arguments must be an object',
        expectedType: 'object',
        actualType: typeof call.arguments
      });
    }
  }

  /**
   * Validate arguments against JSON schema
   */
  private validateSchema(args: any, schema: any, result: ValidationResult): void {
    if (!schema || !schema.properties) return;

    // Check required fields
    if (schema.required) {
      for (const requiredField of schema.required) {
        if (!(requiredField in args)) {
          result.errors.push({
            field: requiredField,
            code: 'REQUIRED_FIELD',
            message: `Required field '${requiredField}' is missing`
          });
        }
      }
    }

    // Check each argument against schema
    for (const [field, value] of Object.entries(args)) {
      const fieldSchema = schema.properties[field];
      if (!fieldSchema) {
        if (this.config.strictMode) {
          result.errors.push({
            field,
            code: 'UNKNOWN_FIELD',
            message: `Unknown field '${field}'`
          });
        } else {
          result.warnings.push({
            field,
            code: 'UNKNOWN_FIELD',
            message: `Unknown field '${field}'`,
            suggestion: 'Remove unknown field or add to schema'
          });
        }
        continue;
      }

      this.validateFieldSchema(field, value, fieldSchema, result);
    }
  }

  /**
   * Validate a single field against its schema
   */
  private validateFieldSchema(field: string, value: any, schema: any, result: ValidationResult): void {
    // Type validation
    if (schema.type) {
      const expectedType = schema.type;
      const actualType = Array.isArray(value) ? 'array' : typeof value;

      if (expectedType !== actualType) {
        result.errors.push({
          field,
          code: 'TYPE_MISMATCH',
          message: `Field '${field}' expected type ${expectedType}, got ${actualType}`,
          expectedType,
          actualType,
          value
        });
        return;
      }
    }

    // Enum validation
    if (schema.enum && !schema.enum.includes(value)) {
      result.errors.push({
        field,
        code: 'INVALID_ENUM',
        message: `Field '${field}' must be one of: ${schema.enum.join(', ')}`,
        value
      });
    }

    // String validations
    if (schema.type === 'string' && typeof value === 'string') {
      if (schema.minLength && value.length < schema.minLength) {
        result.errors.push({
          field,
          code: 'MIN_LENGTH',
          message: `Field '${field}' must be at least ${schema.minLength} characters`,
          value
        });
      }

      if (schema.maxLength && value.length > schema.maxLength) {
        result.errors.push({
          field,
          code: 'MAX_LENGTH',
          message: `Field '${field}' must be at most ${schema.maxLength} characters`,
          value
        });
      }

      if (schema.pattern) {
        const regex = new RegExp(schema.pattern);
        if (!regex.test(value)) {
          result.errors.push({
            field,
            code: 'PATTERN_MISMATCH',
            message: `Field '${field}' does not match required pattern`,
            value
          });
        }
      }
    }

    // Number validations
    if (schema.type === 'number' && typeof value === 'number') {
      if (schema.minimum !== undefined && value < schema.minimum) {
        result.errors.push({
          field,
          code: 'MIN_VALUE',
          message: `Field '${field}' must be at least ${schema.minimum}`,
          value
        });
      }

      if (schema.maximum !== undefined && value > schema.maximum) {
        result.errors.push({
          field,
          code: 'MAX_VALUE',
          message: `Field '${field}' must be at most ${schema.maximum}`,
          value
        });
      }
    }

    // Array validations
    if (schema.type === 'array' && Array.isArray(value)) {
      if (schema.minItems && value.length < schema.minItems) {
        result.errors.push({
          field,
          code: 'MIN_ITEMS',
          message: `Field '${field}' must have at least ${schema.minItems} items`,
          value
        });
      }

      if (schema.maxItems && value.length > schema.maxItems) {
        result.errors.push({
          field,
          code: 'MAX_ITEMS',
          message: `Field '${field}' must have at most ${schema.maxItems} items`,
          value
        });
      }

      // Validate array items
      if (schema.items) {
        value.forEach((item, index) => {
          this.validateFieldSchema(`${field}[${index}]`, item, schema.items, result);
        });
      }
    }
  }

  /**
   * Validate argument types
   */
  private validateArgumentTypes(args: any, schema: any, result: ValidationResult): void {
    for (const [field, value] of Object.entries(args)) {
      if (value === null || value === undefined) continue;

      const fieldSchema = schema?.properties?.[field];
      if (!fieldSchema) continue;

      // Additional type-specific validations
      switch (fieldSchema.type) {
      case 'string':
        if (typeof value !== 'string') {
          result.errors.push({
            field,
            code: 'TYPE_ERROR',
            message: `Field '${field}' must be a string`,
            value
          });
        }
        break;

      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          result.errors.push({
            field,
            code: 'TYPE_ERROR',
            message: `Field '${field}' must be a valid number`,
            value
          });
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          result.errors.push({
            field,
            code: 'TYPE_ERROR',
            message: `Field '${field}' must be a boolean`,
            value
          });
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          result.errors.push({
            field,
            code: 'TYPE_ERROR',
            message: `Field '${field}' must be an array`,
            value
          });
        }
        break;
      }
    }
  }

  /**
   * Validate ranges and constraints
   */
  private validateRanges(args: any, schema: any, result: ValidationResult): void {
    for (const [field, value] of Object.entries(args)) {
      const fieldSchema = schema?.properties?.[field];
      if (!fieldSchema) continue;

      // Gas limit validations
      if (field === 'gasLimit' && typeof value === 'number') {
        if (value < 21000) {
          result.errors.push({
            field,
            code: 'GAS_TOO_LOW',
            message: 'Gas limit cannot be less than 21000',
            value
          });
        }
        if (value > 15000000) {
          result.warnings.push({
            field,
            code: 'GAS_TOO_HIGH',
            message: 'Gas limit seems unusually high',
            suggestion: 'Consider reducing gas limit for cost efficiency'
          });
        }
      }

      // Line number validations
      if (field === 'lineNumber' && typeof value === 'number') {
        if (value < 1) {
          result.errors.push({
            field,
            code: 'INVALID_LINE_NUMBER',
            message: 'Line number must be at least 1',
            value
          });
        }
      }

      // Port validations
      if (field.includes('port') && typeof value === 'number') {
        if (value < 1 || value > 65535) {
          result.errors.push({
            field,
            code: 'INVALID_PORT',
            message: 'Port must be between 1 and 65535',
            value
          });
        }
      }
    }
  }

  /**
   * Validate formats (addresses, hashes, etc.)
   */
  private validateFormats(args: any, schema: any, result: ValidationResult): void {
    for (const [field, value] of Object.entries(args)) {
      if (typeof value !== 'string') continue;

      // Ethereum address validation
      if (field.includes('address') || field.includes('Address')) {
        if (!this.isValidEthereumAddress(value)) {
          result.errors.push({
            field,
            code: 'INVALID_ADDRESS',
            message: `Field '${field}' is not a valid Ethereum address`,
            value
          });
        }
      }

      // Transaction hash validation
      if (field.includes('hash') || field.includes('Hash')) {
        if (!this.isValidTransactionHash(value)) {
          result.errors.push({
            field,
            code: 'INVALID_HASH',
            message: `Field '${field}' is not a valid transaction hash`,
            value
          });
        }
      }

      // URL validation
      if (field.includes('url') || field.includes('Url') || field.includes('URL')) {
        if (!this.isValidUrl(value)) {
          result.errors.push({
            field,
            code: 'INVALID_URL',
            message: `Field '${field}' is not a valid URL`,
            value
          });
        }
      }

      // File path validation
      if (field.includes('path') || field.includes('Path') || field === 'file') {
        if (!this.isValidFilePath(value)) {
          result.errors.push({
            field,
            code: 'INVALID_PATH',
            message: `Field '${field}' is not a valid file path`,
            value
          });
        }
      }

      // Solidity version validation
      if (field === 'version' && value) {
        if (!this.isValidSolidityVersion(value)) {
          result.warnings.push({
            field,
            code: 'INVALID_VERSION',
            message: `Field '${field}' may not be a valid Solidity version`,
            suggestion: 'Use format like "0.8.19" or "latest"'
          });
        }
      }
    }
  }

  /**
   * Custom validations for specific tools
   */
  private async customValidations(
    call: IMCPToolCall,
    context: ToolExecutionContext,
    plugin: Plugin,
    result: ValidationResult
  ): Promise<void> {
    const customValidator = this.config.customValidators.get(call.name);
    if (customValidator) {
      const customResult = customValidator(call.arguments);
      result.errors.push(...customResult.errors);
      result.warnings.push(...customResult.warnings);
    }

    // Tool-specific validations
    switch (call.name) {
    case 'file_write':
    case 'file_create':
      await this.validateFileWrite(call.arguments, plugin, result);
      break;

    case 'deploy_contract':
      await this.validateContractDeployment(call.arguments, plugin, result);
      break;

    case 'call_contract':
      await this.validateContractCall(call.arguments, plugin, result);
      break;

    case 'set_breakpoint':
      await this.validateBreakpoint(call.arguments, plugin, result);
      break;
    }
  }

  /**
   * Business logic validations
   */
  private async businessLogicValidations(
    call: IMCPToolCall,
    context: ToolExecutionContext,
    plugin: Plugin,
    result: ValidationResult
  ): Promise<void> {
    // Validate workspace state
    if (this.requiresWorkspace(call.name)) {
      // TODO: Check if workspace is properly initialized
    }

    // Validate compilation state for deployment
    if (call.name === 'deploy_contract') {
      // TODO: Check if contracts are compiled
      result.warnings.push({
        field: 'compilation',
        code: 'COMPILATION_CHECK',
        message: 'Ensure contracts are compiled before deployment',
        suggestion: 'Run compilation first'
      });
    }

    // Validate network connectivity for mainnet operations
    if (this.isMainnetOperation(call)) {
      result.warnings.push({
        field: 'network',
        code: 'MAINNET_WARNING',
        message: 'This operation will interact with mainnet',
        suggestion: 'Double-check all parameters before proceeding'
      });
    }
  }

  /**
   * Validate file write operations
   */
  private async validateFileWrite(args: any, plugin: Plugin, result: ValidationResult): Promise<void> {
    if (!args.path) return;

    try {
      // Check if path is writable
      const parentPath = args.path.substring(0, args.path.lastIndexOf('/'));
      if (parentPath) {
        const exists = await this._plugin.call('fileManager', 'exists', parentPath)
        if (!exists) {
          result.warnings.push({
            field: 'path',
            code: 'PARENT_NOT_EXISTS',
            message: 'Parent directory may not exist',
            suggestion: 'Create parent directories first'
          });
        }
      }

      // Check file size
      if (args.content && args.content.length > 10 * 1024 * 1024) { // 10MB
        result.warnings.push({
          field: 'content',
          code: 'LARGE_FILE',
          message: 'File content is very large',
          suggestion: 'Consider breaking into smaller files'
        });
      }

    } catch (error) {
      result.warnings.push({
        field: 'path',
        code: 'PATH_CHECK_FAILED',
        message: 'Could not validate file path',
        suggestion: 'Ensure path is accessible'
      });
    }
  }

  /**
   * Validate contract deployment
   */
  private async validateContractDeployment(args: any, plugin: Plugin, result: ValidationResult): Promise<void> {
    // Validate constructor arguments
    if (args.constructorArgs && Array.isArray(args.constructorArgs)) {
      args.constructorArgs.forEach((arg: any, index: number) => {
        if (arg === null || arg === undefined) {
          result.warnings.push({
            field: `constructorArgs[${index}]`,
            code: 'NULL_CONSTRUCTOR_ARG',
            message: `Constructor argument at index ${index} is null/undefined`,
            suggestion: 'Provide all required constructor arguments'
          });
        }
      });
    }

    // Validate gas settings
    if (args.gasLimit && args.gasPrice) {
      const estimatedCost = parseInt(args.gasLimit) * parseInt(args.gasPrice);
      if (estimatedCost > 1000000000000000000) { // 1 ETH in wei
        result.warnings.push({
          field: 'gas',
          code: 'HIGH_GAS_COST',
          message: 'Deployment cost is very high (>1 ETH)',
          suggestion: 'Review gas settings'
        });
      }
    }
  }

  /**
   * Validate contract calls
   */
  private async validateContractCall(args: any, plugin: Plugin, result: ValidationResult): Promise<void> {
    // Validate ABI format
    if (args.abi && Array.isArray(args.abi)) {
      const method = args.abi.find((item: any) => item.name === args.methodName && item.type === 'function');
      if (!method) {
        result.errors.push({
          field: 'methodName',
          code: 'METHOD_NOT_FOUND',
          message: `Method '${args.methodName}' not found in ABI`
        });
      }
    }

    // Validate method arguments
    if (args.args && args.methodName) {
      // TODO: Validate arguments against ABI method signature
    }
  }

  /**
   * Validate breakpoint settings
   */
  private async validateBreakpoint(args: any, plugin: Plugin, result: ValidationResult): Promise<void> {
    if (!args.sourceFile) return;

    try {
      const exists = await this._plugin.call('fileManager', 'exists', args.sourceFile)
      if (!exists) {
        result.errors.push({
          field: 'sourceFile',
          code: 'FILE_NOT_FOUND',
          message: `Source file '${args.sourceFile}' not found`
        });
        return;
      }

      // Validate line number exists in file
      const content = await this._plugin.call('fileManager', 'readFile', args.sourceFile)
      const lines = content.split('\n');
      if (args.lineNumber > lines.length) {
        result.errors.push({
          field: 'lineNumber',
          code: 'LINE_OUT_OF_RANGE',
          message: `Line number ${args.lineNumber} exceeds file length (${lines.length} lines)`
        });
      }

    } catch (error) {
      result.warnings.push({
        field: 'sourceFile',
        code: 'FILE_CHECK_FAILED',
        message: 'Could not validate source file',
        suggestion: 'Ensure file is accessible'
      });
    }
  }

  // Format validation helpers
  private isValidEthereumAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  private isValidTransactionHash(hash: string): boolean {
    return /^0x[a-fA-F0-9]{64}$/.test(hash);
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private isValidFilePath(path: string): boolean {
    // Basic file path validation - no null bytes, reasonable length
    return !path.includes('\0') && path.length < 1000 && path.trim().length > 0;
  }

  private isValidSolidityVersion(version: string): boolean {
    return version === 'latest' || /^\d+\.\d+\.\d+/.test(version);
  }

  private requiresWorkspace(toolName: string): boolean {
    const workspaceTools = [
      'solidity_compile', 'deploy_contract', 'file_write',
      'file_create', 'set_breakpoint'
    ];
    return workspaceTools.includes(toolName);
  }

  private isMainnetOperation(call: IMCPToolCall): boolean {
    const args = call.arguments || {};
    return args.network === 'mainnet' || args.network === '1' || args.chainId === 1;
  }
}

/**
 * Default validation configuration
 */
export const defaultValidationConfig: ValidationConfig = {
  validateSchemas: true,
  validateTypes: true,
  validateRanges: true,
  validateFormats: true,
  strictMode: false,
  customValidators: new Map()
};