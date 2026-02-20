/**
 * Debugging Tool Handlers for Remix MCP Server
 */

import { ICustomRemixApi } from '@remix-api';
import { IMCPToolResult } from '../../types/mcp';
import { BaseToolHandler } from '../registry/RemixToolRegistry';
import {
  ToolCategory,
  RemixToolDefinition,
  DebugSessionArgs,
  DebugSessionResult,
} from '../types/mcpTools';
import { Plugin } from '@remixproject/engine';
import { processScopes } from '../../helpers/scopeProcessor';

/**
 * Start Debug Session Tool Handler
 */
export class StartDebugSessionHandler extends BaseToolHandler {
  name = 'start_debug_session';
  description = 'Start a debugging session for a smart contract';
  inputSchema = {
    type: 'object',
    properties: {
      transactionHash: {
        type: 'string',
        description: 'Transaction hash to debug (optional)',
        pattern: '^0x[a-fA-F0-9]{64}$'
      },
      /*
      network: {
        type: 'string',
        description: 'Network to debug on',
        default: 'local'
      }
        */
    },
    required: ['transactionHash']
  };

  getPermissions(): string[] {
    return ['debug:start'];
  }

  validate(args: DebugSessionArgs): boolean | string {
    const required = this.validateRequired(args, ['transactionHash']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      transactionHash: 'string',
    });
    if (types !== true) return types;

    if (args.transactionHash && !args.transactionHash.match(/^0x[a-fA-F0-9]{64}$/)) {
      return 'Invalid transaction hash format';
    }

    return true;
  }

  async execute(args: DebugSessionArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      await plugin.call('debugger', 'debug', args.transactionHash)
      // Mock debug session creation
      const result: DebugSessionResult = {
        success: true,
        transactionHash: args.transactionHash,
        status: 'started',
        createdAt: new Date().toISOString()
      };
      plugin.call('menuicons', 'select', 'debugger')
      return this.createSuccessResult(result);

    } catch (error) {
      return this.createErrorResult(`Failed to start debug session: ${error.message}`);
    }
  }
}

/**
 * Decode Local Variable Tool Handler
 */
export class DecodeLocalVariableHandler extends BaseToolHandler {
  name = 'decode_local_variable';
  description = 'Decode a local variable at a specific step in the transaction execution';
  inputSchema = {
    type: 'object',
    properties: {
      variableId: {
        type: 'number',
        description: 'The unique identifier of the local variable to decode'
      },
      stepIndex: {
        type: 'number',
        description: 'Optional step index in the trace; defaults to current step if not provided'
      }
    },
    required: ['variableId']
  };

  getPermissions(): string[] {
    return ['debug:read'];
  }

  validate(args: { variableId: number; stepIndex?: number }): boolean | string {
    const required = this.validateRequired(args, ['variableId']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      variableId: 'number',
    });
    if (types !== true) return types;

    if (args.stepIndex !== undefined) {
      const stepTypes = this.validateTypes({ stepIndex: args.stepIndex }, { stepIndex: 'number' });
      if (stepTypes !== true) return stepTypes;
    }

    return true;
  }

  async execute(args: { variableId: number; stepIndex?: number }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const result = await plugin.call('debugger', 'decodeLocalVariable', args.variableId, args.stepIndex);
      if (result === null) {
        return this.createErrorResult('The local variable might not be available at the current debug step. Please check the current execution step!');
      }

      return this.createSuccessResult({
        success: true,
        variableId: args.variableId,
        stepIndex: args.stepIndex,
        decodedValue: result
      });

    } catch (error) {
      return this.createErrorResult(`Failed to decode local variable: ${error.message}`);
    }
  }
}

/**
 * Decode State Variable Tool Handler
 */
export class DecodeStateVariableHandler extends BaseToolHandler {
  name = 'decode_state_variable';
  description = 'Decode a state variable at a specific step in the transaction execution';
  inputSchema = {
    type: 'object',
    properties: {
      variableId: {
        type: 'number',
        description: 'The unique identifier of the state variable to decode'
      },
      stepIndex: {
        type: 'number',
        description: 'Optional step index in the trace; defaults to current step if not provided'
      }
    },
    required: ['variableId']
  };

