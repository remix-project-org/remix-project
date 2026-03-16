import React, { useState, useEffect } from 'react' // eslint-disable-line
import { CustomTooltip } from '@remix-ui/helper'
import './DebuggerCallStack.css'

interface DebuggerCallStackProps {
  plugin: any
}

export const DebuggerCallStack = ({ plugin }: DebuggerCallStackProps) => {
  const [selectedScope, setSelectedScope] = useState<any>(null)
  const [deployments, setDeployments] = useState<any[]>([])
  const [expandedScopes, setExpandedScopes] = useState<Set<string>>(new Set())
  const [hoveredScope, setHoveredScope] = useState<string | null>(null)

  useEffect(() => {
    // Listen for scope selection from debugger UI
    const handleScopeSelected = (scope: any, deps: any[]) => {
      setSelectedScope(scope)
      setDeployments(deps || [])
      // Auto-expand the selected scope
      if (scope?.scopeId) {
        setExpandedScopes(new Set([scope.scopeId]))
      }
    }

    plugin.on('debugger', 'scopeSelected', handleScopeSelected)
    plugin.on('debugger', 'startDebugging', () => {
      setSelectedScope(null)
    })
    return () => {
      plugin.off('debugger', 'scopeSelected')
      plugin.off('debugger', 'startDebugging')
    }
  }, [plugin])

  const toggleScope = (scopeId: string) => {
    setExpandedScopes(prev => {
      const newSet = new Set(prev)
      if (newSet.has(scopeId)) {
        newSet.delete(scopeId)
      } else {
        newSet.add(scopeId)
      }
      return newSet
    })
  }

  const getContractName = (address: string, scope?: any): string => {
    // PRIORITY 1: Check functionDefinition.contractName first (most accurate for internal calls)
    if (scope?.functionDefinition?.contractName) {
      return scope.functionDefinition.contractName
    }

    if (!deployments || deployments.length === 0) {
      return ''
    }

    // Check if address is a placeholder for contract creation
    const isCreationPlaceholder = address && (address.includes('Contract Creation') || address.startsWith('(Contract Creation'))

    if (isCreationPlaceholder && scope?.isCreation) {
      // For any contract creation scope with placeholder address, return the deployment name
      // This assumes we're debugging a transaction that's in the deployments list
      if (deployments.length > 0 && deployments[0].name !== 'Unknown') {
        return deployments[0].name
      }
    }

    if (!address || isCreationPlaceholder) {
      return ''
    }

    // PRIORITY 2: Lookup by address in deployments
    // Normalize address for comparison (remove 0x prefix, lowercase)
    const normalizeAddr = (addr: string) => {
      return addr.toLowerCase().replace(/^0x/, '')
    }

    const normalizedAddress = normalizeAddr(address)

    // Find contract by address
    const contract = deployments.find((d: any) => {
      if (!d.address) return false
      return normalizeAddr(d.address) === normalizedAddress
    })

    // If we have a contract from deployments, return its name (but not if it's 'Unknown')
    if (contract?.name && contract.name !== 'Unknown') {
      return contract.name
    }

    return ''
  }

  const handleExecutionItemClick = async (scope: any) => {
    try {
      // Jump to the step in the debugger
      await plugin.call('debugger', 'jumpTo', scope.firstStep)
    } catch (error) {
      console.error('Error jumping to step:', error)
    }
  }

  const handleJumpTo = async (step: number) => {
    try {
      await plugin.call('debugger', 'jumpTo', step)
    } catch (error) {
      console.error('Error jumping to step:', error)
    }
  }

  const handleJumpOut = async () => {
    try {
      await plugin.call('debugger', 'jumpOut', true)
    } catch (error) {
      console.error('Error jumping out:', error)
    }
  }

  const renderExecutionItem = (scope: any, depth: number = 0): JSX.Element => {
    const opcode = scope.opcodeInfo?.op || ''
    // Only show 'fallback' if it's actually a fallback function (kind === 'fallback')
    // For scopes without function definitions, show appropriate label
    let itemName = scope.functionDefinition?.name ||
                   (scope.functionDefinition?.kind === 'fallback' ? 'fallback' : scope.functionDefinition?.kind) ||
                   (scope.isCreation ? 'constructor' : null)

    // For external calls without function definition, show 'call'
    // For internal calls without function definition, show 'internal'
    if (!itemName) {
      if (opcode === 'CALL' || opcode === 'DELEGATECALL' || opcode === 'STATICCALL') {
        itemName = 'call'
      } else {
        itemName = 'internal'
      }
    }

    // Determine call type
    let callTypeLabel = 'INTERNAL'
    let callTypeClass = 'internal'

    if (opcode === 'DELEGATECALL') {
      callTypeLabel = 'DELEGATECALL'
      callTypeClass = 'delegatecall'
    } else if (opcode === 'STATICCALL') {
      callTypeLabel = 'STATICCALL'
      callTypeClass = 'staticcall'
    } else if (opcode === 'CALL') {
      callTypeLabel = 'CALL'
      callTypeClass = 'call'
    } else if (opcode === 'CREATE' || opcode === 'CREATE2' || scope.isCreation) {
      callTypeLabel = 'CREATE'
      callTypeClass = 'create'
    }

    // Get contract name and address
    const contractName = getContractName(scope.address, scope)

    // Check if address is a placeholder for contract creation
    const isCreationPlaceholder = scope.address && (scope.address.includes('Contract Creation') || scope.address.startsWith('(Contract Creation'))

    // Only create shortened address if it's a real address, not a placeholder
    const contractAddress = scope.address && !isCreationPlaceholder
      ? `${scope.address.substring(0, 6)}...${scope.address.substring(scope.address.length - 4)}`
      : ''

    // For CREATE operations, simplify display to just show contract name
    const isCreate = callTypeLabel === 'CREATE'

    const hasChildren = scope.children && scope.children.length > 0
    const isExpanded = expandedScopes.has(scope.scopeId)

    const isHovered = hoveredScope === scope.scopeId

    return (
      <div key={scope.scopeId}>
        <div
          className="call-stack-item"
          onClick={() => handleExecutionItemClick(scope)}
          onMouseEnter={() => setHoveredScope(scope.scopeId)}
          onMouseLeave={() => setHoveredScope(null)}
        >
          <div className="call-stack-line">
            <span className="call-stack-step">{scope.firstStep}</span>
            <div style={{
              paddingLeft: `${0.5 + depth * 20}px`,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              flex: 1,
              borderLeft: depth > 0 ? '2px solid var(--bs-border-color)' : 'none',
              marginLeft: depth > 0 ? '0.5rem' : '0'
            }}>
              {hasChildren && (
                <i
                  className={`fas ${isExpanded ? 'fa-minus-square' : 'fa-plus-square'} call-stack-expand-icon`}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleScope(scope.scopeId)
                  }}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                />
              )}
              {!hasChildren && <span style={{ width: '14px' }}></span>}
              <span className={`call-stack-type ${callTypeClass}`}>
                {callTypeLabel}
              </span>
              <span className="call-stack-function">
                {isCreate ? (
                  // For CREATE operations, show contract name or address
                  contractName ? (
                    <>
                      <span className="contract-name">{contractName}</span>
                      {contractAddress && <span className="text-muted"> ({contractAddress})</span>}
                    </>
                  ) : contractAddress ? (
                    <span className="contract-name">({contractAddress})</span>
                  ) : (
                    <span className="method-name">Contract Creation</span>
                  )
                ) : (
                  // For other operations, show contract.method format
                  <>
                    {/* Show contract name and/or address */}
                    {contractName ? (
                      <>
                        <span className="contract-name">{contractName}</span>
                        {contractAddress && <span className="text-muted"> ({contractAddress})</span>}
                      </>
                    ) : contractAddress ? (
                      <span className="contract-name">({contractAddress})</span>
                    ) : null}

                    {/* Show separator and method name if we have method info */}
                    {itemName && (
                      <>
                        {(contractName || contractAddress) && <span>.</span>}
                        <span className="method-name">{itemName}</span>
                      </>
                    )}

                    {/* Fallback: if no contract and no method, show unknown */}
                    {!contractName && !contractAddress && !itemName && (
                      <span className="method-name text-muted">unknown</span>
                    )}
                  </>
                )}
              </span>
              {/* Jump buttons */}
              {(scope.firstStep !== undefined || scope.lastStep !== undefined) && (
                <div className="call-stack-actions" style={{ opacity: isHovered ? 1 : 0 }}>
                  {scope.firstStep !== undefined && (
                    <CustomTooltip tooltipText="Jump Into" tooltipId={`jump-into-exec-${scope.scopeId}`} placement="top">
                      <button
                        className="jump-debug-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          const stepToJump = scope.functionEntryStep !== undefined ? scope.functionEntryStep : scope.firstStep
                          handleJumpTo(stepToJump)
                        }}
                      >
                        <i className="fas fa-sign-in-alt"></i>
                      </button>
                    </CustomTooltip>
                  )}
                  {scope.lastStep !== undefined && (
                    <>
                      <CustomTooltip tooltipText="Jump End" tooltipId={`jump-end-exec-${scope.scopeId}`} placement="top">
                        <button
                          className="jump-debug-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleJumpTo(scope.lastStep)
                          }}
                        >
                          <i className="fas fa-step-forward"></i>
                        </button>
                      </CustomTooltip>
                      <CustomTooltip tooltipText="Jump Over" tooltipId={`jump-over-exec-${scope.scopeId}`} placement="top">
                        <button
                          className="jump-debug-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleJumpTo(scope.lastStep + 1)
                          }}
                        >
                          <i className="fas fa-level-down-alt"></i>
                        </button>
                      </CustomTooltip>
                    </>
                  )}
                  {isHovered && scope.lastStep !== undefined && (
                    <CustomTooltip tooltipText="Jump Out" tooltipId={`jump-out-exec-${scope.scopeId}`} placement="top">
                      <button
                        className="jump-debug-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleJumpOut()
                        }}
                      >
                        <i className="fas fa-sign-out-alt"></i>
                      </button>
                    </CustomTooltip>
                  )}
                </div>
              )}
              {/* <span className="call-stack-gas"><i className="fas fa-gas-pump"></i> {scope.gasCost}</span> */}
            </div>
          </div>
        </div>
        {hasChildren && isExpanded && (
          <>
            {scope.children.map((child: any) => renderExecutionItem(child, depth + 1))}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="debugger-call-stack p-3 pt-0">
      {!selectedScope ? (<div className="text-muted">Select a call from Call Trace to view execution details</div>) :
        (<div className="call-stack-list">
          {renderExecutionItem(selectedScope, 0)}
        </div>)}
    </div>
  )
}

export default DebuggerCallStack
