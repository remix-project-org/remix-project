/**
 * Debugging Resource Provider - Provides access to debugging session data and trace information
 */

import { Plugin } from '@remixproject/engine';
import { IMCPResource, IMCPResourceContent } from '../../types/mcp';
import { BaseResourceProvider } from '../registry/RemixResourceProviderRegistry';
import { ResourceCategory } from '../types/mcpResources';
import { NestedScope } from '@remix-project/remix-debug';
import { processScopes, countAllScopes, countAllVariables, getFunctionSummary } from '../../helpers/scopeProcessor';

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
      // Add scopes with summary filter (summarized)
      resources.push(
        this.createResource(
          'debug://scopes-summary',
          'Scopes (summary)',
          'Summarized scope information filtered to exclude jump instructions, providing essential function calls and variables without overwhelming detail',
          'application/json',
          {
            category: ResourceCategory.DEBUG_SESSIONS,
            tags: ['debugging', 'scopes', 'summary', 'functions', 'variables'],
            priority: 9
          }
        )
      );

      // Add global context resource
      resources.push(
        this.createResource(
          'debug://global-context',
          'Global Context',
          'Global execution context (block, msg, tx) for the transaction being debugged',
          'application/json',
          {
            category: ResourceCategory.DEBUG_SESSIONS,
            tags: ['debugging', 'context', 'block', 'msg', 'tx'],
            priority: 7
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
    if (uri === 'debug://scopes-summary') {
      return this.getScopessummary(plugin);
    }

    if (uri === 'debug://global-context') {
      return this.getGlobalContext(plugin);
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
      const stack = await plugin.call('debugger', 'getStackAt', result.step)
      if (!result) {
        return this.createTextContent(
          'debug://current-debugging-step',
          'current source location is not available. There is no debug session going on.'
        );
      }
      console.log('current-debugging-step', result)
      return this.createJsonContent('debug://current-debugging-step', {
        success: true,
        description: 'Current source code highlighted in the editor in the debug session and the corresponding stack.',
        result,
        stack
      });

    } catch (error) {
      return this.createTextContent(
        'debug://current-debugging-step',
        `Error getting current source location: ${error.message}`
      );
    }
  }

  private async getScopessummary(plugin: Plugin): Promise<IMCPResourceContent> {
    try {
      const result: NestedScope[] = await plugin.call('debugger', 'getScopesAsNestedJSON', 'nojump');
      if (!result || !Array.isArray(result)) {
        return this.createTextContent(
          'debug://scopes-summary',
          'Scope information not available. There is no debug session going on.'
        );
      }

      // Process all top-level scopes with depth limit using shared helper
      const processedScopes = processScopes(result, 3);

      // Create comprehensive summary with statistics
      const summary = {
        totalTopLevelScopes: result.length,
        totalAllScopes: countAllScopes(processedScopes),
        totalVariables: countAllVariables(processedScopes),
        functionScopes: getFunctionSummary(processedScopes),
        scopeHierarchy: processedScopes,
        depthLimit: {
          maxDepth: 3,
          note: "For deeper exploration beyond depth 3, use the get_scopes_with_root tool with specific scope IDs"
        }
      };

      return this.createJsonContent('debug://scopes-summary', {
        success: true,
        summary,
        metadata: {
          description: 'Comprehensive summarized scope information with recursive children processing (depth limited to 3), filtered to exclude jump instructions',
          retrievedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      return this.createTextContent(
        'debug://scopes-summary',
        `Error getting scopes (summary): ${error.message}`
      );
    }
  }

  private async getGlobalContext(plugin: Plugin): Promise<IMCPResourceContent> {
    try {
      const result = await plugin.call('debugger', 'globalContext');

      if (!result || (!result.block && !result.msg && !result.tx)) {
        return this.createTextContent(
          'debug://global-context',
          'Global context is not available. Please start a debug session first.'
        );
      }

      console.log('debug://global-context', {
        success: true,
        context: result,
        metadata: {
          description: 'Global execution context including block, message, and transaction data',
          retrievedAt: new Date().toISOString()
        }
      });

      return this.createJsonContent('debug://global-context', {
        success: true,
        context: result,
        metadata: {
          description: 'Global execution context including block, message, and transaction data',
          retrievedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      return this.createTextContent(
        'debug://global-context',
        `Error getting global context: ${error.message}`
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
      if (!result) {
        return this.createTextContent(
          'debug://trace-cache',
          'Debug cache not available. There is no debug session going on.'
        );
      }
      console.log('debug://trace-cache', {
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
      })
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
