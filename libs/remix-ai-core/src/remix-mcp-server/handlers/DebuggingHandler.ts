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
  BreakpointArgs,
  DebugStepArgs,
  DebugWatchArgs,
  DebugEvaluateArgs,
  DebugCallStackArgs,
  DebugVariablesArgs,
  DebugSessionResult,
  BreakpointResult,
  DebugStepResult
} from '../types/mcpTools';
import { Plugin } from '@remixproject/engine';

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
 * Set Breakpoint Tool Handler
 */
export class SetBreakpointHandler extends BaseToolHandler {
  name = 'set_breakpoint';
  description = 'Set a breakpoint in smart contract code';
  inputSchema = {
    type: 'object',
    properties: {
      sourceFile: {
        type: 'string',
        description: 'Source file path'
      },
      lineNumber: {
        type: 'number',
        description: 'Line number to set breakpoint',
        minimum: 1
      },
      condition: {
        type: 'string',
        description: 'Conditional breakpoint expression (optional)'
      },
      hitCount: {
        type: 'number',
        description: 'Hit count condition (optional)',
        minimum: 1
      }
    },
    required: ['sourceFile', 'lineNumber']
  };

  getPermissions(): string[] {
    return ['debug:breakpoint'];
  }

  validate(args: BreakpointArgs): boolean | string {
    const required = this.validateRequired(args, ['sourceFile', 'lineNumber']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      sourceFile: 'string',
      lineNumber: 'number',
      condition: 'string',
      hitCount: 'number'
    });
    if (types !== true) return types;

    if (args.lineNumber < 1) {
      return 'Line number must be at least 1';
    }

    if (args.hitCount !== undefined && args.hitCount < 1) {
      return 'Hit count must be at least 1';
    }

    return true;
  }

  async execute(args: BreakpointArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Check if source file exists
      const exists = await plugin.call('fileManager', 'exists', args.sourceFile);
      if (!exists) {
        return this.createErrorResult(`Source file not found: ${args.sourceFile}`);
      }

      // TODO: Set breakpoint via Remix debugger API
      const breakpointId = `bp_${Date.now()}`;

      const result: BreakpointResult = {
        success: true,
        breakpointId,
        sourceFile: args.sourceFile,
        lineNumber: args.lineNumber,
        condition: args.condition,
        hitCount: args.hitCount,
        enabled: true,
        setAt: new Date().toISOString()
      };

      return this.createSuccessResult(result);

    } catch (error) {
      return this.createErrorResult(`Failed to set breakpoint: ${error.message}`);
    }
  }
}

/**
 * Debug Step Tool Handler
 */
export class DebugStepHandler extends BaseToolHandler {
  name = 'debug_step';
  description = 'Step through code during debugging';
  inputSchema = {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Debug session ID'
      },
      stepType: {
        type: 'string',
        enum: ['into', 'over', 'out', 'continue'],
        description: 'Type of step to perform'
      }
    },
    required: ['sessionId', 'stepType']
  };

  getPermissions(): string[] {
    return ['debug:step'];
  }

  validate(args: DebugStepArgs): boolean | string {
    const required = this.validateRequired(args, ['sessionId', 'stepType']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      sessionId: 'string',
      stepType: 'string'
    });
    if (types !== true) return types;

    const validStepTypes = ['into', 'over', 'out', 'continue'];
    if (!validStepTypes.includes(args.stepType)) {
      return `Invalid step type. Must be one of: ${validStepTypes.join(', ')}`;
    }

    return true;
  }

  async execute(args: DebugStepArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // TODO: Execute step via Remix debugger API

      const result: DebugStepResult = {
        success: true,
        sessionId: args.sessionId,
        stepType: args.stepType,
        currentLocation: {
          sourceFile: 'contracts/example.sol',
          lineNumber: Math.floor(Math.random() * 100) + 1,
          columnNumber: 1
        },
        stackTrace: [
          {
            function: 'main',
            sourceFile: 'contracts/example.sol',
            lineNumber: 25
          }
        ],
        steppedAt: new Date().toISOString()
      };

      return this.createSuccessResult(result);

    } catch (error) {
      return this.createErrorResult(`Debug step failed: ${error.message}`);
    }
  }
}

/**
 * Debug Watch Variable Tool Handler
 */
