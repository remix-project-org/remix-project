import React, { useState, useEffect, useContext, useRef, useMemo } from 'react'
import { Plugin } from '@remixproject/engine'
import { DebuggerEvent, MatomoEvent, Features, BottomBarEvent } from '@remix-api';
import { TrackingContext } from '@remix-ide/tracking'
import { CustomTooltip, isQuickDappRemixVMIdentifier, normalizeQuickDappEnvironment } from '@remix-ui/helper'
import { QuickDappContractSelector, QuickDappSetupOptions, QuickDappFigmaPreparationResult } from '@remix-ui/quick-dapp-v2'
import { appActionTypes, AppAction, AppContext, useAuth } from '@remix-ui/app'
import './styles/bottom-bar.css'

interface BottomBarProps {
  plugin: Plugin
}

const SUPPORTED_EXTENSIONS = ['sol', 'vy', 'circom', 'js', 'ts']

export const BottomBar = ({ plugin }: BottomBarProps) => {
  const { appStateDispatch } = useContext(AppContext)
  const { features } = useAuth()
  const hasAuditorPermission = useMemo(() => {
    if (!features) return false
    if (Array.isArray(features)) return features.some((f: any) => f?.feature_name === Features.AI_AUDITOR && f?.is_enabled !== false)
    const entry = (features as Record<string, any>)[Features.AI_AUDITOR]
    if (entry == null) return false
    if (typeof entry === 'boolean') return entry
    return entry?.is_enabled !== false && entry?.allowed !== false
  }, [features])
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = DebuggerEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }
  const [explaining, setExplaining] = useState(false)
  const [aiSwitch, setAiSwitch] = useState(true)
  const [currentExt, setCurrentExt] = useState('')
  const [currentFilePath, setCurrentFilePath] = useState('')
  const [isDebugging, setIsDebugging] = useState(false)
  const [isDebuggerActive, setIsDebuggerActive] = useState(false)
  const [stepManager, setStepManager] = useState<any>(null)
  const [stepState, setStepState] = useState<'initial' | 'middle' | 'end'>('initial')
  const [hasRevert, setHasRevert] = useState(false)
  const [quickDappStartSetup, setQuickDappStartSetup] = useState<{
    contracts: any[]
    primaryContract: any
    matchingContractAddresses: string[]
    environmentId: string
    fixedFrontendMode?: 'inline' | 'workspace'
    sourceFileName: string
  } | null>(null)
  const createDappRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    const getAI = async () => {
      try {
        const initState = await plugin.call('settings', 'getCopilotSetting')
        setAiSwitch(initState ?? true)
      } catch (err) {
        console.error('Failed to get copilot setting', err)
      }
    }

    const handleExtChange = (ext: string) => {
      setCurrentExt(ext || '')
    }

    const handleFileChange = (path: string) => {
      setCurrentFilePath(path || '')
    }

    getAI()

    const onCopilot = (isChecked: boolean) => setAiSwitch(!!isChecked)

    plugin.on('tabs', 'extChanged', handleExtChange)

    plugin.on('settings', 'copilotChoiceUpdated', onCopilot)
    plugin.on('fileManager', 'currentFileChanged', handleFileChange)

    plugin.call('fileManager', 'getCurrentFile').then(path => {
      handleFileChange(path)
      const ext = path?.split('.').pop()?.toLowerCase() || ''
      handleExtChange(ext)
    }).catch(() => {
      handleFileChange('')
      handleExtChange('')
    })

    // Check if debugger is currently active
    const checkDebuggerActive = async () => {
      try {
        const active = await plugin.call('sidePanel', 'currentFocus')
        const isDebugger = active === 'debugger'
        setIsDebuggerActive(isDebugger)
      } catch (err) {
        console.error('Failed to check debugger active state', err)
      }
    }

    checkDebuggerActive()

    // Listen for plugin activation/deactivation
    const onPluginActivated = (name: string) => {
      const isDebugger = name === 'debugger'
      setIsDebuggerActive(isDebugger)
    }

    // Listen for debugger events
    const onDebuggingStarted = async (data: any) => {
      setIsDebugging(true)
      setStepManager(data.stepManager)

      // Re-check if debugger is active when debugging starts
      try {
        // Add a small delay to allow the debugger to activate
        await new Promise(resolve => setTimeout(resolve, 100))
        const active = await plugin.call('sidePanel', 'currentFocus')
        setIsDebuggerActive(active === 'debugger')
      } catch (err) {
        console.error('Failed to check debugger active state on debugging start', err)
      }

      // When debugging starts, always start from 'initial' state (step 0)
      // The stepChanged event will update the state if needed
      setStepState('initial')

      // Register for step changes if available
      if (data.stepManager?.registerEvent) {
        data.stepManager.registerEvent('stepChanged', (step: number) => {
          // Get the latest traceLength
          const length = data.stepManager.traceLength || 0

          if (step === 0) {
            setStepState('initial')
          } else if (length > 0 && step >= length - 1) {
            setStepState('end')
          } else {
            setStepState('middle')
          }
        })

        // Register for revert warnings
        data.stepManager.registerEvent('revertWarning', (message: string) => {
          if (message && message !== '') {
            setHasRevert(true)
          } else {
            setHasRevert(false)
          }
        })
      }
    }

    const onDebuggingStopped = () => {
      setIsDebugging(false)
      setStepManager(null)
      setStepState('initial')
      setHasRevert(false)
    }

    const onShowOpcodesChanged = (showOpcodes: boolean) => {
      setStepManager((prevStepManager: any) => {
        if (!prevStepManager) return null
        return { ...prevStepManager, showOpcodes }
      })
    }

    plugin.on('sidePanel', 'pluginDisabled', onPluginActivated)
    plugin.on('sidePanel', 'focusChanged', onPluginActivated)
    plugin.on('debugger', 'debuggingStarted', onDebuggingStarted)
    plugin.on('debugger', 'debuggingStopped', onDebuggingStopped)
    plugin.on('debugger', 'showOpcodesChanged', onShowOpcodesChanged)

    return () => {
      plugin.off('tabs', 'extChanged')
      plugin.off('fileManager', 'currentFileChanged')
      plugin.off('settings', 'copilotChoiceUpdated')
      plugin.off('sidePanel', 'pluginDisabled')
      plugin.off('sidePanel', 'focusChanged')
      plugin.off('debugger', 'debuggingStarted')
      plugin.off('debugger', 'debuggingStopped')
      plugin.off('debugger', 'showOpcodesChanged')
    }
  }, [plugin])

  const handleExplain = async () => {
    trackMatomoEvent<BottomBarEvent>({ category: 'bottomBar', action: 'explain', isClick: true })
    if (!currentFilePath) {
      plugin.call('notification', 'toast', 'No file selected to explain.')
      return
    }
    setExplaining(true)
    try {
      await openAIAssistant()
      const content = await plugin.call('fileManager', 'readFile', currentFilePath)
      await (plugin as any).call('remixAI', 'chatPipe', 'code_explaining', `File: ${currentFilePath}\n\n${content}\n\nExplain briefly the snippet above!`, undefined, `Explain the code of ${currentFilePath}`, { source: 'bottom-bar', presetId: 'explain-contract' })
    } catch (err) {
      console.error('Explain failed:', err)
    }
    setExplaining(false)
  }

  const openAIAssistant = async () => {
    const isPanelHidden = await plugin.call('rightSidePanel', 'isPanelHidden')
    if (isPanelHidden) {
      await plugin.call('rightSidePanel', 'togglePanel')
    }
    await plugin.call('menuicons', 'select', 'remixaiassistant')
    await (plugin as any).call('remixaiassistant', 'newConversation')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  const handleEditWithAI = async () => {
    trackMatomoEvent<BottomBarEvent>({ category: 'bottomBar', action: 'editWithAI', isClick: true })
    if (!currentFilePath) {
      plugin.call('notification', 'toast', 'No file selected to edit.')
      return
    }
    try {
      await openAIAssistant()
      await (plugin as any).call('remixaiassistant', 'chatPipe', `Help me to edit the file: ${currentFilePath}`, false, { source: 'bottom-bar', presetId: 'edit-file' })
    } catch (err) {
      console.error('Edit with AI failed:', err)
    }
  }

  const getCurrentQuickDappEnvironment = async (): Promise<string> => {
    const providerObject = await plugin.call('blockchain', 'getProviderObject')
    const providerName = providerObject?.name || ''
    if (isQuickDappRemixVMIdentifier(providerName)) {
      return normalizeQuickDappEnvironment(providerName)
    }
    const network = await plugin.call('network', 'detectNetwork')
    return network?.id?.toString() || 'unknown'
  }

  const validateQuickDappStartEnvironment = async (): Promise<string | undefined> => {
    if (!quickDappStartSetup) return 'QuickDapp setup is no longer available. Reopen it and try again.'
    try {
      const currentEnvironment = await getCurrentQuickDappEnvironment()
      if (currentEnvironment !== quickDappStartSetup.environmentId) {
        return 'The network changed while QuickDapp setup was open. Switch back or reopen the setup.'
      }
    } catch (_) {
      return 'Could not confirm the current network. Please try again.'
    }
  }

  const handleCreateDapp = async () => {
    trackMatomoEvent<BottomBarEvent>({ category: 'bottomBar', action: 'createDapp', isClick: true })
    try {
      const currentFileName = currentFilePath?.split('/').pop() || ''

      let sourceIsDappWorkspace = false
      try {
        const currentWs = await plugin.call('filePanel', 'getCurrentWorkspace')
        sourceIsDappWorkspace = currentWs?.name?.startsWith('dapp-') === true
        if (sourceIsDappWorkspace) {
          const providerObject = await plugin.call('blockchain', 'getProviderObject')
          if (isQuickDappRemixVMIdentifier(providerObject?.name)) {
            plugin.call('notification', 'toast', 'Switch to a non-Remix VM network to create a new DApp workspace from an existing DApp workspace.')
            return
          }
        }
      } catch (e) { /* proceed if check fails */ }

      let instances: any[] = []
      try {
        const deployed = await plugin.call('udappDeployedContracts', 'getDeployedContracts') || []
        instances = deployed.filter((c: any) => c?.address && c?.name)
      } catch (e) {
        plugin.call('notification', 'toast', 'Could not check deployed contracts. Please try again.')
        return
      }

      if (instances.length === 0) {
        let environmentName = 'Current environment'
        try {
          const providerObject = await plugin.call('blockchain', 'getProviderObject')
          const providerName = providerObject?.name || ''
          if (providerName.startsWith('vm')) {
            environmentName = 'Remix VM'
          } else {
            const network = await plugin.call('network', 'detectNetwork')
            environmentName = network?.name || providerName || environmentName
          }
        } catch (_) { /* keep fallback */ }
        plugin.call('notification', 'toast', `No deployed contracts found in ${environmentName}. Please deploy a contract first.`)
        return
      }

      let environmentId: string
      try {
        environmentId = await getCurrentQuickDappEnvironment()
      } catch (_) {
        plugin.call('notification', 'toast', 'Could not confirm the current network. Please try again.')
        return
      }

      let matchingInstances: any[] = []
      if (currentFileName && instances.length > 0) {
        matchingInstances = instances.filter((inst: any) => {
          const instFile = inst.contractData?.contract?.file || inst.filePath || ''
          return instFile && instFile.endsWith(currentFileName)
        })
        if (matchingInstances.length === 0) {
          const baseName = currentFileName.replace('.sol', '')
          matchingInstances = instances.filter((inst: any) =>
            baseName.toLowerCase().includes(inst.name?.toLowerCase())
          )
        }
      }

      const primaryContract = matchingInstances[0] || instances[0]
      setQuickDappStartSetup({
        contracts: instances,
        primaryContract,
        matchingContractAddresses: matchingInstances.map((c: any) => c.address.toLowerCase()),
        environmentId,
        fixedFrontendMode: sourceIsDappWorkspace ? 'workspace' : undefined,
        sourceFileName: currentFileName
      })
    } catch (err) {
      console.error('Generate Frontend failed:', err)
      plugin.call('notification', 'toast', 'Could not start DApp creation. Please try again.')
    }
  }

  const handleQuickDappStartConfirm = async (options: QuickDappSetupOptions) => {
    const setup = quickDappStartSetup
    if (!setup) return
    try {
      const currentEnvironment = await getCurrentQuickDappEnvironment()
      if (currentEnvironment !== setup.environmentId) {
        plugin.call('notification', 'toast', 'The network changed while QuickDapp setup was open. Switch back or reopen the setup.')
        return
      }
      setQuickDappStartSetup(null)
      const providerObject = await plugin.call('blockchain', 'getProviderObject')
      const providerName = providerObject?.name || 'vm-unknown'
      let networkName = providerName
      if (!providerName.startsWith('vm')) {
        const network = await plugin.call('network', 'detectNetwork')
        networkName = network?.name || providerName
      }
      const frontendMode = setup.fixedFrontendMode || options.frontendMode
      const primary = options.primaryContract
      const additionalContracts = options.additionalContracts
      const design = options.design || (options.figmaContextId ? 'Match the validated Figma design' : 'Modern dark mode single-page DApp using React and Ethers.js')
      const designSummary = options.figmaContextId ? `Figma: ${options.figmaUrl}` : options.design || 'defaults'
      const setupOptionsSummary = [
        `Location: ${frontendMode === 'inline' ? 'Inline' : 'Workspace'}`,
        `Base mini-app: ${options.isBaseMiniApp ? 'Yes' : 'No'}`,
        `Design: ${designSummary}`,
        `Subgraph: ${options.subgraphFilePath || 'None'}`
      ].join(', ')
      const prompt = `I want to create a DApp frontend. The user confirmed all setup options in the QuickDapp UI. Do not ask the setup question again and do not change the confirmed values.

Confirmed contracts:
- Main: ${primary.name} at ${primary.address}
- Additional: ${additionalContracts.length > 0 ? additionalContracts.map((c: any) => `${c.name} at ${c.address}`).join(', ') : 'None'}

Call generate_dapp now with:
- description: ${JSON.stringify(design)}
- contractName: ${JSON.stringify(primary.name)}
- contractAddress: ${JSON.stringify(primary.address)}
- chainId: ${JSON.stringify(setup.environmentId)}
- additionalContracts: ${additionalContracts.length > 0 ? JSON.stringify(additionalContracts.map((c: any) => ({ contractName: c.name, contractAddress: c.address }))) : 'omit this field'}
- frontendMode: ${JSON.stringify(frontendMode)}
- isBaseMiniApp: ${options.isBaseMiniApp}
- figmaUrl: ${options.figmaUrl ? JSON.stringify(options.figmaUrl) : 'omit this field'}
- figmaContextId: ${options.figmaContextId ? JSON.stringify(options.figmaContextId) : 'omit this field'}
- subgraphFilePath: ${options.subgraphFilePath ? JSON.stringify(options.subgraphFilePath) : 'omit this field'}
- setupOptionsConfirmed: true
- setupOptionsSummary: ${JSON.stringify(setupOptionsSummary)}

For Inline mode, preserve the existing /frontend overwrite confirmation flow.`

      try { await plugin.call('manager', 'activatePlugin', 'remix-ai-assistant') } catch (_) { }
      try { await plugin.call('rightSidePanel', 'focusPanel') } catch (_) { }
      await (plugin as any).call('remixaiassistant', 'chatPipe', prompt, false, {
        source: 'bottom-bar',
        presetId: 'quickdapp-start',
        displayText: `Create a DApp\n${primary.name} · ${networkName} · ${frontendMode === 'inline' ? 'Inline' : 'New workspace'}`
      })
    } catch (error: any) {
      console.error('[QuickDapp] Could not start DApp generation:', error)
      plugin.call('notification', 'toast', 'Could not start DApp generation. Please try again.')
    }
  }

  useEffect(() => {
    createDappRef.current = handleCreateDapp
    ;(plugin as any).__startCreateDapp = () => createDappRef.current()
  })

  const handleSecurityAudit = async () => {
    trackMatomoEvent<BottomBarEvent>({ category: 'bottomBar', action: 'securityAudit', isClick: true })
    if (!hasAuditorPermission) {
      plugin.call('planManager', 'open', { reason: 'feature-required', requiredFeature: Features.AI_AUDITOR })
      return
    }
    if (!currentFilePath) {
      plugin.call('notification', 'toast', 'No file selected for security audit.')
      return
    }
    try {
      await openAIAssistant()
      appStateDispatch({ type: appActionTypes.showChecklistModal, payload: 'audit' })
    } catch (err) {
      console.error('Security audit failed:', err)
    }
  }

  const handleGasAudit = async () => {
    trackMatomoEvent<BottomBarEvent>({ category: 'bottomBar', action: 'gasAudit', isClick: true })
    if (!hasAuditorPermission) {
      plugin.call('planManager', 'open', { reason: 'feature-required', requiredFeature: Features.AI_AUDITOR })
      return
    }
    if (!currentFilePath) {
      plugin.call('notification', 'toast', 'No file selected for gas audit.')
      return
    }
    try {
      await openAIAssistant()
      const prompt = `Perform a gas optimization audit of the following smart contract.${currentFilePath} Identify inefficient patterns, unnecessary storage operations, and suggest concrete optimizations to reduce transaction costs. At the end, mention that a more thorough and complete gas audit with deeper analysis and detailed recommendations is available in the Remix Pro plan.`
      await (plugin as any).call('remixaiassistant', 'chatPipe', prompt, false, { displayText: 'audit gas ' + currentFilePath, source: 'bottom-bar', presetId: 'gas-audit' })
    } catch (err) {
      console.error('Gas audit failed:', err)
    }
  }

  const toggleAI = async () => {
    try {
      await plugin.call('settings', 'updateCopilotChoice', !aiSwitch)
      setAiSwitch(!aiSwitch)
    } catch (err) {
      console.error('Failed to toggle AI copilot', err)
    }
  }

  const getExplainLabel = () => {
    if (['sol', 'vy', 'circom'].includes(currentExt)) return 'Explain contract'
    if (['js', 'ts'].includes(currentExt)) return 'Explain script'
    return ''
  }

  const getEditLabel = () => {
    if (['sol', 'vy', 'circom'].includes(currentExt)) return 'Edit contract'
    if (['js', 'ts'].includes(currentExt)) return 'Edit script'
    return 'Edit file'
  }

  // Show debugger controls when debugging AND debugger plugin is active
  if (isDebugging && isDebuggerActive) {
    return (
      <div className="bottom-bar border-top border-bottom" data-id="bottomBarPanel">
        <div className="debug-controls">
          <button
            className="btn btn-sm btn-secondary debug-btn"
            onClick={() => {
              trackMatomoEvent({ category: 'debugger', action: 'stepButton', value: `Previous Breakpoint clicked`, isClick: true })
              stepManager?.jumpPreviousBreakpoint && stepManager.jumpPreviousBreakpoint()
            }
            }
            disabled={stepState === 'initial'}
            data-id="btnJumpPreviousBreakpoint"
          >
            <i className="fas fa-step-backward"></i>
            <span className="btn-label">Previous Breakpoint</span>
          </button>
          <button
            className="btn btn-sm btn-secondary debug-btn"
            onClick={() => {
              trackMatomoEvent({ category: 'debugger', action: 'stepButton', value: `Step Backward clicked`, isClick: true })
              stepManager?.stepOverBack && stepManager.stepOverBack(stepManager.showOpcodes ?? false)
            }
            }
            disabled={stepState === 'initial'}
            data-id="btnStepBackward"
          >
            <i className="fas fa-reply"></i>
            <span className="btn-label">Step Backward</span>
          </button>
          <button
            className="btn btn-sm btn-primary debug-btn"
            onClick={() => {
              trackMatomoEvent({ category: 'debugger', action: 'stepButton', value: `Step Back clicked`, isClick: true })
              stepManager?.stepIntoBack && stepManager.stepIntoBack(stepManager.showOpcodes ?? false)
            }
            }
            disabled={stepState === 'initial'}
            data-id="btnStepBack"
          >
            <i className="fas fa-level-up-alt"></i>
            <span className="btn-label">Step Back</span>
          </button>
          <button
            className="btn btn-sm btn-primary debug-btn"
            onClick={() => {
              trackMatomoEvent({ category: 'debugger', action: 'stepButton', value: `Step Into clicked`, isClick: true })
              stepManager?.stepIntoForward && stepManager.stepIntoForward(stepManager.showOpcodes ?? false)
            }
            }
            disabled={stepState === 'end'}
            data-id="btnStepInto"
          >
            <i className="fas fa-level-down-alt"></i>
            <span className="btn-label">Step Into</span>
          </button>
          <button
            className="btn btn-sm btn-secondary debug-btn"
            onClick={() => {
              trackMatomoEvent({ category: 'debugger', action: 'stepButton', value: `Step Forward clicked`, isClick: true })
              stepManager?.stepOverForward && stepManager.stepOverForward(stepManager.showOpcodes ?? false)
            }
            }
            disabled={stepState === 'end'}
            data-id="btnStepForward"
          >
            <i className="fas fa-share"></i>
            <span className="btn-label">Step Forward</span>
          </button>
          <button
            className="btn btn-sm btn-secondary debug-btn"
            onClick={() => {
              trackMatomoEvent({ category: 'debugger', action: 'stepButton', value: `Next Breakpoint clicked`, isClick: true })
              stepManager?.jumpNextBreakpoint && stepManager.jumpNextBreakpoint()
            }
            }
            disabled={stepState === 'end'}
            data-id="btnJumpNextBreakpoint"
          >
            <i className="fas fa-step-forward"></i>
            <span className="btn-label">Next Breakpoint</span>
          </button>
          {hasRevert && (
            <button
              className="btn btn-sm btn-warning debug-btn"
              onClick={() => {
                trackMatomoEvent({ category: 'debugger', action: 'stepButton', value: `Jump to Revert clicked`, isClick: true })
                stepManager?.jumpToException && stepManager.jumpToException()
              }
              }
              data-id="btnJumpToRevert"
            >
              <i className="fas fa-undo"></i>
              <span className="btn-label">Jump to Revert</span>
            </button>
          )}
        </div>
      </div>
    )
  }

  // Show explain contract button when not debugging
  if (!SUPPORTED_EXTENSIONS.includes(currentExt)) {
    return null
  }

  return (
    <div className="bottom-bar border-top border-bottom" data-id="bottomBarPanel">
      <div className="bottom-bar-ai-actions">
        <CustomTooltip placement="top" tooltipText="Edit your code with AI assistance">
          <button
            className="btn btn-ai"
            onClick={handleEditWithAI}
            disabled={!currentFilePath}
            data-id="bottomBarEditWithAIBtn"
          >
            <i className="fas fa-edit"></i>
            <span>{getEditLabel()}</span>
          </button>
        </CustomTooltip>
        <CustomTooltip placement="top" tooltipText="Explain your code with AI assistance">
          <button
            className="btn btn-ai"
            onClick={handleExplain}
            disabled={explaining || !currentFilePath}
            data-id="bottomBarExplainBtn"
          >
            <img src="assets/img/remixAI_small.svg" alt="Remix AI" className="explain-icon" />
            <span>{getExplainLabel()}</span>
          </button>
        </CustomTooltip>
        <CustomTooltip placement="top" tooltipText="Generate a frontend from your deployed contract with AI assistance">
          <button
            className="btn btn-ai"
            onClick={handleCreateDapp}
            disabled={!currentFilePath}
            data-id="bottomBarCreateDappBtn"
          >
            <i className="fas fa-rocket"></i>
            <span>Generate Frontend</span>
          </button>
        </CustomTooltip>
        <CustomTooltip placement="top" tooltipText={hasAuditorPermission ? 'Scan your contract for security vulnerabilities with AI assistance' : 'Security Audit requires the AI Auditor feature — upgrade your plan'}>
          <button
            className="btn btn-ai"
            onClick={handleSecurityAudit}
            disabled={!currentFilePath && hasAuditorPermission}
            data-id="bottomBarSecurityAuditBtn"
          >
            <i className="fas fa-shield-alt"></i>
            <span>Security Audit</span>
            {!hasAuditorPermission && <i className="fas fa-lock ms-1" style={{ fontSize: '0.7rem' }}></i>}
          </button>
        </CustomTooltip>
        <CustomTooltip placement="top" tooltipText={hasAuditorPermission ? 'Analyze your contract for gas inefficiencies with AI assistance' : 'Gas Audit requires the AI Auditor feature — upgrade your plan'}>
          <button
            className="btn btn-ai"
            onClick={handleGasAudit}
            disabled={!currentFilePath && hasAuditorPermission}
            data-id="bottomBarGasAuditBtn"
          >
            <i className="fas fa-gas-pump"></i>
            <span>Gas Audit</span>
            {!hasAuditorPermission && <i className="fas fa-lock ms-1" style={{ fontSize: '0.7rem' }}></i>}
          </button>
        </CustomTooltip>
      </div>
      <div className="copilot-toggle">
        <span className={aiSwitch ? 'on' : ''}>AI copilot</span>
        <label className="switch" data-id="copilot_toggle">
          <input type="checkbox" checked={aiSwitch} onChange={toggleAI} />
          <span className="slider"></span>
        </label>
      </div>
      {quickDappStartSetup && (
        <QuickDappContractSelector
          show
          primaryContract={quickDappStartSetup.primaryContract}
          deployedContracts={quickDappStartSetup.contracts}
          primarySelectable
          matchingContractAddresses={quickDappStartSetup.matchingContractAddresses}
          sourceFileName={quickDappStartSetup.sourceFileName}
          fixedFrontendMode={quickDappStartSetup.fixedFrontendMode}
          onCancel={() => setQuickDappStartSetup(null)}
          onPrepareFigma={async (figmaUrl: string, figmaToken: string): Promise<QuickDappFigmaPreparationResult> => {
            const validationError = await validateQuickDappStartEnvironment()
            if (validationError) return { success: false, message: validationError }
            return await (plugin as any).call('quick-dapp-v2', 'prepareFigmaDesign', figmaUrl, figmaToken) as QuickDappFigmaPreparationResult
          }}
          onConfirm={handleQuickDappStartConfirm}
        />
      )}
    </div>
  )
}

export default BottomBar
