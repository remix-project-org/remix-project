import React, { useState } from 'react' // eslint-disable-line
import { FormattedMessage } from 'react-intl'
import SearchBar from '../search-bar/search-bar' // eslint-disable-line
import { CustomTooltip } from '@remix-ui/helper'
import './debug-layout.css'

interface DebugLayoutProps {
  onSearch: (txHash: string) => void
  debugging: boolean
  currentTxHash?: string
  onStopDebugging: () => void
  currentBlock: any
  currentReceipt: any
  currentTransaction: any
  traceData?: any
  currentFunction?: string
  functionStack?: any[]
  nestedScopes?: any[]
  deployments?: any[]
  onScopeSelected?: (scope: any) => void
  solidityLocals?: any
  solidityState?: any
  stepManager?: any
  callTree?: any
  debugWithGeneratedSources?: boolean
  onDebugWithGeneratedSourcesChange?: (checked: boolean) => void
  onShowOpcodesChange?: (checked: boolean) => void
  showOpcodes?: boolean
  registerEvent?: any
}

export const DebugLayout = ({
  onSearch,
  debugging,
  currentTxHash,
  onStopDebugging,
  currentBlock,
  currentReceipt,
  currentTransaction,
  traceData,
  currentFunction,
  functionStack,
  nestedScopes,
  deployments,
  onScopeSelected,
  solidityLocals,
  solidityState,
  stepManager,
  callTree,
  debugWithGeneratedSources,
  onDebugWithGeneratedSourcesChange,
  onShowOpcodesChange,
  showOpcodes = false,
  registerEvent
}: DebugLayoutProps) => {
  const [activeObjectTab, setActiveObjectTab] = useState<'stateLocals' | 'stackMemory'>('stateLocals')
  const [copyTooltips, setCopyTooltips] = useState<{ [key: string]: string }>({
    from: 'Copy address',
    to: 'Copy address'
  })
  const [expandedScopes, setExpandedScopes] = useState<Set<string>>(new Set())
  const [selectedScope, setSelectedScope] = useState<any>(null)
  const [expandedObjectPaths, setExpandedObjectPaths] = useState<Set<string>>(new Set())
  const [expandedSections, setExpandedSections] = useState({
    transactionDetails: true,
    callTrace: true,
    parametersReturnValues: true
  })
  const [stackData, setStackData] = useState<any>(null)
  const [memoryData, setMemoryData] = useState<any>(null)
  const [callStackData, setCallStackData] = useState<any>(null)
  const [opcodeData, setOpcodeData] = useState<any>(null)
  const opcodeRefs = React.useRef<{ [key: number]: HTMLDivElement | null }>({})
  const opcodeContainerRef = React.useRef<HTMLDivElement | null>(null)

  const handleShowOpcodesChange = (checked: boolean) => {
    if (onShowOpcodesChange) {
      onShowOpcodesChange(checked)
    }
  }

  // Auto-expand sender node when nestedScopes are loaded
  React.useEffect(() => {
    if (nestedScopes && nestedScopes.length > 0 && nestedScopes[0].isSenderNode) {
      setExpandedScopes(new Set(['sender']))
    }
  }, [nestedScopes])

  // Register event listeners for stack, memory, call stack, and opcodes
  React.useEffect(() => {
    if (registerEvent) {
      registerEvent('traceManagerStackUpdate', (stack: any) => {
        setStackData(stack)
      })

      registerEvent('traceManagerMemoryUpdate', (memory: any) => {
        setMemoryData(memory)
      })

      registerEvent('traceManagerCallStackUpdate', (callStack: any) => {
        setCallStackData(callStack)
      })

      registerEvent('codeManagerChanged', (code: any, address: any, index: any, nextIndexes: any) => {
        setOpcodeData({
          code: code,
          address: address,
          index: index,
          nextIndexes: nextIndexes || []
        })
      })
    }
  }, [registerEvent])

  // Scroll to current opcode when it changes
  React.useEffect(() => {
    if (opcodeData && opcodeData.index !== undefined && opcodeContainerRef.current) {
      const currentOpcodeElement = opcodeRefs.current[opcodeData.index]
      if (currentOpcodeElement) {
        opcodeContainerRef.current.scrollTop = currentOpcodeElement.offsetTop - opcodeContainerRef.current.offsetTop
      }
    }
  }, [opcodeData])

  const toggleSection = (section: 'transactionDetails' | 'callTrace' | 'parametersReturnValues') => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  const formatAddress = (address: string | undefined) => {
    if (!address) return ''
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
  }

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text)
    setCopyTooltips(prev => ({ ...prev, [fieldName]: 'Copied!' }))
  }

  const resetTooltip = (fieldName: string) => {
    setTimeout(() => {
      setCopyTooltips(prev => ({ ...prev, [fieldName]: 'Copy address' }))
    }, 500)
  }

  const renderGlobalVariables = () => {
    const tx = currentTransaction
    const block = currentBlock
    const receipt = currentReceipt

    // Get input data (can be either 'data' or 'input' property)
    const inputData = tx?.data || tx?.input

    // Determine status
    const status = receipt?.status === 1 || receipt?.status === '0x1' || receipt?.status === 'true' || receipt?.status === true || receipt?.status === 'success' ? 'success' : 'failed'

    // Extract function name from input data if available
    let functionName = 'N/A'

    // Check if it's a contract creation first (no 'to' address or has contractAddress)
    if (!tx?.to || receipt?.contractAddress) {
      functionName = 'Contract Creation'
    } else if (currentFunction) {
      // Use currentFunction prop if available (decoded function name from debugger)
      functionName = currentFunction
    } else if (tx && inputData) {
      if (inputData === '0x' || inputData === '') {
        // Empty input means it's a simple transfer
        functionName = 'Transfer'
      } else if (inputData.length >= 10) {
        // Has input data, show the method signature
        const methodId = inputData.substring(0, 10)
        functionName = methodId
      }
    }

    // Format timestamp
    const timestamp = block?.timestamp ? new Date(parseInt(block.timestamp) * 1000).toLocaleString() : 'N/A'

    // Calculate tx fee
    const txFee = receipt && tx ?
      (BigInt(receipt.gasUsed || 0) * BigInt(tx.gasPrice || 0)).toString() + ' Wei' : 'N/A'

    // Get tx type
    const txType = tx?.type !== undefined ? `Type ${tx.type}` : 'Legacy'

    // Format gas price
    const gasPrice = tx?.gasPrice ? BigInt(tx.gasPrice).toString() + ' Wei' : 'N/A'

    // Gas used
    const gasUsed = receipt?.gasUsed ? receipt.gasUsed.toString() : 'N/A'

    // Transaction value
    const txValue = tx?.value ? BigInt(tx.value).toString() + ' Wei' : '0 Wei'

    return (
      <div className="global-variables-grid" data-id="txDetails">
        {/* Row 1: Status | Tx Fee */}
        <div className="global-var-item">
          <span className="global-var-key">Status:</span>
          <span className={`global-var-value tx-status ${status}`} data-id="txStatus">
            {status === 'success' ? 'Success' : 'Failed'}
          </span>
        </div>
        <div className="global-var-item">
          <span className="global-var-key">Tx Fee:</span>
          <span className="global-var-value text-theme-contrast" data-id="txFee">{txFee}</span>
        </div>

        {/* Row 2: Block | Tx Type */}
        <div className="global-var-item">
          <span className="global-var-key">Block:</span>
          <span className="global-var-value text-theme-contrast" data-id="txBlock">{block?.number || 'N/A'}</span>
        </div>
        <div className="global-var-item">
          <span className="global-var-key">Tx Type:</span>
          <span className="global-var-value text-theme-contrast" data-id="txType">{txType}</span>
        </div>

        {/* Row 3: Timestamp | Gas Price */}
        <div className="global-var-item">
          <span className="global-var-key">Timestamp:</span>
          <span className="global-var-value text-theme-contrast" data-id="txTimestamp">{timestamp}</span>
        </div>
        <div className="global-var-item">
          <span className="global-var-key">Gas Price:</span>
          <span className="global-var-value text-theme-contrast" data-id="txGasPrice">{gasPrice}</span>
        </div>

        {/* Row 4: From | Gas Used */}
        <div className="global-var-item">
          <span className="global-var-key">From:</span>
          <span className="global-var-value text-theme-contrast" data-id="txFrom">
            {tx?.from ? formatAddress(tx.from) : 'N/A'}
            {tx?.from && (
              <CustomTooltip tooltipText={copyTooltips.from} tooltipId="from-address-tooltip" placement="top">
                <i
                  className={`far ${copyTooltips.from === 'Copied!' ? 'fa-check' : 'fa-copy'} ms-2`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => copyToClipboard(tx.from, 'from')}
                  onMouseLeave={() => resetTooltip('from')}
                />
              </CustomTooltip>
            )}
          </span>
        </div>
        <div className="global-var-item">
          <span className="global-var-key">Gas Used:</span>
          <span className="global-var-value text-theme-contrast" data-id="txGasUsed">{gasUsed}</span>
        </div>

        {/* Row 5: To | Tx Index */}
        <div className="global-var-item">
          <span className="global-var-key">To:</span>
          <span className="global-var-value text-theme-contrast" data-id="txTo">
            {formatAddress(tx?.to || receipt?.contractAddress || '') || 'N/A'}
            {(tx?.to || receipt?.contractAddress) && (
              <CustomTooltip tooltipText={copyTooltips.to} tooltipId="to-address-tooltip" placement="top">
                <i
                  className={`far ${copyTooltips.to === 'Copied!' ? 'fa-check' : 'fa-copy'} ms-2`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => copyToClipboard(tx?.to || receipt?.contractAddress || '', 'to')}
                  onMouseLeave={() => resetTooltip('to')}
                />
              </CustomTooltip>
            )}
          </span>
        </div>
        <div className="global-var-item">
          <span className="global-var-key">Tx Index:</span>
          <span className="global-var-value text-theme-contrast" data-id="txIndex">
            {receipt?.transactionIndex !== undefined ? receipt.transactionIndex : (tx?.transactionIndex !== undefined ? tx.transactionIndex : 0)}
          </span>
        </div>

        {/* Row 6: Function | Tx Nonce */}
        <div className="global-var-item">
          <span className="global-var-key">Function:</span>
          <span className="global-var-value text-theme-contrast" data-id="txFunction">{functionName}</span>
        </div>
        <div className="global-var-item">
          <span className="global-var-key">Tx Nonce:</span>
          <span className="global-var-value text-theme-contrast" data-id="txNonce">{tx?.nonce !== undefined ? tx.nonce : 'N/A'}</span>
        </div>

        {/* Row 7: Value | (empty) */}
        <div className="global-var-item">
          <span className="global-var-key">Value:</span>
          <span className="global-var-value text-theme-contrast" data-id="txValue">{txValue}</span>
        </div>
      </div>
    )
  }

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

  const toggleObjectPath = (path: string) => {
    setExpandedObjectPaths(prev => {
      const newSet = new Set(prev)

      if (newSet.has(path)) {
        newSet.delete(path)
      } else {
        newSet.add(path)
      }

      return newSet
    })
  }

  // Watch for opcode expansion/collapse and update showOpcodes accordingly
  React.useEffect(() => {
    const isOpcodeExpanded = expandedObjectPaths.has('root.opcode')
    if (handleShowOpcodesChange && isOpcodeExpanded !== showOpcodes) {
      handleShowOpcodesChange(isOpcodeExpanded)
    }
  }, [expandedObjectPaths, handleShowOpcodesChange, showOpcodes])

  const isObject = (value: any): boolean => {
    return value !== null && typeof value === 'object'
  }

  const renderJsonValue = (value: any, key: string, path: string, depth: number = 0): JSX.Element => {
    const isExpanded = expandedObjectPaths.has(path)
    const indent = depth * 12

    if (Array.isArray(value)) {
      const hasItems = value.length > 0
      return (
        <div key={path} style={{ marginLeft: `${indent}px` }}>
          <div className="json-line">
            {hasItems && (
              <i
                className={`fas ${isExpanded ? 'fa-minus-square' : 'fa-plus-square'} json-expand-icon`}
                onClick={() => toggleObjectPath(path)}
                style={{ cursor: 'pointer', userSelect: 'none' }}
                data-id={`${key}-expand-icon`}
              />
            )}
            {!hasItems && <span className="json-expand-icon-placeholder"></span>}
            <span className="json-key">{key}</span>
            <span className="json-separator">: </span>
            <span className="json-bracket">[</span>
            {!isExpanded && hasItems && <span className="json-ellipsis">...</span>}
            {!hasItems && <span className="json-bracket">]</span>}
          </div>
          {isExpanded && hasItems && (
            <div data-id={`${key}-json-nested`}className="json-nested">
              {value.map((item, index) => {
                const itemPath = `${path}[${index}]`
                if (isObject(item)) {
                  return renderJsonValue(item, String(index), itemPath, depth + 1)
                }
                return (
                  <div key={itemPath} className="json-line" style={{ marginLeft: `${(depth + 1) * 12}px` }}>
                    <span className="json-expand-icon-placeholder"></span>
                    <span data-id={`${key}-json-value`} className="json-value">{JSON.stringify(item)}</span>
                    {index < value.length - 1 && <span className="json-comma">,</span>}
                  </div>
                )
              })}
            </div>
          )}
          {isExpanded && hasItems && (
            <div className="json-line" style={{ marginLeft: `${indent}px` }}>
              <span className="json-expand-icon-placeholder"></span>
              <span className="json-bracket">]</span>
            </div>
          )}
        </div>
      )
    } else if (typeof value === 'object' && value !== null) {
      const keys = Object.keys(value)
      const hasKeys = keys.length > 0
      return (
        <div key={path} style={{ marginLeft: `${indent}px` }}>
          <div className="json-line">
            {hasKeys && (
              <i
                className={`fas ${isExpanded ? 'fa-minus-square' : 'fa-plus-square'} json-expand-icon`}
                onClick={() => toggleObjectPath(path)}
                style={{ cursor: 'pointer', userSelect: 'none' }}
                data-id={`${key}-expand-icon`}
              />
            )}
            {!hasKeys && <span className="json-expand-icon-placeholder"></span>}
            <span className="json-key">{key}</span>
            <span className="json-separator">: </span>
            <span className="json-bracket">{'{'}</span>
            {!isExpanded && hasKeys && <span className="json-ellipsis">...</span>}
            {!hasKeys && <span className="json-bracket">{'}'}</span>}
          </div>
          {isExpanded && hasKeys && (
            <div data-id={`${key}-json-nested`} className="json-nested">
              {keys.map((objKey, index) => {
                const objPath = `${path}.${objKey}`
                if (isObject(value[objKey])) {
                  return renderJsonValue(value[objKey], objKey, objPath, depth + 1)
                }
                return (
                  <div key={objPath} className="json-line" style={{ marginLeft: `${(depth + 1) * 12}px` }}>
                    <span className="json-expand-icon-placeholder"></span>
                    <span className="json-key">{objKey}</span>
                    <span className="json-separator">: </span>
                    <span data-id={`${objKey}-json-value`} className="json-value">{JSON.stringify(value[objKey])}</span>
                    {index < keys.length - 1 && <span className="json-comma">,</span>}
                  </div>
                )
              })}
            </div>
          )}
          {isExpanded && hasKeys && (
            <div className="json-line" style={{ marginLeft: `${indent}px` }}>
              <span className="json-expand-icon-placeholder"></span>
              <span className="json-bracket">{'}'}</span>
            </div>
          )}
        </div>
      )
    } else {
      return (
        <div key={path} className="json-line" style={{ marginLeft: `${indent}px` }}>
          <span className="json-expand-icon-placeholder"></span>
          <span className="json-key">{key}</span>
          <span className="json-separator">: </span>
          <span data-id={`${key}-json-value`} className="json-value">{JSON.stringify(value)}</span>
        </div>
      )
    }
  }

  const getContractName = (address: string, scope?: any): string => {
    // PRIORITY 1: Check functionDefinition.contractName first (most accurate for internal calls)
    if (scope?.functionDefinition?.contractName) {
      return scope.functionDefinition.contractName
    }

    if (!deployments || deployments.length === 0) return ''

    // Check if address is a placeholder for contract creation
    const isCreationPlaceholder = address && (address.includes('Contract Creation') || address.startsWith('(Contract Creation'))

    if (isCreationPlaceholder && scope?.isCreation) {
      // For any contract creation scope with placeholder address, return the deployment name
      // This assumes we're debugging a transaction that's in the deployments list
      if (deployments.length > 0 && deployments[0].name !== 'Unknown') {
        return deployments[0].name
      }
    }

    if (!address || isCreationPlaceholder) return ''

    // PRIORITY 2: Lookup by address in deployments
    // Normalize address for comparison (remove 0x prefix, lowercase)
    const normalizeAddr = (addr: string) => {
      return addr.toLowerCase().replace(/^0x/, '')
    }

    const normalizedAddress = normalizeAddr(address)

    // Find contract by address
    const contract = deployments.find(d => {
      if (!d.address) return false
      return normalizeAddr(d.address) === normalizedAddress
    })

    // If we have a contract from deployments, return its name (but not if it's 'Unknown')
    if (contract?.name && contract.name !== 'Unknown') {
      return contract.name
    }

    return ''
  }

  const renderScopeItem = (scope: any, depth: number = 0): JSX.Element => {
    const opcode = scope.opcodeInfo?.op || ''
    let callTypeLabel = ''

    // Check if this is the synthetic sender node
    if (scope.isSenderNode) {
      callTypeLabel = 'SENDER'
    } else if (scope.isRootTransaction) {
      // Root transaction call - use the actual opcode or default to CALL
      if (opcode === 'CREATE' || opcode === 'CREATE2' || scope.isCreation) {
        callTypeLabel = 'CREATE'
      } else {
        callTypeLabel = 'CALL'
      }
    } else if (opcode === 'DELEGATECALL') {
      callTypeLabel = 'DELEGATECALL'
    } else if (opcode === 'STATICCALL') {
      callTypeLabel = 'STATICCALL'
    } else if (opcode === 'CALL') {
      callTypeLabel = 'CALL'
    } else if (opcode === 'CREATE' || opcode === 'CREATE2' || scope.isCreation) {
      callTypeLabel = 'CREATE'
    } else {
      // For scopes without specific opcodes:
      // - Root scope (depth 0) is the initial transaction = CALL
      // - Child scopes without opcode are internal function calls = INTERNAL
      callTypeLabel = depth === 0 ? 'CALL' : 'INTERNAL'
    }

    // Use children directly - getScopesAsNestedJSON('call') already filters properly
    const hasChildren = scope.children && scope.children.length > 0
    const isExpanded = expandedScopes.has(scope.scopeId)
    const isSelected = selectedScope?.scopeId === scope.scopeId

    // Get function/method name
    // Only show 'fallback' if it's actually a fallback function (kind === 'fallback')
    let itemName = scope.functionDefinition?.name ||
                   (scope.functionDefinition?.kind === 'fallback' ? 'fallback' : scope.functionDefinition?.kind) ||
                   (scope.isCreation ? 'constructor' : null)

    // For external calls without function definition, show a generic label
    if (!itemName && !scope.isSenderNode && (opcode === 'CALL' || opcode === 'DELEGATECALL' || opcode === 'STATICCALL')) {
      itemName = 'call'
    }

    // Get contract name from address
    const contractName = getContractName(scope.address, scope)

    // Check if address is a placeholder for contract creation
    const isCreationPlaceholder = scope.address && (scope.address.includes('Contract Creation') || scope.address.startsWith('(Contract Creation'))

    // Only create shortened address if it's a real address, not a placeholder
    const contractAddress = scope.address && !isCreationPlaceholder
      ? `${scope.address.substring(0, 6)}...${scope.address.substring(scope.address.length - 4)}`
      : ''

    // For CREATE operations, simplify display to just show contract name
    const isCreate = callTypeLabel === 'CREATE'

    return (
      <div key={scope.scopeId}>
        <div
          className={`call-trace-item ${isSelected ? 'selected' : ''} ${scope.isSenderNode ? 'sender-node' : ''}`}
          onClick={() => {
            // Don't handle clicks on synthetic sender node
            if (scope.isSenderNode) {
              return
            }

            setSelectedScope(scope)
            // Jump to the function entry step (for root transaction) or first step
            // This ensures we jump to the actual function code, not the contract dispatcher
            if (stepManager && stepManager.jumpTo) {
              const stepToJump = scope.functionEntryStep !== undefined ? scope.functionEntryStep : scope.firstStep
              if (stepToJump !== undefined) {
                stepManager.jumpTo(stepToJump)
              }
            }
            // Get full execution tree for this scope and emit to terminal panel
            if (onScopeSelected) {
              // Get the full nested scope tree for the selected call (with all internal functions)
              let scopeWithExecutionTree = scope
              if (callTree && typeof callTree.getScopesAsNestedJSON === 'function') {
                try {
                  // Get the execution tree starting from this scope
                  const executionTree = callTree.getScopesAsNestedJSON('nojump', scope.scopeId)
                  if (executionTree && executionTree.length > 0) {
                    // Use the first item which should be our scope with full children
                    scopeWithExecutionTree = executionTree[0]
                  }
                } catch (e) {
                  console.error('[DebugLayout] Error getting execution tree for scope:', e)
                }
              }
              onScopeSelected(scopeWithExecutionTree)
            }
          }}
        >
          <div className="call-trace-line">
            <span className="call-trace-step">{scope.firstStep}</span>
            <div style={{
              paddingLeft: `${0.5 + depth * 8}px`,
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              flex: 1,
              borderLeft: depth > 0 ? '2px solid var(--bs-border-color)' : 'none',
              marginLeft: depth > 0 ? '0.25rem' : '0'
            }}>
              {hasChildren && (
                <i
                  className={`fas ${isExpanded ? 'fa-minus-square' : 'fa-plus-square'} call-trace-expand-icon`}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleScope(scope.scopeId)
                  }}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                />
              )}
              {!hasChildren && <span style={{ width: '14px' }}></span>}
              <span className={`call-trace-type ${callTypeLabel.toLowerCase()}`}>
                {callTypeLabel}
              </span>
              <span className="call-trace-function">
                {scope.isSenderNode ? (
                  // For SENDER node, show the sender address with SENDER badge
                  <>
                    <span className="text-muted">
                      {currentTransaction?.from ? currentTransaction.from : 'Unknown Sender'}
                    </span>
                  </>
                ) : isCreate ? (
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
              {/* Navigation action buttons - show for all non-sender nodes */}
              {!scope.isSenderNode && (scope.firstStep !== undefined || scope.lastStep !== undefined) && (
                <div className="call-trace-actions">
                  {scope.firstStep !== undefined && (
                    <CustomTooltip tooltipText="Jump Into" tooltipId={`jump-into-${scope.scopeId}`} placement="top">
                      <button
                        className="jump-debug-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (stepManager && stepManager.jumpTo) {
                            // Use functionEntryStep if available (skips dispatcher), otherwise use firstStep
                            const stepToJump = scope.functionEntryStep !== undefined ? scope.functionEntryStep : scope.firstStep
                            stepManager.jumpTo(stepToJump)
                          }
                        }}
                      >
                        <i className="fas fa-sign-in-alt"></i>
                      </button>
                    </CustomTooltip>
                  )}
                  {scope.lastStep !== undefined && (
                    <>
                      <CustomTooltip tooltipText="Jump End" tooltipId={`jump-end-${scope.scopeId}`} placement="top">
                        <button
                          className="jump-debug-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (stepManager && stepManager.jumpTo) {
                              stepManager.jumpTo(scope.lastStep)
                            }
                          }}
                        >
                          <i className="fas fa-step-forward"></i>
                        </button>
                      </CustomTooltip>
                      <CustomTooltip tooltipText="Jump Over" tooltipId={`jump-over-${scope.scopeId}`} placement="top">
                        <button
                          className="jump-debug-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (stepManager && stepManager.jumpTo) {
                              stepManager.jumpTo(scope.lastStep + 1)
                            }
                          }}
                        >
                          <i className="fas fa-level-down-alt"></i>
                        </button>
                      </CustomTooltip>
                    </>
                  )}
                  {isSelected && stepManager && stepManager.jumpOut && (
                    <CustomTooltip tooltipText="Jump Out" tooltipId={`jump-out-${scope.scopeId}`} placement="top">
                      <button
                        className="jump-debug-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (stepManager && stepManager.jumpOut) {
                            stepManager.jumpOut(true) // true for solidity mode
                          }
                        }}
                      >
                        <i className="fas fa-sign-out-alt"></i>
                      </button>
                    </CustomTooltip>
                  )}
                </div>
              )}
              {/* <span className="call-trace-gas ms-1"><i className="fas fa-gas-pump"></i> {scope.gasCost}</span> */}
            </div>
          </div>
        </div>
        {hasChildren && isExpanded && (
          <>
            {scope.children.map((child: any) => renderScopeItem(child, depth + 1))}
          </>
        )}
      </div>
    )
  }

  const renderCallTrace = () => {
    // Use nested scopes if available (external calls only)
    if (nestedScopes && nestedScopes.length > 0) {
      return (
        <div className="call-trace-list">
          {nestedScopes.map((scope) => renderScopeItem(scope, 0))}
        </div>
      )
    }

    // If nestedScopes is empty array, it means no external calls
    // Show message in this case
    if (nestedScopes !== null && nestedScopes !== undefined) {
      return (
        <p className="text-muted ms-1">
          <FormattedMessage id="debugger.noExternalCalls" defaultMessage="No external calls found." />
        </p>
      )
    }

    // Fallback to old implementation
    if (!functionStack || functionStack.length === 0) {
      return (
        <p className="text-muted">
          <FormattedMessage id="debugger.noCallTrace" defaultMessage="No call trace available" />
        </p>
      )
    }

    return (
      <div className="call-trace-list">
        {functionStack.map((func, index) => {
          const functionName = func.functionDefinition?.name || func.functionDefinition?.kind || 'Unknown'
          const callType = func.callType || func.functionDefinition?.visibility || ''
          const inputs = func.inputs || []
          // const gasCost = func.gasCost || 0
          const step = func.firstStep !== undefined ? func.firstStep : '-'

          // Determine call type icon and label
          let callTypeLabel = ''
          if (callType.includes('delegate') || func.isDelegateCall) {
            callTypeLabel = 'DELEGATECALL'
          } else if (callType.includes('static') || func.isStaticCall) {
            callTypeLabel = 'STATICCALL'
          } else if (functionName === 'constructor' || func.functionDefinition?.kind === 'constructor') {
            callTypeLabel = 'CREATE'
          } else {
            callTypeLabel = 'CALL'
          }

          const isCreate = callTypeLabel === 'CREATE'

          return (
            <div key={index} className="call-trace-item">
              <div className="call-trace-line">
                <span className="call-trace-step">{step}</span>
                <div style={{
                  paddingLeft: `${0.5 + index * 8}px`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  flex: 1,
                  borderLeft: index > 0 ? '2px solid var(--bs-border-color)' : 'none',
                  marginLeft: index > 0 ? '0.25rem' : '0'
                }}>
                  <span className={`call-trace-type ${callTypeLabel.toLowerCase()}`}>
                    {callTypeLabel}
                  </span>
                  <span className="call-trace-function">
                    {isCreate ? (
                      <span className="method-name">{functionName}</span>
                    ) : (
                      <>
                        <span className="method-name">{functionName}</span>({inputs.join(', ')})
                      </>
                    )}
                  </span>
                  {/* <span className="call-trace-gas ms-1"><i className="fas fa-gas-pump"></i> {gasCost}</span> */}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const renderOpcodes = () => {
    if (!opcodeData || !opcodeData.code || opcodeData.code.length === 0) {
      return <div className="text-muted p-2">No opcode data at current step</div>
    }

    const { code, index, nextIndexes } = opcodeData

    return (
      <div className="opcodes-container" ref={opcodeContainerRef} style={{ maxHeight: '300px', overflowY: 'auto' }}>
        {code.map((opcode: string, i: number) => {
          const isCurrent = i === index
          const isNext = nextIndexes && nextIndexes.includes(i)

          const className = 'opcode-item'
          const style: React.CSSProperties = {
            padding: '2px 4px',
            fontSize: '0.75rem',
            fontFamily: 'monospace',
            color: 'var(--bs-warning)'
          }

          if (isCurrent) {
            style.backgroundColor = 'var(--bs-primary)'
            style.color = 'var(--bs-light)'
          } else if (isNext) {
            style.color = 'var(--bs-primary)'
            style.fontWeight = 'bold'
          }

          return (
            <div
              key={i}
              className={className}
              style={style}
              ref={(ref) => {
                opcodeRefs.current[i] = ref
              }}
            >
              {opcode}
            </div>
          )
        })}
      </div>
    )
  }

  const renderObjectContent = () => {
    if (activeObjectTab === 'stateLocals') {
      // State & Locals tab - show locals and state
      const objectData: any = {
        locals: solidityLocals || 'No local variables at current step',
        state: solidityState || 'No state variables at current step'
      }

      return (
        <div className="debug-object-content json-renderer" data-id="stateLocalsContent">
          <div className="json-line">
            <span className="json-bracket">{'{'}</span>
          </div>
          {Object.keys(objectData).map((key) => {
            const value = objectData[key]
            const path = `root.${key}`
            // Add data-id for e2e tests
            const dataId = key === 'locals' ? 'solidityLocals' : key === 'state' ? 'solidityState' : undefined
            if (isObject(value)) {
              return <div key={path} data-id={dataId}>{renderJsonValue(value, key, path, 1)}</div>
            }
            return (
              <div key={path} className="json-line" style={{ marginLeft: '12px' }} data-id={dataId}>
                <span className="json-expand-icon-placeholder"></span>
                <span className="json-key">{key}</span>
                <span className="json-separator">: </span>
                <span data-id={`${key}-json-value`} className="json-value">{JSON.stringify(value)}</span>
                {key !== Object.keys(objectData)[Object.keys(objectData).length - 1] && <span className="json-comma">,</span>}
              </div>
            )
          })}
          <div className="json-line">
            <span className="json-bracket">{'}'}</span>
          </div>
        </div>
      )
    } else {
      // Stack & Memory tab - show opcode, call stack, stack, memory
      return (
        <div className="debug-object-content json-renderer">
          <div className="json-line">
            <span className="json-bracket">{'{'}</span>
          </div>

          {/* Opcode - Custom Renderer */}
          <div style={{ marginLeft: '12px' }}>
            <div className="json-line" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <i
                className={`fas ${expandedObjectPaths.has('root.opcode') ? 'fa-minus-square' : 'fa-plus-square'} json-expand-icon`}
                onClick={() => toggleObjectPath('root.opcode')}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              />
              <span className="json-key">opcode</span>
              <span className="json-separator">: </span>
              {!expandedObjectPaths.has('root.opcode') && (
                <>
                  <span className="json-ellipsis">...</span>
                  <span className="json-comma">,</span>
                </>
              )}
              {expandedObjectPaths.has('root.opcode') && <span className="json-separator">[</span>}
            </div>
            {expandedObjectPaths.has('root.opcode') && (
              <>
                <div style={{ marginLeft: '26px', marginTop: '4px', marginBottom: '4px' }}>
                  {renderOpcodes()}
                </div>
                <div className="json-line" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span className="json-expand-icon-placeholder"></span>
                  <span className="json-separator">]</span>
                  <span className="json-comma">,</span>
                </div>
              </>
            )}
          </div>

          {/* Call Stack */}
          {(() => {
            const value = callStackData || 'No call stack at current step'
            const path = 'root.callStack'
            if (isObject(value)) {
              return renderJsonValue(value, 'callStack', path, 1)
            }
            return (
              <div key={path} className="json-line" style={{ marginLeft: '12px' }}>
                <span className="json-expand-icon-placeholder"></span>
                <span className="json-key">callStack</span>
                <span className="json-separator">: </span>
                <span data-id={`callStack-json-value`} className="json-value">{JSON.stringify(value)}</span>
                <span className="json-comma">,</span>
              </div>
            )
          })()}

          {/* Stack */}
          {(() => {
            const value = stackData || 'No stack data at current step'
            const path = 'root.stack'
            if (isObject(value)) {
              return renderJsonValue(value, 'stack', path, 1)
            }
            return (
              <div key={path} className="json-line" style={{ marginLeft: '12px' }}>
                <span className="json-expand-icon-placeholder"></span>
                <span className="json-key">stack</span>
                <span className="json-separator">: </span>
                <span data-id={`stack-json-value`} className="json-value">{JSON.stringify(value)}</span>
                <span className="json-comma">,</span>
              </div>
            )
          })()}

          {/* Memory */}
          {(() => {
            const value = memoryData || 'No memory data at current step'
            const path = 'root.memory'
            if (isObject(value)) {
              return renderJsonValue(value, 'memory', path, 1)
            }
            return (
              <div key={path} className="json-line" style={{ marginLeft: '12px' }}>
                <span className="json-expand-icon-placeholder"></span>
                <span className="json-key">memory</span>
                <span className="json-separator">: </span>
                <span data-id={`memory-json-value`} className="json-value">{JSON.stringify(value)}</span>
              </div>
            )
          })()}

          <div className="json-line">
            <span className="json-bracket">{'}'}</span>
          </div>
        </div>
      )
    }
  }

  return (
    <div className="debug-layout">
      {/* Section 1: Search Bar + Transaction Global Values */}
      <div className="debug-section debug-section-search ms-1 me-1">
        <SearchBar
          onSearch={onSearch}
          debugging={debugging}
          currentTxHash={currentTxHash}
          onStopDebugging={onStopDebugging}
        />

        {/* Use generated sources checkbox */}
        <div className="mt-1 mb-2 ms-2 debuggerConfig form-check">
          <CustomTooltip tooltipId="debuggerGenSourceCheckbox" tooltipText={<FormattedMessage id="debugger.debugWithGeneratedSources" />} placement="bottom-start">
            <span className="p-0 m-0">
              <input
                className="form-check-input"
                id="debugGeneratedSourcesInput"
                onChange={({ target: { checked } }) => {
                  if (onDebugWithGeneratedSourcesChange) {
                    onDebugWithGeneratedSourcesChange(checked)
                  }
                }}
                checked={debugWithGeneratedSources || false}
                type="checkbox"
              />
              <label data-id="debugGeneratedSourcesLabel" className="form-check-label" htmlFor="debugGeneratedSourcesInput">
                <FormattedMessage id="debugger.useGeneratedSources" />
                (Solidity {'>='} v0.7.2)
              </label>
            </span>
          </CustomTooltip>
        </div>
      </div>

      {/* Section 2: Transaction Details */}
      <div className="debug-section debug-section-transaction" style={!expandedSections.transactionDetails ? { minHeight: 'auto', flex: '0 0 auto' } : {}}>
        <div
          className="debug-section-header"
          onClick={() => toggleSection('transactionDetails')}
          style={{ cursor: 'pointer' }}
        >
          <h6 className="debug-section-title">
            <FormattedMessage id="debugger.transactionDetails" defaultMessage="Transaction Details" />
          </h6>
          <i className={`fas ${expandedSections.transactionDetails ? 'fa-chevron-down' : 'fa-chevron-right'}`} style={{ fontSize: '0.75rem', marginRight: '1rem', color: 'var(--bs-body-color)' }}></i>
        </div>
        {expandedSections.transactionDetails && (
          <div className="debug-section-content ms-3">
            {renderGlobalVariables()}
          </div>
        )}
      </div>

      {/* Section 3: Call Trace */}
      <div className="debug-section debug-section-trace" style={!expandedSections.callTrace ? { minHeight: 'auto', flex: '0 0 auto' } : {}}>
        <div
          className="debug-section-header"
          onClick={() => toggleSection('callTrace')}
          style={{ cursor: 'pointer' }}
        >
          <h6 className="debug-section-title" data-id="callTraceHeader">
            Call Trace (Step: {stepManager?.currentStepIndex ?? 0} / {(traceData && (traceData.traceLength - 1)) || 0})
          </h6>
          <i className={`fas ${expandedSections.callTrace ? 'fa-chevron-down' : 'fa-chevron-right'}`} style={{ fontSize: '0.75rem', marginRight: '1rem', color: 'var(--bs-body-color)' }}></i>
        </div>
        {expandedSections.callTrace && (
          <div className="debug-section-content debug-section-scrollable">
            {renderCallTrace()}
          </div>
        )}
      </div>

      {/* Section 4: State & Locals / Stack & Memory */}
      <div className="debug-section debug-section-object" style={!expandedSections.parametersReturnValues ? { minHeight: 'auto', flex: '0 0 auto' } : {}}>
        <div
          className="debug-section-header"
          onClick={() => toggleSection('parametersReturnValues')}
          style={{ cursor: 'pointer' }}
        >
          <div className="debug-tabs" onClick={(e) => e.stopPropagation()} style={{ paddingLeft: '1rem' }}>
            <button
              className={`debug-tab ${activeObjectTab === 'stateLocals' ? 'active' : ''}`}
              onClick={() => setActiveObjectTab('stateLocals')}
            >
              <FormattedMessage id="debugger.stateLocals" defaultMessage="State & Locals" />
            </button>
            <button
              className={`debug-tab ${activeObjectTab === 'stackMemory' ? 'active' : ''}`}
              onClick={() => setActiveObjectTab('stackMemory')}
            >
              <FormattedMessage id="debugger.stackMemory" defaultMessage="Stack & Memory" />
            </button>
          </div>
          <i className={`fas ${expandedSections.parametersReturnValues ? 'fa-chevron-down' : 'fa-chevron-right'}`} style={{ fontSize: '0.75rem', marginRight: '1rem', color: 'var(--bs-body-color)' }}></i>
        </div>
        {expandedSections.parametersReturnValues && (
          <div className="debug-section-content debug-section-scrollable">
            {renderObjectContent()}
          </div>
        )}
      </div>
    </div>
  )
}

export default DebugLayout
