import React, { useState, useEffect } from 'react'
import ScopePanel from './scope-panel'

/**
 * Example usage of the ScopePanel component.
 * This shows how to integrate the scope panel with a debugger that has access to InternalCallTree.
 */
export const ScopePanelExample = ({ vmDebugger: { registerEvent }, stepManager }) => {
  const [scopeData, setScopeData] = useState([])

  useEffect(() => {
    // Register for scope tree updates
    registerEvent &&
      registerEvent('callTreeReady', (scopes, scopeStarts, trace) => {
        // Assuming you have access to the InternalCallTree instance
        // You would call getScopesAsNestedJSON() on it
        // For this example, we'll simulate the call

        // In real usage, you would do something like:
        // const nestedScopes = internalCallTree.getScopesAsNestedJSON()
        // setScopeData(nestedScopes)

        // Mock data for demonstration
        const mockNestedScopes = [
          {
            scopeId: '1',
            firstStep: 0,
            lastStep: 100,
            locals: {
              'param1': { name: 'param1', type: 'uint256' },
              'param2': { name: 'param2', type: 'address' }
            },
            isCreation: true,
            gasCost: 21000,
            startExecutionLine: 1,
            endExecutionLine: 10,
            functionDefinition: {
              name: 'constructor',
              kind: 'constructor'
            },
            address: '0x1234567890123456789012345678901234567890',
            children: [
              {
                scopeId: '1.1',
                firstStep: 10,
                lastStep: 50,
                locals: {
                  'localVar': { name: 'localVar', type: 'bool' }
                },
                isCreation: false,
                gasCost: 5000,
                startExecutionLine: 3,
                endExecutionLine: 8,
                functionDefinition: {
                  name: 'initialize',
                  kind: 'function'
                },
                address: '0x1234567890123456789012345678901234567890',
                children: []
              },
              {
                scopeId: '1.2',
                firstStep: 60,
                lastStep: 90,
                locals: {},
                isCreation: false,
                gasCost: 3000,
                reverted: {
                  step: { op: 'REVERT', gas: 1000 },
                  line: 15
                },
                functionDefinition: {
                  name: 'failingFunction',
                  kind: 'function'
                },
                address: '0x1234567890123456789012345678901234567890',
                children: []
              }
            ]
          }
        ]

        setScopeData(mockNestedScopes)
      })

    registerEvent &&
      registerEvent('traceUnloaded', () => {
        setScopeData([])
      })
  }, [])

  return (
    <div className="d-flex flex-column">
      <ScopePanel
        className="pb-1"
        data={scopeData}
        stepManager={stepManager}
      />
    </div>
  )
}

/**
 * Integration example showing how to add ScopePanel to the existing vm-debugger-head
 */
export const IntegratedVmDebuggerHead = ({ vmDebugger: { registerEvent, triggerEvent }, debugging, stepManager, onShowOpcodesChange }) => {
  const [scopeData, setScopeData] = useState([])

  useEffect(() => {
    registerEvent &&
      registerEvent('callTreeReady', (scopes, scopeStarts, trace, internalCallTree) => {
        // Get nested scopes from the InternalCallTree
        if (internalCallTree && typeof internalCallTree.getScopesAsNestedJSON === 'function') {
          const nestedScopes = internalCallTree.getScopesAsNestedJSON()
          setScopeData(nestedScopes)
        }
      })

    registerEvent &&
      registerEvent('traceUnloaded', () => {
        setScopeData([])
      })
  }, [debugging])

  return (
    <div id="vmheadView" className="mt-1 px-2 d-flex">
      <div className="d-flex flex-column pe-2" style={{ flex: 1 }}>
        {/* Add the ScopePanel alongside existing panels */}
        <ScopePanel className="pb-1" data={scopeData} stepManager={stepManager} />
        {/* Other existing panels would go here... */}
      </div>
    </div>
  )
}

export default ScopePanelExample