export class DebugWatchHandler extends BaseToolHandler {
  name = 'debug_watch';
  description = 'Watch a variable or expression during debugging';
  inputSchema = {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Debug session ID'
      },
      expression: {
        type: 'string',
        description: 'Variable name or expression to watch'
      },
      watchType: {
        type: 'string',
        enum: ['variable', 'expression', 'memory'],
        description: 'Type of watch to add',
        default: 'variable'
      }
    },
    required: ['sessionId', 'expression']
  };

  getPermissions(): string[] {
    return ['debug:watch'];
  }

  validate(args: DebugWatchArgs): boolean | string {
    const required = this.validateRequired(args, ['sessionId', 'expression']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      sessionId: 'string',
      expression: 'string',
      watchType: 'string'
    });
    if (types !== true) return types;

    if (args.watchType) {
      const validTypes = ['variable', 'expression', 'memory'];
      if (!validTypes.includes(args.watchType)) {
        return `Invalid watch type. Must be one of: ${validTypes.join(', ')}`;
      }
    }

    return true;
  }

  async execute(args: DebugWatchArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // TODO: Add watch via Remix debugger API
      const watchId = `watch_${Date.now()}`;

      const result = {
        success: true,
        watchId,
        sessionId: args.sessionId,
        expression: args.expression,
        watchType: args.watchType || 'variable',
        currentValue: 'undefined', // Mock value
        addedAt: new Date().toISOString()
      };

      return this.createSuccessResult(result);

    } catch (error) {
      return this.createErrorResult(`Failed to add watch: ${error.message}`);
    }
  }
}

/**
 * Debug Evaluate Expression Tool Handler
 */
export class DebugEvaluateHandler extends BaseToolHandler {
  name = 'debug_evaluate';
  description = 'Evaluate an expression in the current debug context';
  inputSchema = {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Debug session ID'
      },
      expression: {
        type: 'string',
        description: 'Expression to evaluate'
      },
      context: {
        type: 'string',
        enum: ['current', 'global', 'local'],
        description: 'Evaluation context',
        default: 'current'
      }
    },
    required: ['sessionId', 'expression']
  };

  getPermissions(): string[] {
    return ['debug:evaluate'];
  }

  validate(args: DebugEvaluateArgs): boolean | string {
    const required = this.validateRequired(args, ['sessionId', 'expression']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      sessionId: 'string',
      expression: 'string',
      context: 'string'
    });
    if (types !== true) return types;

    if (args.context) {
      const validContexts = ['current', 'global', 'local'];
      if (!validContexts.includes(args.context)) {
        return `Invalid context. Must be one of: ${validContexts.join(', ')}`;
      }
    }

    return true;
  }

  async execute(args: DebugEvaluateArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // TODO: Evaluate expression via Remix debugger API

      const result = {
        success: true,
        sessionId: args.sessionId,
        expression: args.expression,
        result: '42', // Mock evaluation result
        type: 'uint256',
        context: args.context || 'current',
        evaluatedAt: new Date().toISOString()
      };

      return this.createSuccessResult(result);

    } catch (error) {
      return this.createErrorResult(`Expression evaluation failed: ${error.message}`);
    }
  }
}

/**
 * Get Debug Call Stack Tool Handler
 */
export class GetDebugCallStackHandler extends BaseToolHandler {
  name = 'get_debug_call_stack';
  description = 'Get the current call stack during debugging';
  inputSchema = {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Debug session ID'
      }
    },
    required: ['sessionId']
  };

  getPermissions(): string[] {
    return ['debug:read'];
  }

  validate(args: DebugCallStackArgs): boolean | string {
    const required = this.validateRequired(args, ['sessionId']);
    if (required !== true) return required;

    const types = this.validateTypes(args, { sessionId: 'string' });
    if (types !== true) return types;

    return true;
  }

  async execute(args: DebugCallStackArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // TODO: Get call stack via Remix debugger API

      const result = {
        success: true,
        sessionId: args.sessionId,
        callStack: [
          {
            function: 'transfer',
            contract: 'ERC20Token',
            sourceFile: 'contracts/ERC20Token.sol',
            lineNumber: 45,
            address: '0x' + Math.random().toString(16).substr(2, 40)
          },
          {
            function: 'main',
            contract: 'Main',
            sourceFile: 'contracts/Main.sol',
            lineNumber: 12,
            address: '0x' + Math.random().toString(16).substr(2, 40)
          }
        ],
        depth: 2,
        retrievedAt: new Date().toISOString()
      };

      return this.createSuccessResult(result);

    } catch (error) {
      return this.createErrorResult(`Failed to get call stack: ${error.message}`);
    }
  }
}

/**
 * Get Debug Variables Tool Handler
 */
