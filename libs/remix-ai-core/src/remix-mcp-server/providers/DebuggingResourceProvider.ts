/**
 * Debugging Resource Provider - Provides access to debugging session data and trace information
 */

import { Plugin } from '@remixproject/engine';
import { IMCPResource, IMCPResourceContent } from '../../types/mcp';
import { BaseResourceProvider } from '../registry/RemixResourceProviderRegistry';
import { ResourceCategory } from '../types/mcpResources';
import type { ScopesData } from '@remix-project/remix-debug'

export class DebuggingResourceProvider extends BaseResourceProvider {
  name = 'debugging';
  description = 'Provides access to debugging session data, trace cache, and call tree information';
  private _plugin;

  constructor(plugin) {
    super();
    this._plugin = plugin;
  }

  async getResources(plugin: Plugin): Promise<IMCPResource[]> {
    const resources: IMCPResource[] = [];

    try {
      // Add call tree scopes resource
      resources.push(
        this.createResource(
          'debug://call-tree-scopes',
          'Call Tree Scopes',
          'Comprehensive scope information from call tree analysis including function calls, scopes, and local variables',
          'application/json',
          {
            category: ResourceCategory.DEBUG_SESSIONS,
            tags: ['debugging', 'call-tree', 'scopes', 'functions', 'variables'],
            priority: 9
          }
        )
      );

      // Add trace cache resource
      resources.push(
        this.createResource(
          'debug://trace-cache',
          'Trace Cache',
          'Complete trace cache data including calls, storage changes, memory changes, and execution flow',
          'application/json',
          {
            category: ResourceCategory.DEBUG_SESSIONS,
            tags: ['debugging', 'trace', 'cache', 'storage', 'memory', 'calls'],
            priority: 8
          }
        )
      );

      // Add trace cache resource
      resources.push(
        this.createResource(
          'debug://current-debugging-step',
          'debugging step',
          'Debugging step that the user is currently inspecting',
          'application/json',
          {
            category: ResourceCategory.DEBUG_SESSIONS,
            tags: ['debugging step', 'code'],
            priority: 8
          }
        )
      );

    } catch (error) {
      console.warn('Failed to get debugging resources:', error);
    }

    return resources;
  }

  async getResourceContent(uri: string, plugin: Plugin): Promise<IMCPResourceContent> {
    if (uri === 'debug://call-tree-scopes') {
      return this.getCallTreeScopes(plugin);
    }

    if (uri === 'debug://trace-cache') {
      return this.getTraceCache(plugin);
    }

    if (uri === 'debug://current-debugging-step') {
      return this.getCurrentSourceLocation(plugin);
    }

    throw new Error(`Unsupported debugging resource URI: ${uri}`);
  }

  canHandle(uri: string): boolean {
    return uri.startsWith('debug://');
  }

  private async getCurrentSourceLocation(plugin: Plugin): Promise<IMCPResourceContent> {
    try {
      const result = await plugin.call('debugger', 'getCurrentSourceLocation')
      if (!result) {
        return this.createTextContent(
          'debug://current-debugging-step',
          'current source location is not available. There is no debug session going on.'
        );
      }

      return this.createJsonContent('debug://current-debugging-step', {
        success: true,
        description: 'Current source code highlighted in the editor',
        result
      });

    } catch (error) {
      return this.createTextContent(
        'debug://current-debugging-step',
        `Error getting current source location: ${error.message}`
      );
    }
  }