  getPermissions(): string[] {
    return ['debug:read'];
  }

  validate(args: { variableId: number; stepIndex?: number }): boolean | string {
    const required = this.validateRequired(args, ['variableId']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      variableId: 'number',
    });
    if (types !== true) return types;

    if (args.stepIndex !== undefined) {
      const stepTypes = this.validateTypes({ stepIndex: args.stepIndex }, { stepIndex: 'number' });
      if (stepTypes !== true) return stepTypes;
    }

    return true;
  }

  async execute(args: { variableId: number; stepIndex?: number }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const result = await plugin.call('debugger', 'decodeStateVariable', args.variableId, args.stepIndex);

      if (result === null) {
        return this.createErrorResult('The state variable might not be available at the current debug step. Please check the current execution step!');
      }

      return this.createSuccessResult({
        success: true,
        variableId: args.variableId,
        stepIndex: args.stepIndex,
        decodedValue: result
      });

    } catch (error) {
      return this.createErrorResult(`Failed to decode state variable: ${error.message}`);
    }
  }
}

/**
 * Get Valid Source Location From VM Trace Index Handler
 */
export class GetValidSourceLocationFromVMTraceIndexHandler extends BaseToolHandler {
  name = 'get_valid_source_location_from_vm_trace_index';
  description = 'Get a valid source location from a VM trace step index';
  inputSchema = {
    type: 'object',
    properties: {
      stepIndex: {
        type: 'number',
        description: 'VM trace step index'
      }
    },
    required: ['stepIndex']
  };

  getPermissions(): string[] {
    return ['debug:read'];
  }

  validate(args: { address: string; stepIndex: number }): boolean | string {
    const required = this.validateRequired(args, ['stepIndex']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      stepIndex: 'number',
    });
    if (types !== true) return types;

    return true;
  }

  async execute(args: { address: string; stepIndex: number }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const result = await plugin.call('debugger', 'getValidSourceLocationFromVMTraceIndex', args.stepIndex);

      if (!result) {
        return this.createErrorResult('Source location not available. Ensure a debug session is active.');
      }

      return this.createSuccessResult({
        success: true,
        stepIndex: args.stepIndex,
        sourceLocation: result
      });

    } catch (error) {
      return this.createErrorResult(`Failed to get valid source location: ${error.message}`);
    }
  }
}

/**
 * Extract Locals At Handler
 */
export class ExtractLocalsAtHandler extends BaseToolHandler {
  name = 'extract_locals_at';
  description = 'Extract the scope information (local variables context) at a specific execution step';
  inputSchema = {
    type: 'object',
    properties: {
      step: {
        type: 'number',
        description: 'Execution step index'
      }
    },
    required: ['step']
  };

  getPermissions(): string[] {
    return ['debug:read'];
  }

  validate(args: { step: number }): boolean | string {
    const required = this.validateRequired(args, ['step']);
    if (required !== true) return required;

    const types = this.validateTypes(args, { step: 'number' });
    if (types !== true) return types;

    return true;
  }

  async execute(args: { step: number }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const result = await plugin.call('debugger', 'extractLocalsAt', args.step);

      if (!result) {
        return this.createErrorResult('Scope information not available. Ensure a debug session is active.');
      }

      return this.createSuccessResult({
        success: true,
        step: args.step,
        scope: result
      });

    } catch (error) {
      return this.createErrorResult(`Failed to extract locals: ${error.message}`);
    }
  }
}

/**
 * Decode Locals At Handler
 */
export class DecodeLocalsAtHandler extends BaseToolHandler {
  name = 'decode_locals_at';
  description = 'Decode all local variables at a specific execution step and source location';
  inputSchema = {
    type: 'object',
    properties: {
      step: {
        type: 'number',
        description: 'Execution step index'
      },
      sourceLocation: {
        type: 'object',
        description: 'Source code location for context'
      }
    },
    required: ['step', 'sourceLocation']
  };

  getPermissions(): string[] {
    return ['debug:read'];
  }

  validate(args: { step: number; sourceLocation: any }): boolean | string {
    const required = this.validateRequired(args, ['step', 'sourceLocation']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      step: 'number',
      sourceLocation: 'object'
    });
    if (types !== true) return types;

