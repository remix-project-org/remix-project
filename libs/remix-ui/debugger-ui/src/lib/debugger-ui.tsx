import React, {useState, useEffect, useRef, useContext} from 'react' // eslint-disable-line
import { FormattedMessage, useIntl } from 'react-intl'
import SearchBar from './search-bar/search-bar' // eslint-disable-line
import DebugLayout from './debug-layout/debug-layout' // eslint-disable-line
import {TransactionDebugger as Debugger} from '@remix-project/remix-debug' // eslint-disable-line
import {DebuggerUIProps} from './idebugger-api' // eslint-disable-line
import {Toaster} from '@remix-ui/toaster' // eslint-disable-line
import { CustomTooltip, isValidHash } from '@remix-ui/helper'
import { DebuggerEvent, MatomoEvent } from '@remix-api';
import { TrackingContext } from '@remix-ide/tracking'
import { ContractDeployment } from './transaction-recorder/types'
/* eslint-disable-next-line */
import './debugger-ui.css'
import type { CompilerAbstract } from '@remix-project/remix-solidity'

export const DebuggerUI = (props: DebuggerUIProps) => {
  const intl = useIntl()
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = DebuggerEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }
  const debuggerModule = props.debuggerAPI
  const [state, setState] = useState({
    isActive: false,
    debugger: null,
    currentReceipt: {
      contractAddress: null,
      to: null
    },
    currentBlock: null,
    currentTransaction: null,
    blockNumber: null,
    txNumber: '',
    debugging: false,
    opt: {
      debugWithGeneratedSources: false,
      debugWithLocalNode: false
    },
    toastMessage: '',
    validationError: '',
    txNumberIsEmpty: true,
    isLocalNodeUsed: false,
    sourceLocationStatus: '',
    showOpcodes: false
  })

  const [deployments] = useState<ContractDeployment[]>([])
  const [traceData, setTraceData] = useState<{ currentStep: number; traceLength: number } | null>(null)
  const [currentFunction, setCurrentFunction] = useState<string>('')
  const [functionStack, setFunctionStack] = useState<any[]>([])
  const [nestedScopes, setNestedScopes] = useState<any[]>([])
  const [callTreeInstance, setCallTreeInstance] = useState<any>(null)
  const [solidityLocals, setSolidityLocals] = useState<any>(null)
  const [solidityState, setSolidityState] = useState<any>(null)
  const [transactionRecorderUI, setTransactionRecorderUI] = useState<React.ReactNode>(null)

  if (props.onReady) {
    props.onReady({
      globalContext: () => {
        return {
          block: state.currentBlock,
          tx: state.currentTransaction,
          receipt: state.currentReceipt
        }
      }
    })
  }

  const debuggerTopRef = useRef(null)

  useEffect(() => {
    // Get the transaction recorder UI from udappTransactions plugin
    debuggerModule.call('udappTransactions', 'getUI').then((ui) => {
      setTransactionRecorderUI(ui)
    }).catch(() => {
      // If udappTransactions is not available, show fallback message
      setTransactionRecorderUI(
        <div className="alert alert-info m-3">
          <i className="fas fa-info-circle mr-2"></i>
          Transaction recorder is available in the Deploy & Run Transactions tab.
        </div>
      )
    })

    return unLoad()
  }, [])

  debuggerModule.onDebugRequested((hash, web3?) => {
    if (hash) return debug(hash, web3)
  })

  debuggerModule.onRemoveHighlights(async () => {
    await debuggerModule.discardHighlight()
  })

  useEffect(() => {
    const setEditor = () => {
      debuggerModule.onBreakpointCleared((fileName, row) => {
        if (state.debugger)
          state.debugger.breakPointManager.remove({
            fileName: fileName,
            row: row
          })
      })

      debuggerModule.onBreakpointAdded((fileName, row) => {
        if (state.debugger) state.debugger.breakPointManager.add({ fileName: fileName, row: row })
      })

      debuggerModule.onEditorContentChanged(() => {
        if (state.debugger) unLoad()
      })
    }

    setEditor()

    const providerChanged = () => {
      debuggerModule.onEnvChanged((provider) => {
        setState((prevState) => {
          const isLocalNodeUsed = !provider.startsWith('vm') && !provider.startsWith('injected')
          return { ...prevState, isLocalNodeUsed: isLocalNodeUsed }
        })
      })
    }

    providerChanged()
  }, [state.debugger])

  useEffect(() => {
    if (state.debugger && state.debugger.step_manager) {
      const updateTraceData = (step) => {
        setTraceData({
          currentStep: step,
          traceLength: state.debugger.step_manager.traceLength || 0
        })
      }

      state.debugger.step_manager.event.register('stepChanged', updateTraceData)
    }

    // Listen for function stack updates to get the current function name
    if (state.debugger && state.debugger.vmDebuggerLogic) {
      const updateFunctionStack = (stack) => {
        if (stack && stack.length > 0) {
          // Get the top-level function from the stack
          const topFunction = stack[0]
          const funcName = topFunction.functionDefinition?.name || topFunction.functionDefinition?.kind || ''
          setCurrentFunction(funcName)
          // Store the full stack for the trace view
          setFunctionStack(stack)
        } else {
          setCurrentFunction('')
          setFunctionStack([])
        }
      }

      state.debugger.vmDebuggerLogic.event.register('functionsStackUpdate', updateFunctionStack)

      // Listen for solidityState updates
      const updateSolidityState = (stateData) => {
        console.log('[Debugger] solidityState event received:', stateData)
        setSolidityState(stateData)
      }
      state.debugger.vmDebuggerLogic.event.register('solidityState', updateSolidityState)

      // Listen for solidityLocals updates
      const updateSolidityLocals = (localsData) => {
        console.log('[Debugger] solidityLocals event received:', localsData)
        setSolidityLocals(localsData)
      }
      state.debugger.vmDebuggerLogic.event.register('solidityLocals', updateSolidityLocals)
    }
  }, [state.debugger])

  const listenToEvents = (debuggerInstance, currentReceipt) => {
    if (!debuggerInstance) return

    debuggerInstance.event.register('debuggerStatus', async (isActive) => {
      await debuggerModule.discardHighlight()
      setState((prevState) => {
        return { ...prevState, isActive }
      })
    })

    debuggerInstance.event.register('locatingBreakpoint', async (isActive) => {
      setState((prevState) => {
        return {
          ...prevState,
          sourceLocationStatus: intl.formatMessage({ id: 'debugger.sourceLocationStatus1' })
        }
      })
    })

    debuggerInstance.event.register('noBreakpointHit', async (isActive) => {
      setState((prevState) => {
        return { ...prevState, sourceLocationStatus: '' }
      })
    })

    debuggerInstance.event.register('newSourceLocation', async (lineColumnPos, rawLocation, generatedSources, address, stepDetail, lineGasCost, contracts: CompilerAbstract) => {
      console.log('newSourceLocation', { lineColumnPos, rawLocation, generatedSources, address, stepDetail, lineGasCost, contracts })
      if (!lineColumnPos) {
        await debuggerModule.discardHighlight()
        setState((prevState) => {
          return {
            ...prevState,
            sourceLocationStatus: intl.formatMessage({ id: 'debugger.sourceLocationStatus2' }, { address: address || '' })
          }
        })
        return
      }
      if (contracts) {
        let path = contracts.getSourceName(rawLocation.file)
        // Get the main contract (first source) as origin for resolution
        const sources = contracts.getSourceCode().sources
        const mainContract = sources ? Object.keys(sources)[0] : null
        if (!path) {
          // check in generated sources
          for (const source of generatedSources) {
            if (source.id === rawLocation.file) {
              path = `browser/.debugger/generated-sources/${source.name}`
              let content
              try {
                content = await debuggerModule.getFile(path)
              } catch (e) {
                const message = "Unable to fetch generated sources, the file probably doesn't exist yet."
                console.log(message, ' ', e)
              }
              if (content !== source.contents) {
                await debuggerModule.setFile(path, source.contents)
              }
              break
            }
          }
        }
        if (path) {
          setState((prevState) => {
            return { ...prevState, sourceLocationStatus: '' }
          })
          await debuggerModule.discardHighlight()
          const currentStep = debuggerInstance && debuggerInstance.step_manager ? debuggerInstance.step_manager.currentStepIndex : undefined
          await debuggerModule.highlight(lineColumnPos, path, rawLocation, stepDetail, lineGasCost, mainContract, currentStep)
        }
      }
    })

    debuggerInstance.event.register('debuggerUnloaded', () => unLoad())

    // Listen for callTreeReady event to get nested scopes
    if (debuggerInstance && debuggerInstance.debugger && debuggerInstance.debugger.callTree) {
      // Store the callTree instance for later use
      setCallTreeInstance(debuggerInstance.debugger.callTree)

      debuggerInstance.debugger.callTree.event.register('callTreeReady', () => {
        try {
          // Get the root scope with low-level scopes merged
          const nojumpScopes = debuggerInstance.debugger.callTree.getScopesAsNestedJSON('nojump')
          // Also get all scopes to access the original scope tree
          const allScopes = debuggerInstance.debugger.callTree.getScopesAsNestedJSON('all')

          if (nojumpScopes && nojumpScopes.length > 0) {
            const rootScope = nojumpScopes[0]

            // Get external calls made by this transaction
            const externalCalls = debuggerInstance.debugger.callTree.getScopesAsNestedJSON('call')

            // Find the actual function entry step by looking at the scope tree
            // The root might include dispatcher, so we look for the first meaningful child scope
            let functionEntryStep = rootScope.firstStep

            // Helper function to find first function scope in the tree
            const findFirstFunctionScope = (scope: any): any => {
              // If this scope has a function definition with a name, it's a function scope
              if (scope.functionDefinition && scope.functionDefinition.name) {
                return scope
              }
              // Otherwise, look at children
              if (scope.children && scope.children.length > 0) {
                for (const child of scope.children) {
                  const found = findFirstFunctionScope(child)
                  if (found) return found
                }
              }
              return null
            }

            // Try to find a better entry step and function definition from the all-scopes tree
            let actualFunctionDefinition = rootScope.functionDefinition
            if (allScopes && allScopes.length > 0) {
              const firstFunctionScope = findFirstFunctionScope(allScopes[0])
              if (firstFunctionScope) {
                if (firstFunctionScope.firstStep > rootScope.firstStep) {
                  functionEntryStep = firstFunctionScope.firstStep
                }
                // Use the function definition from the actual function scope
                if (firstFunctionScope.functionDefinition) {
                  actualFunctionDefinition = firstFunctionScope.functionDefinition
                }
              }
            }

            // Create the root transaction call (CALL to the contract method)
            const rootTransactionCall = {
              ...rootScope,
              functionDefinition: actualFunctionDefinition, // Use the actual function definition
              children: externalCalls, // External calls become children of the root transaction
              isRootTransaction: true, // Mark this as the root transaction call
              functionEntryStep: functionEntryStep // Store the actual function entry step
            }

            // Create a synthetic SENDER node as the parent
            const senderNode = {
              scopeId: 'sender',
              firstStep: rootScope.firstStep,
              lastStep: rootScope.lastStep,
              gasCost: rootScope.gasCost,
              address: rootScope.address,
              isCreation: rootScope.isCreation,
              functionDefinition: rootScope.functionDefinition,
              opcodeInfo: rootScope.opcodeInfo,
              locals: {},
              children: [rootTransactionCall], // Root transaction is a child of sender
              isSenderNode: true // Mark this as the synthetic sender node
            }

            setNestedScopes([senderNode])
          } else {
            setNestedScopes([])
          }
        } catch (error) {
          console.error('[DebuggerUI] Error loading nested scopes:', error)
        }
      })
    }
  }
  const requestDebug = (blockNumber, txNumber, tx) => {
    startDebugging(blockNumber, txNumber, tx)
  }

  const updateTxNumberFlag = (empty: boolean) => {
    setState((prevState) => {
      return {
        ...prevState,
        txNumberIsEmpty: empty,
        validationError: ''
      }
    })
  }

  const unloadRequested = (blockNumber, txIndex, tx) => {
    unLoad()
    setState((prevState) => {
      return {
        ...prevState,
        sourceLocationStatus: ''
      }
    })
  }

  const unLoad = () => {
    debuggerModule.onStopDebugging()
    if (state.debugger) state.debugger.unload()
    setState((prevState) => {
      return {
        ...prevState,
        isActive: false,
        debugger: null,
        currentReceipt: {
          contractAddress: null,
          to: null
        },
        currentBlock: null,
        currentTransaction: null,
        blockNumber: null,
        ready: {
          vmDebugger: false,
          vmDebuggerHead: false
        },
        debugging: false
      }
    })
    // Reset solidity locals and state
    setSolidityLocals(null)
    setSolidityState(null)
    // Clear all breakpoints from editor
    debuggerModule.call('editor', 'clearAllBreakpoints').catch((e) => {
      console.error('Failed to clear breakpoints:', e)
    })
    // Emit debugging stopped event
    debuggerModule.emit('debuggingStopped')
  }
  const startDebugging = async (blockNumber, txNumber, tx, optWeb3?) => {
    if (state.debugger) {
      unLoad()
      await new Promise((resolve) => setTimeout(() => resolve({}), 1000))
    }
    if (!txNumber) return
    setState((prevState) => {
      return {
        ...prevState,
        txNumber: txNumber,
        sourceLocationStatus: ''
      }
    })
    if (!isValidHash(txNumber)) {
      setState((prevState) => {
        return {
          ...prevState,
          validationError: 'Invalid transaction hash.'
        }
      })
      return
    }

    const web3 = optWeb3 || (state.opt.debugWithLocalNode ? await debuggerModule.web3() : await debuggerModule.getDebugProvider())
    try {
      const networkId = (await web3.getNetwork()).chainId
      trackMatomoEvent({ category: 'debugger', action: 'startDebugging', value: networkId, isClick: true })
    } catch (e) {
      console.error(e)
    }
    let currentReceipt
    let currentBlock
    let currentTransaction
    try {
      currentReceipt = await web3.getTransactionReceipt(txNumber)
      currentBlock = await web3.getBlock(currentReceipt.blockHash)
      currentTransaction = await web3.getTransaction(txNumber)
    } catch (e) {
      setState((prevState) => {
        return {
          ...prevState,
          validationError: e.message
        }
      })
      console.log(e.message)
    }

    const localCache = {}
    const debuggerInstance = new Debugger({
      web3,
      offsetToLineColumnConverter: debuggerModule.offsetToLineColumnConverter,
      compilationResult: async (address) => {
        try {
          if (!localCache[address]) localCache[address] = await debuggerModule.fetchContractAndCompile(address, currentReceipt)
          return localCache[address]
        } catch (e) {
          // debuggerModule.showMessage('Debugging error', 'Unable to fetch a transaction.')
          console.error(e)
        }
        return null
      },
      debugWithGeneratedSources: state.opt.debugWithGeneratedSources,
      getCache: debuggerModule.getCache.bind(debuggerModule),
      setCache: debuggerModule.setCache.bind(debuggerModule)
    })

    setTimeout(async () => {
      debuggerModule.onStartDebugging(debuggerInstance)
      try {
        await debuggerInstance.debug(blockNumber, txNumber, tx, () => {
          listenToEvents(debuggerInstance, currentReceipt)
          setState((prevState) => {
            return {
              ...prevState,
              blockNumber,
              txNumber,
              debugging: true,
              currentReceipt,
              currentBlock,
              currentTransaction,
              debugger: debuggerInstance,
              toastMessage: `debugging ${txNumber}`,
              validationError: ''
            }
          })
          // Activate the debugger plugin when debugging starts
          debuggerModule.call('menuicons', 'select', 'debugger').catch(err => {
            console.error('Failed to activate debugger:', err)
          })
          // Close right side panel if it's open when debugging starts
          debuggerModule.call('rightSidePanel', 'isPanelHidden').then((isHidden: boolean) => {
            if (!isHidden) {
              debuggerModule.call('rightSidePanel', 'togglePanel').catch(err => {
                console.error('Failed to close right side panel:', err)
              })
            }
          }).catch(err => {
            console.error('Failed to check right side panel state:', err)
          })
          // Emit debugging started event
          debuggerModule.emit('debuggingStarted', {
            txHash: txNumber,
            stepManager: {
              stepOverBack: debuggerInstance.step_manager?.stepOverBack.bind(debuggerInstance.step_manager),
              stepIntoBack: debuggerInstance.step_manager?.stepIntoBack.bind(debuggerInstance.step_manager),
              stepIntoForward: debuggerInstance.step_manager?.stepIntoForward.bind(debuggerInstance.step_manager),
              stepOverForward: debuggerInstance.step_manager?.stepOverForward.bind(debuggerInstance.step_manager),
              jumpPreviousBreakpoint: debuggerInstance.step_manager?.jumpPreviousBreakpoint.bind(debuggerInstance.step_manager),
              jumpNextBreakpoint: debuggerInstance.step_manager?.jumpNextBreakpoint.bind(debuggerInstance.step_manager),
              jumpToException: debuggerInstance.step_manager?.jumpToException.bind(debuggerInstance.step_manager),
              traceLength: debuggerInstance.step_manager?.traceLength,
              currentStepIndex: debuggerInstance.step_manager?.currentStepIndex,
              registerEvent: debuggerInstance.step_manager?.event.register.bind(debuggerInstance.step_manager?.event),
              showOpcodes: state.showOpcodes
            }
          })
        })
      } catch (error) {
        unLoad()
        setState((prevState) => {
          let errorMsg = error.message || error
          if (typeof errorMsg !== 'string') {
            errorMsg = JSON.stringify(errorMsg) + '. Possible error: the current endpoint does not support retrieving the trace of a transaction.'
          }
          return {
            ...prevState,
            validationError: errorMsg
          }
        })
      }
    }, 300)

    return debuggerInstance
  }

  const debug = (txHash, web3?) => {
    setState((prevState) => {
      return {
        ...prevState,
        validationError: '',
        txNumber: txHash,
        sourceLocationStatus: ''
      }
    })
    return startDebugging(null, txHash, null, web3)
  }

  const handleShowOpcodesChange = (showOpcodes: boolean) => {
    setState((prevState) => {
      return { ...prevState, showOpcodes }
    })
    // Emit event to update external listeners (like bottom-bar)
    debuggerModule.emit('showOpcodesChanged', showOpcodes)
  }

  const stepManager = {
    jumpTo: state.debugger && state.debugger.step_manager ? state.debugger.step_manager.jumpTo.bind(state.debugger.step_manager) : null,
    stepOverBack: state.debugger && state.debugger.step_manager ? state.debugger.step_manager.stepOverBack.bind(state.debugger.step_manager) : null,
    stepIntoBack: state.debugger && state.debugger.step_manager ? state.debugger.step_manager.stepIntoBack.bind(state.debugger.step_manager) : null,
    stepIntoForward: state.debugger && state.debugger.step_manager ? state.debugger.step_manager.stepIntoForward.bind(state.debugger.step_manager) : null,
    stepOverForward: state.debugger && state.debugger.step_manager ? state.debugger.step_manager.stepOverForward.bind(state.debugger.step_manager) : null,
    jumpOut: state.debugger && state.debugger.step_manager ? state.debugger.step_manager.jumpOut.bind(state.debugger.step_manager) : null,
    jumpPreviousBreakpoint: state.debugger && state.debugger.step_manager ? state.debugger.step_manager.jumpPreviousBreakpoint.bind(state.debugger.step_manager) : null,
    jumpNextBreakpoint: state.debugger && state.debugger.step_manager ? state.debugger.step_manager.jumpNextBreakpoint.bind(state.debugger.step_manager) : null,
    jumpToException: state.debugger && state.debugger.step_manager ? state.debugger.step_manager.jumpToException.bind(state.debugger.step_manager) : null,
    traceLength: state.debugger && state.debugger.step_manager ? state.debugger.step_manager.traceLength : null,
    registerEvent: state.debugger && state.debugger.step_manager ? state.debugger.step_manager.event.register.bind(state.debugger.step_manager.event) : null,
    showOpcodes: state.showOpcodes,
    currentStepIndex: state.debugger?.step_manager?.currentStepIndex
  }

  const vmDebugger = {
    registerEvent: state.debugger && state.debugger.vmDebuggerLogic ? state.debugger.vmDebuggerLogic.event.register.bind(state.debugger.vmDebuggerLogic.event) : null,
    triggerEvent: state.debugger && state.debugger.vmDebuggerLogic ? state.debugger.vmDebuggerLogic.event.trigger.bind(state.debugger.vmDebuggerLogic.event) : null
  }

  const handleSearch = (txHash: string) => {
    debug(txHash)
  }

  const customJSX = (
    <span className="p-0 m-0">
      <input
        className="form-check-input"
        id="debugGeneratedSourcesInput"
        onChange={({ target: { checked } }) => {
          setState((prevState) => {
            return {
              ...prevState,
              opt: { ...prevState.opt, debugWithGeneratedSources: checked }
            }
          })
        }}
        type="checkbox"
      />
      <label data-id="debugGeneratedSourcesLabel" className="form-check-label" htmlFor="debugGeneratedSourcesInput">
        <FormattedMessage id="debugger.useGeneratedSources" />
        (Solidity {'>='} v0.7.2)
      </label>
    </span>
  )
  return (
    <div style={{ height: '100%' }}>
      <Toaster message={state.toastMessage} />
      {!state.debugging && (
        <div className="pb-2 pt-2" ref={debuggerTopRef}>
          {/* Search Bar */}
          <SearchBar
            onSearch={handleSearch}
            debugging={state.debugging}
            currentTxHash={state.txNumber}
            onStopDebugging={unLoad}
          />

          {/* Informational Text */}
          <div className="debugger-info ms-2 me-2 mb-2">
            <h6 className="search-bar-title mt-3">
              <FormattedMessage id="debugger.startDebugging" defaultMessage="Start debugging a transaction" />
            </h6>
            <div className="mt-2">
              <span>
                Select a past transaction in your transaction history below OR directly paste a transaction hash in the search field to start debugging a transaction. This will automatically import the targetted contracts.
              </span>
            </div>
          </div>

          {/* Validation Error */}
          {state.validationError && <span className="w-100 py-1 text-danger validationError d-block mb-3">{state.validationError}</span>}

          {/* Configuration Options */}
          <div>
            <div className="ms-2 mb-2 debuggerConfig form-check">
              <CustomTooltip tooltipId="debuggerGenSourceCheckbox" tooltipText={<FormattedMessage id="debugger.debugWithGeneratedSources" />} placement="bottom-start">
                {customJSX}
              </CustomTooltip>
            </div>
            {state.isLocalNodeUsed && (
              <div className="mb-2 debuggerConfig form-check">
                <CustomTooltip tooltipId="debuggerGenSourceInput" tooltipText={<FormattedMessage id="debugger.forceToUseCurrentLocalNode" />} placement="right">
                  <input
                    className="form-check-input"
                    id="debugWithLocalNodeInput"
                    onChange={({ target: { checked } }) => {
                      setState((prevState) => {
                        return {
                          ...prevState,
                          opt: { ...prevState.opt, debugWithLocalNode: checked }
                        }
                      })
                    }}
                    type="checkbox"
                  />
                </CustomTooltip>
                <label data-id="debugLocaNodeLabel" className="form-check-label" htmlFor="debugWithLocalNodeInput">
                  <FormattedMessage id="debugger.debugLocaNodeLabel" />
                </label>
              </div>
            )}
          </div>

          {/* Transaction Recorder Section */}
          {transactionRecorderUI}
        </div>
      )}

      {state.debugging && state.sourceLocationStatus && (
        <div className="text-warning mt-3">
          <i className="fas fa-exclamation-triangle" aria-hidden="true"></i> {state.sourceLocationStatus}
        </div>
      )}

      {state.debugging && (
        <div ref={debuggerTopRef} style={{ height: '100%' }}>
          <DebugLayout
            onSearch={handleSearch}
            debugging={state.debugging}
            currentTxHash={state.txNumber}
            onStopDebugging={unLoad}
            currentBlock={state.currentBlock}
            currentReceipt={state.currentReceipt}
            currentTransaction={state.currentTransaction}
            traceData={traceData}
            currentFunction={currentFunction}
            functionStack={functionStack}
            nestedScopes={nestedScopes}
            deployments={deployments}
            onScopeSelected={(scope) => {
              if (debuggerModule.emit) {
                debuggerModule.emit('scopeSelected', scope, deployments)
              }
            }}
            solidityLocals={solidityLocals}
            solidityState={solidityState}
            stepManager={stepManager}
            callTree={callTreeInstance}
            debugWithGeneratedSources={state.opt.debugWithGeneratedSources}
            onDebugWithGeneratedSourcesChange={(checked) => {
              setState((prevState) => {
                return {
                  ...prevState,
                  opt: { ...prevState.opt, debugWithGeneratedSources: checked }
                }
              })
            }}
            onShowOpcodesChange={handleShowOpcodesChange}
            showOpcodes={state.showOpcodes}
            registerEvent={vmDebugger.registerEvent}
          />
        </div>
      )}
    </div>
  )
}

export default DebuggerUI
