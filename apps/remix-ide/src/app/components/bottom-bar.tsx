import React, { useState, useEffect } from 'react'
import { Plugin } from '@remixproject/engine'
import './styles/bottom-bar.css'

interface BottomBarProps {
  plugin: Plugin
}

const SUPPORTED_EXTENSIONS = ['sol', 'vy', 'circom', 'js', 'ts']

export const BottomBar = ({ plugin }: BottomBarProps) => {
  const [explaining, setExplaining] = useState(false)
  const [aiSwitch, setAiSwitch] = useState(true)
  const [currentExt, setCurrentExt] = useState('')
  const [currentFilePath, setCurrentFilePath] = useState('')
  const [isDebugging, setIsDebugging] = useState(false)
  const [isDebuggerActive, setIsDebuggerActive] = useState(false)
  const [stepManager, setStepManager] = useState<any>(null)
  const [stepState, setStepState] = useState<'initial' | 'middle' | 'end'>('initial')
  const [hasRevert, setHasRevert] = useState(false)

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
    if (!currentFilePath) {
      plugin.call('notification', 'toast', 'No file selected to explain.')
      return
    }
    setExplaining(true)
    try {
      // Show right side panel if it's hidden
      const isPanelHidden = await plugin.call('rightSidePanel', 'isPanelHidden')
      if (isPanelHidden) {
        await plugin.call('rightSidePanel', 'togglePanel')
      }

      await plugin.call('menuicons', 'select', 'remixaiassistant')
      await new Promise((resolve) => setTimeout(resolve, 500))
      const content = await plugin.call('fileManager', 'readFile', currentFilePath)
      await plugin.call('remixAI', 'chatPipe', 'code_explaining', content + "\n\nExplain briefly the snipped above!")
    } catch (err) {
      console.error('Explain failed:', err)
    }
    setExplaining(false)
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

  // Show debugger controls when debugging AND debugger plugin is active
  if (isDebugging && isDebuggerActive) {
    return (
      <div className="bottom-bar border-top border-bottom" data-id="bottomBarPanel">
        <div className="debug-controls">
          <button
            className="btn btn-sm btn-secondary debug-btn"
            onClick={() => stepManager?.jumpPreviousBreakpoint && stepManager.jumpPreviousBreakpoint()}
            disabled={stepState === 'initial'}
            data-id="btnJumpPreviousBreakpoint"
          >
            <i className="fas fa-step-backward"></i>
            <span className="btn-label">Previous Breakpoint</span>
          </button>
          <button
            className="btn btn-sm btn-secondary debug-btn"
            onClick={() => stepManager?.stepOverBack && stepManager.stepOverBack(stepManager.showOpcodes ?? false)}
            disabled={stepState === 'initial'}
            data-id="btnStepBackward"
          >
            <i className="fas fa-reply"></i>
            <span className="btn-label">Step Backward</span>
          </button>
          <button
            className="btn btn-sm btn-primary debug-btn"
            onClick={() => stepManager?.stepIntoBack && stepManager.stepIntoBack(stepManager.showOpcodes ?? false)}
            disabled={stepState === 'initial'}
            data-id="btnStepBack"
          >
            <i className="fas fa-level-up-alt"></i>
            <span className="btn-label">Step Back</span>
          </button>
          <button
            className="btn btn-sm btn-primary debug-btn"
            onClick={() => stepManager?.stepIntoForward && stepManager.stepIntoForward(stepManager.showOpcodes ?? false)}
            disabled={stepState === 'end'}
            data-id="btnStepInto"
          >
            <i className="fas fa-level-down-alt"></i>
            <span className="btn-label">Step Into</span>
          </button>
          <button
            className="btn btn-sm btn-secondary debug-btn"
            onClick={() => stepManager?.stepOverForward && stepManager.stepOverForward(stepManager.showOpcodes ?? false)}
            disabled={stepState === 'end'}
            data-id="btnStepForward"
          >
            <i className="fas fa-share"></i>
            <span className="btn-label">Step Forward</span>
          </button>
          <button
            className="btn btn-sm btn-secondary debug-btn"
            onClick={() => stepManager?.jumpNextBreakpoint && stepManager.jumpNextBreakpoint()}
            disabled={stepState === 'end'}
            data-id="btnJumpNextBreakpoint"
          >
            <i className="fas fa-step-forward"></i>
            <span className="btn-label">Next Breakpoint</span>
          </button>
          {hasRevert && (
            <button
              className="btn btn-sm btn-warning debug-btn"
              onClick={() => stepManager?.jumpToException && stepManager.jumpToException()}
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
      <button
        className="btn btn-ai"
        onClick={handleExplain}
        disabled={explaining || !currentFilePath}
        data-id="bottomBarExplainBtn"
      >
        <img src="assets/img/remixAI_small.svg" alt="Remix AI" className="explain-icon" />
        <span>{getExplainLabel()}</span>
      </button>
      <div className="copilot-toggle">
        <span className={aiSwitch ? 'on' : ''}>AI copilot</span>
        <label className="switch" data-id="copilot_toggle">
          <input type="checkbox" checked={aiSwitch} onChange={toggleAI} />
          <span className="slider"></span>
        </label>
      </div>
    </div>
  )
}

export default BottomBar