    return true;
  }

  async execute(args: { step: number; sourceLocation: any }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      return new Promise((resolve) => {
        plugin.call('debugger', 'decodeLocalsAt', args.step, args.sourceLocation, (error, locals) => {
          if (error) {
            resolve(this.createErrorResult(`Failed to decode locals: ${error}`));
          } else {
            resolve(this.createSuccessResult({
              success: true,
              step: args.step,
              locals: locals
            }));
          }
        });
      });

    } catch (error) {
      return this.createErrorResult(`Failed to decode locals: ${error.message}`);
    }
  }
}

/**
 * Extract State At Handler
 */
export class ExtractStateAtHandler extends BaseToolHandler {
  name = 'extract_state_at';
  description = 'Extract all state variables metadata at a specific execution step';
  inputSchema = {
    type: 'object',
    properties: {
      step: {
        type: 'number',
        description: 'Execution step index'
      }
    },
    required: ['step']
  };

  getPermissions(): string[] {
    return ['debug:read'];
  }

  validate(args: { step: number }): boolean | string {
    const required = this.validateRequired(args, ['step']);
    if (required !== true) return required;

    const types = this.validateTypes(args, { step: 'number' });
    if (types !== true) return types;

    return true;
  }

  async execute(args: { step: number }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const result = await plugin.call('debugger', 'extractStateAt', args.step);

      if (!result) {
        return this.createErrorResult('State variables not available. Ensure a debug session is active.');
      }

      return this.createSuccessResult({
        success: true,
        step: args.step,
        stateVariables: result
      });

    } catch (error) {
      return this.createErrorResult(`Failed to extract state variables: ${error.message}`);
    }
  }
}

/**
 * Decode State At Handler
 */
export class DecodeStateAtHandler extends BaseToolHandler {
  name = 'decode_state_at';
  description = 'Decode the values of specified state variables at a specific execution step';
  inputSchema = {
    type: 'object',
    properties: {
      step: {
        type: 'number',
        description: 'Execution step index'
      },
      stateVars: {
        type: 'array',
        description: 'Array of state variable metadata to decode'
      }
    },
    required: ['step', 'stateVars']
  };

  getPermissions(): string[] {
    return ['debug:read'];
  }

  validate(args: { step: number; stateVars: any[] }): boolean | string {
    const required = this.validateRequired(args, ['step', 'stateVars']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      step: 'number',
      stateVars: 'object'
    });
    if (types !== true) return types;

    if (!Array.isArray(args.stateVars)) {
      return 'stateVars must be an array';
    }

    return true;
  }

  async execute(args: { step: number; stateVars: any[] }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const result = await plugin.call('debugger', 'decodeStateAt', args.step, args.stateVars);

      if (!result) {
        return this.createErrorResult('Failed to decode state variables. Ensure a debug session is active.');
      }

      return this.createSuccessResult({
        success: true,
        step: args.step,
        decodedState: result
      });

    } catch (error) {
      return this.createErrorResult(`Failed to decode state: ${error.message}`);
    }
  }
}

/**
 * Storage View At Handler
 */
export class StorageViewAtHandler extends BaseToolHandler {
  name = 'storage_view_at';
  description = 'Create a storage viewer for inspecting contract storage at a specific step';
  inputSchema = {
    type: 'object',
    properties: {
      step: {
        type: 'number',
        description: 'Execution step index'
      },
      address: {
        type: 'string',
        description: 'Contract address whose storage to view',
        pattern: '^0x[a-fA-F0-9]{40}$'
      }
    },
    required: ['step', 'address']
  };

  getPermissions(): string[] {
    return ['debug:read'];
  }

  validate(args: { step: number; address: string }): boolean | string {
    const required = this.validateRequired(args, ['step', 'address']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      step: 'number',
      address: 'string'
    });
    if (types !== true) return types;

    if (!args.address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return 'Invalid contract address format';
    }

    return true;
  }

  async execute(args: { step: number; address: string }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const result = await plugin.call('debugger', 'storageViewAt', args.step, args.address);

      if (!result) {
        return this.createErrorResult('Storage viewer not available. Ensure a debug session is active.');
      }

      return this.createSuccessResult({
        success: true,
        step: args.step,
        address: args.address,
        message: 'Storage viewer created successfully. Use this for inspecting contract storage.'
      });

    } catch (error) {
      return this.createErrorResult(`Failed to create storage viewer: ${error.message}`);
    }
  }
}

