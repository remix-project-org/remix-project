'use strict'
import { NestedScope } from '@remix-project/remix-debug'
import * as helper from './helper'

module.exports = async function (st, privateKey, contractBytecode, compilationResult, contractCode) {
  // Traverse the call tree to verify call types
  let callCount = 0
  let staticCallCount = 0
  let delegateCallCount = 0
  let contractBFunctionTotalCount = 0
  let contractCFunctionTotalCount = 0
  function traverseScopes(scope: NestedScope, parent?: NestedScope) {
    if (scope.functionDefinition && scope.functionDefinition.name && scope.functionDefinition.name.includes('contractBFunction')) contractBFunctionTotalCount++
    if (scope.functionDefinition && scope.functionDefinition.name && scope.functionDefinition.name.includes('contractCFunction')) contractCFunctionTotalCount++

    if (parent && parent.opcodeInfo.op === 'CALL' && scope.functionDefinition && scope.functionDefinition.name && scope.functionDefinition.name.includes('contractBFunction')) {
      callCount++
    } else if (parent && parent.opcodeInfo.op === 'STATICCALL' && scope.functionDefinition && scope.functionDefinition.name && scope.functionDefinition.name.includes('contractCFunction')) {
      staticCallCount++
    } else if (parent && parent.opcodeInfo.op === 'DELEGATECALL' && scope.functionDefinition && scope.functionDefinition.name && scope.functionDefinition.name.includes('contractBFunction')) {
      delegateCallCount++
    }

    if (scope.children) {
      scope.children.forEach(child => traverseScopes(child, scope))
    }
  }
  try {
    // Deploy the contract first (constructor deployment)
    const { traceManager: deployTraceManager, callTree: deployCallTree, waitForCallTree: waitForDeployCallTree } = await helper.setupDebugger(privateKey, contractBytecode, compilationResult, contractCode)

    await waitForDeployCallTree()

    // Now call the callContracts function
    const callContractsFunctionSig = '0x00dbe2a5' // callContracts()
    const { traceManager, callTree, waitForCallTree } = await helper.setupDebugger(
      privateKey,
      contractBytecode,
      compilationResult,
      contractCode,
      callContractsFunctionSig
    )

    const { scopes, scopeStarts } = await waitForCallTree()

    // Get the nested JSON representation of scopes
    const nestedScopes: NestedScope[] = callTree.getScopesAsNestedJSON('nojump')

    traverseScopes(nestedScopes[0])

    // Verify we found the expected call types
    st.equals(callCount, 1, 'Should find exactly one CALL to contractBFunction')
    st.equals(staticCallCount, 1, 'Should find exactly one STATICCALL to contractCFunction')
    st.equals(delegateCallCount, 2, 'Should find exactly two DELEGATECALL to contractBFunction')
    st.equals(contractBFunctionTotalCount, 3, 'Should find exactly two call to contractBFunction')
    st.equals(contractCFunctionTotalCount, 1, 'Should find exactly one call to contractCFunction')

  } catch (error) {
    st.fail(error.message || error)
  }
}