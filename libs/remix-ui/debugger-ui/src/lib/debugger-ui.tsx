import React, {useState, useEffect, useRef, useContext} from 'react' // eslint-disable-line
import { FormattedMessage, useIntl } from 'react-intl'
import TxBrowser from './tx-browser/tx-browser' // eslint-disable-line
import StepManager from './step-manager/step-manager' // eslint-disable-line
import VmDebugger from './vm-debugger/vm-debugger' // eslint-disable-line
import VmDebuggerHead from './vm-debugger/vm-debugger-head' // eslint-disable-line
import {TransactionDebugger as Debugger} from '@remix-project/remix-debug' // eslint-disable-line
import {DebuggerUIProps} from './idebugger-api' // eslint-disable-line
import {Toaster} from '@remix-ui/toaster' // eslint-disable-line
import { CustomTooltip, isValidHash } from '@remix-ui/helper'
import { DebuggerEvent, MatomoEvent } from '@remix-api';
import { TrackingContext } from '@remix-ide/tracking'
/* eslint-disable-next-line */
import './debugger-ui.css'

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
    sourceLocationStatus: ''
  })

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

  const panelsRef = useRef<HTMLDivElement>(null)
  const debuggerTopRef = useRef(null)

  const handleResize = () => {
    if (panelsRef.current && debuggerTopRef.current) {
      panelsRef.current.style.height = window.innerHeight - debuggerTopRef.current.clientHeight - debuggerTopRef.current.offsetTop - 7 + 'px'
    }
  }

  useEffect(() => {
    handleResize()
  }, [])

  useEffect(() => {
    window.addEventListener('resize', handleResize)
    // TODO: not a good way to wait on the ref doms element to be rendered of course
    setTimeout(() => handleResize(), 2000)
    return () => window.removeEventListener('resize', handleResize)
  }, [state.debugging, state.isActive])

  useEffect(() => {
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

    debuggerInstance.event.register('newSourceLocation', async (lineColumnPos, rawLocation, generatedSources, address, stepDetail, lineGasCost) => {
      if (!lineColumnPos) {
        await debuggerModule.discardHighlight()
        setState((prevState) => {
          return {
            ...prevState,
            sourceLocationStatus: intl.formatMessage({ id: 'debugger.sourceLocationStatus2' })
          }
        })
        return
      }
      const contracts = await debuggerModule.fetchContractAndCompile(address || currentReceipt.contractAddress || currentReceipt.to, currentReceipt)
      if (contracts) {
        let path = contracts.getSourceName(rawLocation.file)
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
          await debuggerModule.highlight(lineColumnPos, path, rawLocation, stepDetail, lineGasCost)
        }
      }
    })

    debuggerInstance.event.register('debuggerUnloaded', () => unLoad())
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
      debugWithGeneratedSources: state.opt.debugWithGeneratedSources
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
    handleResize()

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
    registerEvent: state.debugger && state.debugger.step_manager ? state.debugger.step_manager.event.register.bind(state.debugger.step_manager.event) : null
  }

  const vmDebugger = {
    registerEvent: state.debugger && state.debugger.vmDebuggerLogic ? state.debugger.vmDebuggerLogic.event.register.bind(state.debugger.vmDebuggerLogic.event) : null,
    triggerEvent: state.debugger && state.debugger.vmDebuggerLogic ? state.debugger.vmDebuggerLogic.event.trigger.bind(state.debugger.vmDebuggerLogic.event) : null
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
    <div>
      <Toaster message={state.toastMessage} />
      <div className="px-2 pb-3" ref={debuggerTopRef}>
        <div>
          <div className="mt-2 mb-2 debuggerConfig form-check">
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
          {state.validationError && <span className="w-100 py-1 text-danger validationError">{state.validationError}</span>}
        </div>
        <TxBrowser
          requestDebug={requestDebug}
          unloadRequested={unloadRequested}
          updateTxNumberFlag={updateTxNumberFlag}
          transactionNumber={state.txNumber}
          debugging={state.debugging}
        />
        {state.debugging && state.sourceLocationStatus && (
          <div className="text-warning">
            <i className="fas fa-exclamation-triangle" aria-hidden="true"></i> {state.sourceLocationStatus}
          </div>
        )}
        {!state.debugging && (
          <div>
            <i className="fas fa-info-triangle" aria-hidden="true"></i>
            <span>
              <FormattedMessage id="debugger.introduction" />:{' '}
              <a href="https://docs.sourcify.dev/docs/chains/" target="__blank">
                <FormattedMessage id="debugger.sourcifyDocs" />
              </a>{' '}
              &{' '}
              <a href="https://etherscan.io/contractsVerified" target="__blank">
                https://etherscan.io/contractsVerified
              </a>
            </span>
          </div>
        )}
        {state.debugging && <StepManager stepManager={stepManager} />}
      </div>
      <div className="debuggerPanels" ref={panelsRef}>
        {state.debugging && <VmDebuggerHead debugging={state.debugging} vmDebugger={vmDebugger} stepManager={stepManager} />}
        {state.debugging && (
          <VmDebugger
            debugging={state.debugging}
            vmDebugger={vmDebugger}
            currentBlock={state.currentBlock}
            currentReceipt={state.currentReceipt}
            currentTransaction={state.currentTransaction}
          />
        )}
        <div id="bottomSpacer" className="p-1 mt-3"></div>
      </div>
    </div>
  )
}

export default DebuggerUI