/**
 * Jump To Step Handler
 */
export class JumpToHandler extends BaseToolHandler {
  name = 'jump_to';
  description = 'Jump directly to a specific step in the execution trace';
  inputSchema = {
    type: 'object',
    properties: {
      step: {
        type: 'number',
        description: 'The target step index to jump to'
      }
    },
    required: ['step']
  };

  getPermissions(): string[] {
    return ['debug:control'];
  }

  validate(args: { step: number }): boolean | string {
    const required = this.validateRequired(args, ['step']);
    if (required !== true) return required;

    const types = this.validateTypes(args, { step: 'number' });
    if (types !== true) return types;

    if (args.step < 0) {
      return 'Step index must be a non-negative number';
    }

    return true;
  }

  async execute(args: { step: number }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      await plugin.call('debugger', 'jumpTo', args.step);

      return this.createSuccessResult({
        success: true,
        step: args.step,
        message: `Successfully jumped to step ${args.step}`
      });

    } catch (error) {
      return this.createErrorResult(`Failed to jump to step: ${error.message}`);
    }
  }
}

/**
 * Get Stack At Handler
 */
export class GetStackAtHandler extends BaseToolHandler {
  name = 'get_stack_at';
  description = 'Get the execution stack at a specific step in the transaction trace';
  inputSchema = {
    type: 'object',
    properties: {
      step: {
        type: 'number',
        description: 'Optional step index in the trace; defaults to current step if not provided'
      }
    },
    required: []
  };

  getPermissions(): string[] {
    return ['debug:read'];
  }

  validate(args: { step?: number }): boolean | string {
    if (args.step !== undefined) {
      const types = this.validateTypes(args, { step: 'number' });
      if (types !== true) return types;

      if (args.step < 0) {
        return 'Step index must be a non-negative number';
      }
    }
    return true;
  }

