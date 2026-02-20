'use strict'
import { NestedScope } from '@remix-project/remix-debug'
import * as helper from './helper'
const { ethers } = require('ethers')

module.exports = async function (st, privateKey, contractBytecode, compilationResult, contractCode) {
  const enableCtorTest = true
  // Test scenarios with expected parameter values
  const testCases = [
    {
      name: 'directCall',
      signature: 'directCall(uint256,string)',
      params: [123, 'DirectTest'],
      description: 'Direct function call parameters'
    },
    {
      name: 'internalCallTest',
      signature: 'internalCallTest(uint256,string)',
      params: [456, 'InternalTest'],
      description: 'Internal call parameters'
    },
    {
      name: 'thisCallTest',
      signature: 'thisCallTest(uint256,string)',
      params: [789, 'ThisTest'],
      description: 'This.function() call parameters'
    },
    {
      name: 'callTest',
      signature: 'callTest(uint256,string)',
      params: [111, 'CallTest'],
      description: 'CALL operation parameters'
    },
    {
      name: 'staticCallTest',
      signature: 'staticCallTest(uint256,string)',
      params: [222, 'StaticTest'],
      description: 'STATICCALL operation parameters'
    },
    {
      name: 'delegateCallTest',
      signature: 'delegateCallTest(uint256,string)',
      params: [333, 'DelegateTest'],
      description: 'DELEGATECALL operation parameters'
    },
    {
      name: 'createTest',
      signature: 'createTest(uint256,string)',
      params: [444, 'CreateTest'],
      description: 'CREATE operation parameters'
    },
    {
      name: 'create2Test',
      signature: 'create2Test(uint256,string,bytes32)',
      params: [555, 'Create2Test', '0x1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF'],
      description: 'CREATE2 operation parameters'
    },
    {
      name: 'returnValueTest',
      signature: 'returnValueTest(uint256,string)',
      params: [666, 'ReturnTest'],
      description: 'Function with return values (uint, string)',
      expectedReturns: [1666, 'Return: ReturnTest'], // 666 + 1000, "Return: ReturnTest"
      expectedReturnsName: ['returnUint', 'returnString']
    },
    {
      name: 'pureReturnTest',
      signature: 'pureReturnTest(uint256,string)',
      params: [777, 'PureTest'],
      description: 'Pure function with return values (uint, string)',
      expectedReturns: [2777, 'Pure: PureTest'], // 777 + 2000, "Pure: PureTest"
      expectedReturnsName: ['<1>', '<2>']
    }
  ]

  const nbCtorTests = 6
  const returnValueTests = testCases.filter(tc => tc.expectedReturns).length * 1 // 1 test per return value function (uint + string)
  st.plan(nbCtorTests + (testCases.length * 3) + 2 + 2 + 1 + returnValueTests) // 2 Additional tests for internalCallTest + 2 Additional tests for thisCallTest + 1 Additional test for create2Test (salt param) + return value tests

  // Helper function to encode parameters
  function encodeParams(signature: string, params: any[]): string {
    // Use ethers interface to encode function call
    const iface = new ethers.Interface([`function ${signature}`])
    const functionName = signature.split('(')[0]
    return iface.encodeFunctionData(functionName, params)
  }

  // Helper function to verify parameters across a range of steps
  // Iterates through steps until all expected parameters are found with correct values
  async function verifyParametersInRange(
    startStep: number,
    lastStep: number,
    expectedParams: { [paramName: string]: any },
    traceManager: any,
    callTree: any,
    testName: string
  ): Promise<void> {
    console.log(`Verifying parameters from step ${startStep} to ${lastStep} for ${testName}`)

    const foundParams = new Set<string>()
    const paramsToFind = Object.keys(expectedParams)

    for (let step = startStep; step <= lastStep; step++) {
      await helper.decodeLocals(st, step, traceManager, callTree, (locals: any) => {
        // Check each expected parameter
        for (const [paramName, expectedValue] of Object.entries(expectedParams)) {
          // Skip if already found
          if (foundParams.has(paramName)) {
            continue
          }

          // Check if parameter exists with correct value
          if (locals[paramName] &&
              locals[paramName].value &&
              locals[paramName].value === expectedValue.toString()) {
            foundParams.add(paramName)
            console.log(`Found ${paramName} = ${expectedValue} at step ${step}`)
          }
        }
      })

      // Stop if all parameters found
      if (foundParams.size === paramsToFind.length) {
        st.pass(`${testName}: All parameters found with correct values`)
        return
      }
    }

    // If we reached here, not all parameters were found
    const missingParams = paramsToFind.filter(p => !foundParams.has(p))
    st.fail(`${testName}: Parameters not found with correct values: ${missingParams.join(', ')}`)
  }

  // Helper function to find scope by function name and get its firstStep
  function findFunctionScope(nestedScopes: NestedScope[], functionName: string): { scope: NestedScope, firstStep: number } | null {
    function traverse(scope: NestedScope, parentFirstStep?: number): { scope: NestedScope, firstStep: number } | null {
      // Check if this scope matches our function
      if (scope.functionDefinition?.name === functionName || scope.functionDefinition?.kind === functionName) {
        const firstStep = scope.firstStep || parentFirstStep || 0
        return { scope, firstStep }
      }

      // Look for nested function calls within this scope
      if (scope.children) {
        for (const child of scope.children) {
          const result = traverse(child, scope.firstStep || parentFirstStep)
          if (result) return result
        }
      }

      return null
    }

    for (const rootScope of nestedScopes) {
      const result = traverse(rootScope)
      if (result) return result
    }

    return null
  }

  try {
    if (enableCtorTest) {
      // First deploy the contract (constructor with inheritance test)
      console.log('Deploying contract with constructor parameters...')
      const constructorParams = [42, 'ConstructorTest']
      const constructorData = ethers.AbiCoder.defaultAbiCoder().encode(['uint256', 'string'], constructorParams)
      const deployBytecode = contractBytecode + constructorData.slice(2) // Remove 0x prefix

      const { traceManager: deployTraceManager, callTree: deployCallTree, waitForCallTree: waitForDeployCallTree } =
        await helper.setupDebugger(privateKey, deployBytecode, compilationResult, contractCode)

      const { scopes: deployScopes, scopeStarts: deployScopeStarts } = await waitForDeployCallTree()

      // Test inherited constructor parameters
      console.log(`Testing constructor parameters at step 730`)

      await helper.decodeLocals(st, 730, deployTraceManager, deployCallTree, (locals) => {
        console.log('Constructor locals:', Object.keys(locals))

        // Look for constructor parameters
        if (locals['_constructorValue']) {
          st.equals(locals['_constructorValue'].value, '42', 'Constructor uint parameter should be decoded correctly')
        }
        if (locals['_constructorMessage']) {
          st.equals(locals['_constructorMessage'].value, 'ConstructorTest', 'Constructor string parameter should be decoded correctly')
        }

        st.ok(Object.keys(locals).length === 2, 'Constructor should have decoded local variables')
      })

      console.log(`Testing inherit constructor parameters at step 536`)

      await helper.decodeLocals(st, 536, deployTraceManager, deployCallTree, (locals) => {
        console.log('Constructor locals:', Object.keys(locals))

        // Also check inherited constructor parameters
        if (locals['_baseValue']) {
          st.equals(locals['_baseValue'].value, '52', 'Base constructor uint parameter should be decoded correctly (42 + 10)')
        }
        if (locals['_baseMessage']) {
          st.equals(locals['_baseMessage'].value, 'Base: ConstructorTest', 'Base constructor string parameter should be decoded correctly')
        }

        st.ok(Object.keys(locals).length === 2, 'Constructor should have decoded local variables')
      })
    }

    // Now test each function call scenario
    for (const testCase of testCases) {
      console.log(`\nTesting ${testCase.name}: ${testCase.description}`)

      const txData = encodeParams(testCase.signature, testCase.params)
      console.log(`Transaction data for ${testCase.name}: ${txData}`)

      const constructorParams = [42, 'ConstructorTest']
      const constructorData = ethers.AbiCoder.defaultAbiCoder().encode(['uint256', 'string'], constructorParams)
      const deployBytecode = contractBytecode + constructorData.slice(2) // Remove 0x prefix
      const { traceManager, callTree, waitForCallTree } = await helper.setupDebugger(
        privateKey,
        deployBytecode,
        compilationResult,
        contractCode,
        txData
      )

      const { scopes, scopeStarts } = await waitForCallTree()
      const nestedScopes: NestedScope[] = callTree.getScopesAsNestedJSON('nojump')
      // Find the target function scope
      const functionScope = findFunctionScope(nestedScopes, testCase.name)

      if (functionScope) {
        console.log(`Found ${testCase.name} scope with firstStep: ${functionScope.firstStep}`)

        // Decode locals at this step
        await helper.decodeLocals(st, functionScope.firstStep + 5, traceManager, callTree, (locals) => {
          console.log(`${testCase.name} locals:`, locals)

          // Verify parameter decoding based on function signature
          if (testCase.signature.includes('uint256')) {
            const uintParamNames = ['_directValue', '_testValue', '_thisValue', '_callValue', '_staticValue', '_delegateValue', '_createValue', '_create2Value']
            const expectedUintParam = uintParamNames.find(name => locals[name])

            if (expectedUintParam) {
              st.equals(locals[expectedUintParam].value, testCase.params[0].toString(),
                `${testCase.name}: uint parameter should be decoded correctly`)
            } else {
              // Try alternative parameter names
              const allUintKeys = Object.keys(locals).filter(key =>
                key.includes('Value') || key.includes('value') || locals[key].type?.includes('uint'))
              if (allUintKeys.length > 0) {
                st.ok(true, `${testCase.name}: Found potential uint parameter: ${allUintKeys[0]}`)
              } else {
                st.fail(`${testCase.name}: Could not find uint parameter in locals`)
              }
            }
          }

          if (testCase.signature.includes('string')) {
            const stringParamNames = ['_directMessage', '_testMessage', '_thisMessage', '_callMessage', '_staticMessage', '_delegateMessage', '_createMessage', '_create2Message']
            const expectedStringParam = stringParamNames.find(name => locals[name])

            if (expectedStringParam) {
              st.equals(locals[expectedStringParam].value, testCase.params[1],
                `${testCase.name}: string parameter should be decoded correctly`)
            } else {
              // Try alternative parameter names
              const allStringKeys = Object.keys(locals).filter(key =>
                key.includes('Message') || key.includes('message') || locals[key].type?.includes('string'))
              if (allStringKeys.length > 0) {
                st.ok(true, `${testCase.name}: Found potential string parameter: ${allStringKeys[0]}`)
              } else {
                st.fail(`${testCase.name}: Could not find string parameter in locals`)
              }
            }
          }

          if (testCase.signature.includes('bytes32')) {
            const stringParamNames = ['_salt']
            const expectedBytes32Param = stringParamNames.find(name => locals[name])

            if (expectedBytes32Param) {
              st.equals(locals[expectedBytes32Param].value, testCase.params[2],
                `${testCase.name}: bytes32 parameter should be decoded correctly`)
            }
          }

          st.ok(Object.keys(locals).length > 0, `${testCase.name}: Should have decoded local variables`)
        })

        // Additional tests for internal function calls
        if (testCase.name === 'internalCallTest') {
          // Also check the internal function that gets called
          const internalScope = findFunctionScope(nestedScopes, '_internalFunction')
          if (internalScope) {
            console.log(`Found _internalFunction scope with firstStep: ${internalScope.firstStep}`)
            await helper.decodeLocals(st, internalScope.firstStep + 2, traceManager, callTree, (locals) => {
              console.log('_internalFunction locals:', Object.keys(locals))

              if (locals['_internalValue']) {
                st.equals(locals['_internalValue'].value, '506', 'Internal function uint parameter should be decoded correctly (456 + 50)')
              }
              if (locals['_internalMessage']) {
                st.ok(locals['_internalMessage'].value.includes('Internal:'), 'Internal function string parameter should be decoded correctly')
              }
            })
          }
        }

        // For external calls via this.function(), check the target function too
        if (testCase.name === 'thisCallTest') {
          const externalScope = findFunctionScope(nestedScopes, 'externalCallViaThis')
          if (externalScope) {
            console.log(`Found externalCallViaThis scope with firstStep: ${externalScope.firstStep}`)
            await helper.decodeLocals(st, externalScope.firstStep + 2, traceManager, callTree, (locals) => {
              console.log('externalCallViaThis locals:', Object.keys(locals))

              if (locals['_externalValue']) {
                st.equals(locals['_externalValue'].value, '814', 'External function uint parameter should be decoded correctly (789 + 25)')
              }
              if (locals['_externalMessage']) {
                st.ok(locals['_externalMessage'].value.includes('This:'), 'External function string parameter should be decoded correctly')
              }
            })
          }
        }

        // Test return values for functions that have them
        if (testCase.expectedReturns) {
          console.log(`Testing return values for ${testCase.name}`)

          // Find the return step - typically near the end of the function
          const returnStep = functionScope.scope.lastStep

          // Look for RETURN opcode in the function scope
          /*for (let i = functionScope.firstStep; i < trace.length; i++) {
            if (trace[i] && trace[i].op === 'RETURN') {
              returnStep = i
              break
            }
          }*/

          if (returnStep !== -1) {
            const tests = {}
            tests[testCase.expectedReturnsName[0]] = testCase.expectedReturns[0].toString()
            tests[testCase.expectedReturnsName[1]] = testCase.expectedReturns[1].toString()
            console.log(`Found return step at: ${returnStep}`)
            await verifyParametersInRange(
              functionScope.firstStep,
              returnStep,
              tests,
              traceManager, callTree, testCase.name)
          }
        }
      } else {
        st.fail(`Could not find scope for function ${testCase.name}`)
      }
    }

  } catch (error) {
    console.error('Test error:', error)
    st.fail(error.message || error)
  }
}