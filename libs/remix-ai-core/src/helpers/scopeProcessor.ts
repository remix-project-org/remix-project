/**
 * Scope Processing Helper - Provides utilities for processing debugging scope data
 */

import { NestedScope, traceHelper, StepDetail } from '@remix-project/remix-debug';

export interface ProcessedScope {
  scopeId: string;
  functionName?: string;
  variableCount: number;
  variableNames: string[];
  stepRange: { first: number; last: number };
  gasCost?: number;
  isCreation?: boolean;
  isExternalCall?: boolean;
  reverted?: {
    step: StepDetail
    line?: number
  }
  opcode?: string;
  children: ProcessedScope[] | string | null;
  childCount: number;
  totalDescendants: number;
  message?: string;
}

/**
 * Process a scope with depth limiting to prevent context overflow
 * @param scope - The nested scope to process
 * @param depth - Current depth (default: 0)
 * @param maxDepth - Maximum depth to process (default: 3)
 * @returns Processed scope with depth-limited children
 */
export function processScope(
  scope: NestedScope,
  depth: number = 0,
  maxDepth: number = 3
): ProcessedScope {
  const processed: ProcessedScope = {
    scopeId: scope.scopeId,
    functionName: scope.functionDefinition ? scope.functionDefinition.name : undefined,
    variableCount: scope.locals ? Object.keys(scope.locals).length : 0,
    variableNames: scope.locals ? Object.keys(scope.locals) : [],
    stepRange: { first: scope.firstStep, last: scope.lastStep },
    gasCost: scope.gasCost,
    isCreation: scope.isCreation,
    isExternalCall: scope.isCreation || traceHelper.isCallInstruction(scope.opcodeInfo),
    reverted: scope.reverted,
    opcode: scope.opcodeInfo?.op,
    children: null,
    childCount: 0,
    totalDescendants: 0
  };

  // Process children with depth limit
  if (scope.children && scope.children.length > 0) {
    processed.childCount = scope.children.length;

    if (depth < maxDepth) {
      // Recursively process children if under depth limit
      processed.children = scope.children.map(child => processScope(child, depth + 1, maxDepth));
      processed.totalDescendants = scope.children.reduce((total, child) => {
        const childProcessed = processScope(child, depth + 1, maxDepth);
        return total + 1 + (childProcessed.totalDescendants || 0);
      }, 0);
    } else {
      // At depth limit, provide guidance to use get_scopes_with_root tool
      processed.children = null;
      processed.message = `descending the tree can be done using the tool get_scopes_with_root. scope ids: (${scope.children.map(el => el.scopeId).join(' , ')})`;
      processed.totalDescendants = scope.children.length; // Just count direct children
    }
  }

  return processed;
}

/**
 * Process an array of scopes with depth limiting
 * @param scopes - Array of nested scopes to process
 * @param maxDepth - Maximum depth to process (default: 3)
 * @returns Array of processed scopes
 */
export function processScopes(
  scopes: NestedScope[],
  maxDepth: number = 3
): ProcessedScope[] {
  return scopes.map(scope => processScope(scope, 0, maxDepth));
}

/**
 * Count all scopes including nested ones
 * @param scopes - Array of processed scopes
 * @returns Total count of all scopes
 */
export function countAllScopes(scopes: ProcessedScope[]): number {
  return scopes.reduce((total, scope) => {
    const childCount = Array.isArray(scope.children) ? countAllScopes(scope.children) : 0;
    return total + 1 + childCount;
  }, 0);
}

/**
 * Count all variables across all scopes
 * @param scopes - Array of processed scopes
 * @returns Total count of all variables
 */
export function countAllVariables(scopes: ProcessedScope[]): number {
  return scopes.reduce((total, scope) => {
    const scopeVars = scope.variableCount || 0;
    const childVars = Array.isArray(scope.children) ? countAllVariables(scope.children) : 0;
    return total + scopeVars + childVars;
  }, 0);
}

/**
 * Get function summary across all scopes
 * @param scopes - Array of processed scopes
 * @returns Array of function summaries
 */
export function getFunctionSummary(scopes: ProcessedScope[]): Array<{
  name?: string;
  scopeId: string;
  variableCount: number;
  variableNames: string[];
  childCount: number;
  stepRange: { first: number; last: number };
}> {
  const functions: Array<{
    name?: string;
    scopeId: string;
    variableCount: number;
    variableNames: string[];
    childCount: number;
    stepRange: { first: number; last: number };
  }> = [];

  const collectFunctions = (scopeList: ProcessedScope[]) => {
    for (const scope of scopeList) {
      if (scope.functionName) {
        functions.push({
          name: scope.functionName,
          scopeId: scope.scopeId,
          variableCount: scope.variableCount,
          variableNames: scope.variableNames,
          childCount: scope.childCount,
          stepRange: scope.stepRange
        });
      }
      if (Array.isArray(scope.children)) {
        collectFunctions(scope.children);
      }
    }
  };

  collectFunctions(scopes);
  return functions;
}