  async execute(args: { step?: number }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const result = await plugin.call('debugger', 'getStackAt', args.step);

      if (!result) {
        return this.createErrorResult('Stack information not available. Ensure a debug session is active.');
      }

      return this.createSuccessResult({
        success: true,
        step: args.step,
        stack: result,
        metadata: {
          description: 'Execution stack at the specified step',
          stackDepth: Array.isArray(result) ? result.length : 0,
          retrievedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      return this.createErrorResult(`Failed to get stack: ${error.message}`);
    }
  }
}

/**
 * Get Scopes No Jump With Root Handler
 */
export class GetScopesNoJumpWithRootHandler extends BaseToolHandler {
  name = 'get_scopes_with_root';
  description = 'Get focused scope information for a specific root scope and its children';
  inputSchema = {
    type: 'object',
    properties: {
      rootScopeId: {
        type: 'string',
        description: 'Root scope ID to focus on (e.g., "1", "1.2", "1.2.3")',
        default: '1'
      }
    },
    required: []
  };

  getPermissions(): string[] {
    return ['debug:read'];
  }

  validate(args: { rootScopeId?: string }): boolean | string {
    if (args.rootScopeId !== undefined) {
      const types = this.validateTypes(args, { rootScopeId: 'string' });
      if (types !== true) return types;
    }
    return true;
  }

  async execute(args: { rootScopeId?: string }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const rootScopeId = args.rootScopeId || '1';
      const result = await plugin.call('debugger', 'getScopesAsNestedJSON', 'nojump', rootScopeId);

      if (!result || !Array.isArray(result)) {
        return this.createErrorResult('Focused scope information not available for root scope: ' + rootScopeId + '. Ensure a debug session is active.');
      }

      // Process scopes with depth limit using shared helper
      const processedScopes = processScopes(result, 3);

      const responseData = {
        success: true,
        rootScopeId,
        scopes: processedScopes,
        metadata: {
          description: 'Focused scope information for specific root scope and children (depth limited to 3), filtered to exclude jump instructions',
          totalScopes: processedScopes.length,
          depthLimit: {
            maxDepth: 3,
            note: "For deeper exploration beyond depth 3, use this same tool with specific child scope IDs"
          },
          retrievedAt: new Date().toISOString()
        }
      };

      return this.createSuccessResult(responseData);

    } catch (error) {
      return this.createErrorResult(`Failed to get scopes ${args.rootScopeId}: ${error.message}`);
    }
  }
}

/**
 * Create debugging tool definitions
 */
export function createDebuggingTools(): RemixToolDefinition[] {
  return [
    {
      name: 'start_debug_session',
      description: 'Start a debugging session for a smart contract',
      inputSchema: new StartDebugSessionHandler().inputSchema,
      category: ToolCategory.DEBUGGING,
      permissions: ['debug:start'],
      handler: new StartDebugSessionHandler()
    },
    {
      name: 'decode_local_variable',
      description: 'Decode a local variable at a specific step in the transaction execution',
      inputSchema: new DecodeLocalVariableHandler().inputSchema,
      category: ToolCategory.DEBUGGING,
      permissions: ['debug:read'],
      handler: new DecodeLocalVariableHandler()
    },
    {
      name: 'decode_state_variable',
      description: 'Decode a state variable at a specific step in the transaction execution',
      inputSchema: new DecodeStateVariableHandler().inputSchema,
      category: ToolCategory.DEBUGGING,
      permissions: ['debug:read'],
      handler: new DecodeStateVariableHandler()
    },
    {
      name: 'get_valid_source_location_from_vm_trace_index',
      description: 'Get a valid source location from a VM trace step index',
      inputSchema: new GetValidSourceLocationFromVMTraceIndexHandler().inputSchema,
      category: ToolCategory.DEBUGGING,
      permissions: ['debug:read'],
      handler: new GetValidSourceLocationFromVMTraceIndexHandler()
    },
    {
      name: 'extract_locals_at',
      description: 'Extract the scope information (local variables context) at a specific execution step',
      inputSchema: new ExtractLocalsAtHandler().inputSchema,
      category: ToolCategory.DEBUGGING,
      permissions: ['debug:read'],
      handler: new ExtractLocalsAtHandler()
    },
    {
      name: 'decode_locals_at',
      description: 'Decode all local variables at a specific execution step and source location',
      inputSchema: new DecodeLocalsAtHandler().inputSchema,
      category: ToolCategory.DEBUGGING,
      permissions: ['debug:read'],
      handler: new DecodeLocalsAtHandler()
    },
    {
      name: 'extract_state_at',
      description: 'Extract all state variables metadata at a specific execution step',
      inputSchema: new ExtractStateAtHandler().inputSchema,
      category: ToolCategory.DEBUGGING,
      permissions: ['debug:read'],
      handler: new ExtractStateAtHandler()
    },
    {
      name: 'decode_state_at',
      description: 'Decode the values of specified state variables at a specific execution step',
      inputSchema: new DecodeStateAtHandler().inputSchema,
      category: ToolCategory.DEBUGGING,
      permissions: ['debug:read'],
      handler: new DecodeStateAtHandler()
    },
    {
      name: 'storage_view_at',
      description: 'Create a storage viewer for inspecting contract storage at a specific step',
      inputSchema: new StorageViewAtHandler().inputSchema,
      category: ToolCategory.DEBUGGING,
      permissions: ['debug:read'],
      handler: new StorageViewAtHandler()
    },
    {
      name: 'jump_to',
      description: 'Jump directly to a specific step in the execution trace',
      inputSchema: new JumpToHandler().inputSchema,
      category: ToolCategory.DEBUGGING,
      permissions: ['debug:control'],
      handler: new JumpToHandler()
    },
    {
      name: 'get_stack_at',
      description: 'Get the execution stack at a specific step in the transaction trace',
      inputSchema: new GetStackAtHandler().inputSchema,
      category: ToolCategory.DEBUGGING,
      permissions: ['debug:read'],
      handler: new GetStackAtHandler()
    },
    {
      name: 'get_scopes_with_root',
      description: 'Get focused scope information for a specific root scope and its children, filtered to exclude jump instructions',
      inputSchema: new GetScopesNoJumpWithRootHandler().inputSchema,
      category: ToolCategory.DEBUGGING,
      permissions: ['debug:read'],
      handler: new GetScopesNoJumpWithRootHandler()
    }
  ];
}