export class GetDebugVariablesHandler extends BaseToolHandler {
  name = 'get_debug_variables';
  description = 'Get current variable values during debugging';
  inputSchema = {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Debug session ID'
      },
      scope: {
        type: 'string',
        enum: ['local', 'global', 'storage', 'memory'],
        description: 'Variable scope to retrieve',
        default: 'local'
      }
    },
    required: ['sessionId']
  };

  getPermissions(): string[] {
    return ['debug:read'];
  }

  validate(args: DebugVariablesArgs): boolean | string {
    const required = this.validateRequired(args, ['sessionId']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      sessionId: 'string',
      scope: 'string'
    });
    if (types !== true) return types;

    if (args.scope) {
      const validScopes = ['local', 'global', 'storage', 'memory'];
      if (!validScopes.includes(args.scope)) {
        return `Invalid scope. Must be one of: ${validScopes.join(', ')}`;
      }
    }

    return true;
  }

  async execute(args: DebugVariablesArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // TODO: Get variables via Remix debugger API

      const result = {
        success: true,
        sessionId: args.sessionId,
        scope: args.scope || 'local',
        variables: [
          {
            name: 'balance',
            value: '1000000000000000000',
            type: 'uint256',
            location: 'storage'
          },
          {
            name: 'owner',
            value: '0x' + Math.random().toString(16).substr(2, 40),
            type: 'address',
            location: 'storage'
          },
          {
            name: 'amount',
            value: '500',
            type: 'uint256',
            location: 'local'
          }
        ],
        retrievedAt: new Date().toISOString()
      };

      return this.createSuccessResult(result);

    } catch (error) {
      return this.createErrorResult(`Failed to get variables: ${error.message}`);
    }
  }
}

/**
 * Stop Debug Session Tool Handler
 */
export class StopDebugSessionHandler extends BaseToolHandler {
  name = 'stop_debug_session';
  description = 'Stop an active debugging session';
  inputSchema = {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Debug session ID to stop'
      }
    },
    required: ['sessionId']
  };

  getPermissions(): string[] {
    return ['debug:stop'];
  }

  validate(args: { sessionId: string }): boolean | string {
    const required = this.validateRequired(args, ['sessionId']);
    if (required !== true) return required;

    const types = this.validateTypes(args, { sessionId: 'string' });
    if (types !== true) return types;

    return true;
  }

  async execute(args: { sessionId: string }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // TODO: Stop debug session via Remix debugger API

      const result = {
        success: true,
        sessionId: args.sessionId,
        status: 'stopped',
        stoppedAt: new Date().toISOString(),
        message: 'Debug session stopped successfully'
      };

      return this.createSuccessResult(result);

    } catch (error) {
      return this.createErrorResult(`Failed to stop debug session: ${error.message}`);
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
      name: 'set_breakpoint',
      description: 'Set a breakpoint in smart contract code',
      inputSchema: new SetBreakpointHandler().inputSchema,
      category: ToolCategory.DEBUGGING,
      permissions: ['debug:breakpoint'],
      handler: new SetBreakpointHandler()
    },
    {
      name: 'debug_step',
      description: 'Step through code during debugging',
      inputSchema: new DebugStepHandler().inputSchema,
      category: ToolCategory.DEBUGGING,
      permissions: ['debug:step'],
      handler: new DebugStepHandler()
    },
    {
      name: 'debug_watch',
      description: 'Watch a variable or expression during debugging',
      inputSchema: new DebugWatchHandler().inputSchema,
      category: ToolCategory.DEBUGGING,
      permissions: ['debug:watch'],
      handler: new DebugWatchHandler()
    },
    {
      name: 'debug_evaluate',
      description: 'Evaluate an expression in the current debug context',
      inputSchema: new DebugEvaluateHandler().inputSchema,
      category: ToolCategory.DEBUGGING,
      permissions: ['debug:evaluate'],
      handler: new DebugEvaluateHandler()
    },
    {
      name: 'get_debug_call_stack',
      description: 'Get the current call stack during debugging',
      inputSchema: new GetDebugCallStackHandler().inputSchema,
      category: ToolCategory.DEBUGGING,
      permissions: ['debug:read'],
      handler: new GetDebugCallStackHandler()
    },
    {
      name: 'get_debug_variables',
      description: 'Get current variable values during debugging',
      inputSchema: new GetDebugVariablesHandler().inputSchema,
      category: ToolCategory.DEBUGGING,
      permissions: ['debug:read'],
      handler: new GetDebugVariablesHandler()
    },
    {
      name: 'stop_debug_session',
      description: 'Stop an active debugging session',
      inputSchema: new StopDebugSessionHandler().inputSchema,
      category: ToolCategory.DEBUGGING,
      permissions: ['debug:stop'],
      handler: new StopDebugSessionHandler()
    }
  ];
}