  callTreeScopesDesc = `
  /**
   * Retrieves comprehensive scope information from the call tree analysis.
   *
   * Returns an object with the following properties:
   *
   * 1. scopes: Map of all scopes in the execution trace
   *    - Keys: scopeId strings in dotted notation (e.g., "1", "1.2", "1.2.3" for nested scopes)
   *    - Values: Scope objects with:
   *      * firstStep: VM trace index where scope begins
   *      * lastStep: VM trace index where scope ends
   *      * locals: Map of local variables (variable name -> {name, type, stackIndex, sourceLocation})
   *      * isCreation: Boolean indicating if this is a contract creation context
   *      * gasCost: Total gas consumed within this scope
   *
   * 2. scopeStarts: Map linking VM trace indices to scope identifiers
   *    - Keys: VM trace step indices
   *    - Values: scopeId strings indicating which scope starts at each step
   *
   * 3. functionDefinitionsByScope: Map of function definitions for each scope
   *    - Keys: scopeId strings
   *    - Values: Objects containing:
   *      * functionDefinition: AST node with function metadata (name, parameters, returnParameters, etc.)
   *      * inputs: Array of input parameter names
   *
   * 4. functionCallStack: Array of VM trace step indices where function calls occur, ordered chronologically
   */
  `
  private async getCallTreeScopes(plugin: Plugin): Promise<IMCPResourceContent> {
    try {
      const result = await plugin.call('debugger', 'getCallTreeScopes') as ScopesData
      if (!result) {
        return this.createTextContent(
          'debug://call-tree-scopes',
          'Call tree scopes not available. There is no debug session going on.'
        );
      }

      // Process scopes to replace functionDefinition with id and name only, and remove abi properties
      let processedScopes = {};
      // Process functionDefinitionsByScope to replace functionDefinition with id and name only
      let processedFunctionDefinitionsByScope = {};
      try {
        if (result.scopes) {
          for (const [scopeId, scope] of Object.entries(result.scopes)) {
            const scopeData = scope
            const processedScope = { ...scopeData } as any

            // Replace functionDefinition with just id and name
            if (scopeData.functionDefinition) {
              processedScope.functionDefinition = {
                id: scopeData.functionDefinition.id,
                name: scopeData.functionDefinition.name
              };
            }

            // Process locals to remove abi properties
            if (scopeData.locals) {
              const processedLocals = {};
              for (const [varName, variable] of Object.entries(scopeData.locals)) {
                const variableData = variable as any;
                const processedVariable = { ...variableData };
                // Remove abi property if it exists
                delete processedVariable.abi;
                processedLocals[varName] = processedVariable;
              }
              processedScope.locals = processedLocals;
            }

            processedScopes[scopeId] = processedScope;
          }
        }

        if (result.functionDefinitionsByScope) {
          for (const [scopeId, funcDefWithInputs] of Object.entries(result.functionDefinitionsByScope)) {
            const funcDefData = funcDefWithInputs as any;
            processedFunctionDefinitionsByScope[scopeId] = {
              functionDefinition: {
                id: funcDefData.functionDefinition.id,
                name: funcDefData.functionDefinition.name
              },
              inputs: funcDefData.inputs
            };
          }
        }
      } catch (e) {
        console.warn('Error processing call tree scopes for output (using the full output): ', e);
        processedScopes = result.scopes;
        processedFunctionDefinitionsByScope = result.functionDefinitionsByScope;
      }

      return this.createJsonContent('debug://call-tree-scopes', {
        success: true,
        scopes: processedScopes,
        scopeStarts: result.scopeStarts,
        functionDefinitionsByScope: processedFunctionDefinitionsByScope,
        functionCallStack: result.functionCallStack,
        metadata: {
          description: this.callTreeScopesDesc,
          totalScopes: result.scopes ? Object.keys(result.scopes).length : 0,
          totalFunctionCalls: result.functionCallStack ? result.functionCallStack.length : 0,
          retrievedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      return this.createTextContent(
        'debug://call-tree-scopes',
        `Error getting call tree scopes: ${error.message}`
      );
    }
  }

  traceCacheDesc = `
  /**
   * Retrieves all trace cache data accumulated during transaction execution debugging.
   *
   * Returns an object with the following properties:
   *
   * 1. returnValues: Object mapping VM trace step indices to return values from RETURN operations
   *
   * 2. stopIndexes: Array of STOP operation occurrences [{index: number, address: string}]
   *
   * 3. outofgasIndexes: Array of out-of-gas occurrences [{index: number, address: string}]
   *
   * 4. callsTree: Root node of nested call tree representing execution flow
   *    - Structure: {call: {op, address, callStack, calls, start, return?, reverted?}}
   *    - Captures all CALL, DELEGATECALL, CREATE operations and their nesting
   *
   * 5. callsData: Object mapping VM trace indices to calldata at each point
   *
   * 6. contractCreation: Object mapping creation tokens to deployed contract bytecode (hex format)
   *
   * 7. addresses: Array of all contract addresses encountered during execution (chronological, may have duplicates)
   *
   * 8. callDataChanges: Array of VM trace indices where calldata changed
   *
   * 9. memoryChanges: Array of VM trace indices where EVM memory changed (MSTORE, MLOAD operations)
   *
   * 10. storageChanges: Array of VM trace indices where storage was modified (SSTORE operations)
   *
   * 11. sstore: Object mapping VM trace indices to SSTORE operation details
   *     - Each entry: {address, key, value, hashedKey, contextCall}
   *     - Tracks all storage modifications with context
   */
  `
  private async getTraceCache(plugin: Plugin): Promise<IMCPResourceContent> {
    try {
      const result = await plugin.call('debugger', 'getAllDebugCache');
      console.log('getTraceCache', result)
      if (!result) {
        return this.createTextContent(
          'debug://trace-cache',
          'Debug cache not available. There is no debug session going on.'
        );
      }

      return this.createJsonContent('debug://trace-cache', {
        success: true,
        cache: result,
        metadata: {
          description: this.traceCacheDesc,
          totalAddresses: result.addresses ? result.addresses.length : 0,
          totalStorageChanges: result.storageChanges ? result.storageChanges.length : 0,
          totalMemoryChanges: result.memoryChanges ? result.memoryChanges.length : 0,
          totalCallDataChanges: result.callDataChanges ? result.callDataChanges.length : 0,
          stopOperations: result.stopIndexes ? result.stopIndexes.length : 0,
          outOfGasEvents: result.outofgasIndexes ? result.outofgasIndexes.length : 0,
          retrievedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      return this.createTextContent(
        'debug://trace-cache',
        `Error getting trace cache: ${error.message}`
      );
    }
  }
}
