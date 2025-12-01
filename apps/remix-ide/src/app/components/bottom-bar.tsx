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

    return () => {
      plugin.off('tabs', 'extChanged')
      plugin.off('fileManager', 'currentFileChanged')
      plugin.off('settings', 'copilotChoiceUpdated')
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
