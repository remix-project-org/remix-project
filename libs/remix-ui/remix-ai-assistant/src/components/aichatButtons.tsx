import React, { useState, useEffect, useCallback } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { trackMatomoEvent } from '@remix-api'

interface AiChatButtonsProps {
  theme: string
  plugin?: any
  sendPrompt: (s: string) => void
  handleGenerateWorkspace: () => void
  handleLoadSkills: () => void
  allowedMcps: string[]
}

export function AiChatButtons({ theme, plugin, sendPrompt, handleGenerateWorkspace, handleLoadSkills, allowedMcps }: AiChatButtonsProps) {
  const intl = useIntl()
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [latestCompiledContracts, setLatestCompiledContracts] = useState<string[] | null>(null)

  useEffect(() => {
    if (!plugin) return

    const updateState = async () => {
      try {
        const file = await plugin.call('fileManager', 'getCurrentFile')
        setCurrentFile(file)
      } catch (error) {
        setCurrentFile(null)
      }

      try {
        const currentFile = await plugin.call('fileManager', 'getCurrentFile')
        if (!currentFile) {
          setLatestCompiledContracts(null)
          return
        }
        const compilationResult = await plugin.call('solidity', 'getCompilationResult')
        if (compilationResult && compilationResult.data && compilationResult.data.contracts) {
          const contracts = Object.keys(compilationResult.data.contracts[currentFile] || {})
          if (contracts && contracts.length > 0) {
            setLatestCompiledContracts(contracts)
          } else {
            setLatestCompiledContracts(null)
          }
        }
      } catch (error) {
        setLatestCompiledContracts(null)
      }
    }

    updateState()
    const interval = setInterval(updateState, 2000)
    return () => {
      clearInterval(interval)
    }
  }, [plugin])

  const handleReviewFile = () => {
    if (currentFile) {
      const fileName = currentFile.split('/').pop() || currentFile
      sendPrompt(intl.formatMessage({ id: 'remixApp.aiChatPrompt.reviewFile' }, { fileName }))
      trackMatomoEvent(plugin, { category: 'ai', action: 'conv_starter', name: 'review_file', value: fileName, isClick: true })
    }
  }

  const dynamicButtons: {
    label: React.ReactElement,
    icon: string,
    color: string,
    action: () => void
  }[] = []

  if (currentFile) {
    const fileName = currentFile.split('/').pop() || currentFile
    dynamicButtons.push({
      label: <FormattedMessage id="remixApp.aiChatButton.reviewFile" values={{ fileName }} />,
      icon: `${theme?.toLowerCase() === 'dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fas fa-search`,
      color: '',
      action: handleReviewFile
    })
  }

  if (latestCompiledContracts && latestCompiledContracts.length > 0) {
    for (const contract of latestCompiledContracts) {
      dynamicButtons.push({
        label: <FormattedMessage id="remixApp.aiChatButton.deployContract" values={{ contractName: contract }} />,
        icon: `${theme?.toLowerCase() === 'dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fas fa-rocket`,
        color: '',
        action: () => {
          sendPrompt(intl.formatMessage({ id: 'remixApp.aiChatPrompt.deployContract' }, { contractName: contract }))
          trackMatomoEvent(plugin, { category: 'ai', action: 'conv_starter', name: 'deploy_contract', value: contract, isClick: true })
        }
      })
    }
  }

  const handleActionClick = useCallback(() => {
    if (document.querySelector('[data-id="maximizeRightSidePanel"]')) {
      plugin.call('rightSidePanel', 'maximizePanel')
    }
  }, [])

  const btnList: {
    label: React.ReactElement,
    icon: string,
    color: string,
    action: () => void
  }[] = [
    {
      label: <FormattedMessage id="remixApp.aiChatButton.file" />,
      icon: `${theme?.toLowerCase() === 'dark' ? 'text-remix-ai' : 'text-remix-ai-light'} far fa-copy`,
      color: '',
      action: () => {
        sendPrompt(intl.formatMessage({ id: 'remixApp.aiChatPrompt.createFile' }))
        trackMatomoEvent(plugin, { category: 'ai', action: 'conv_starter', name: 'create_file', isClick: true })
      }
    },
    {
      label: <FormattedMessage id="remixApp.aiChatButton.newWorkspace" />,
      icon: `${theme?.toLowerCase() === 'dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fas fa-plus`,
      color: '',
      action: () => {
        handleGenerateWorkspace()
        trackMatomoEvent(plugin, { category: 'ai', action: 'conv_starter', name: 'new_workspace', isClick: true })
      }
    },
    {
      label: <FormattedMessage id="remixApp.aiChatButton.exploreCapabilities" />,
      icon: `${theme?.toLowerCase() === 'dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fas fa-magic`,
      color: '',
      action: () => {
        handleActionClick()
        sendPrompt(intl.formatMessage({ id: 'remixApp.aiChatPrompt.exploreCapabilities' }))
        trackMatomoEvent(plugin, { category: 'ai', action: 'conv_starter', name: 'explore_capabilities', isClick: true })
      }
    },
    {
      label: <FormattedMessage id="remixApp.aiChatButton.loadSkills" />,
      icon: `${theme?.toLowerCase() === 'dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fas fa-cube`,
      color: '',
      action: () => {
        handleLoadSkills()
        trackMatomoEvent(plugin, { category: 'ai', action: 'conv_starter', name: 'load_skills', isClick: true })
      }
    },
    {
      label: <FormattedMessage id="remixApp.aiChatButton.startLearning" />,
      icon: `${theme?.toLowerCase() === 'dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fas fa-graduation-cap`,
      color: '',
      action: () => {
        sendPrompt(intl.formatMessage({ id: 'remixApp.aiChatPrompt.startLearning' }))
        trackMatomoEvent(plugin, { category: 'ai', action: 'conv_starter', name: 'start_learning', isClick: true })
      }
    },{
      label: <FormattedMessage id="remixApp.aiChatButton.ethernews" />,
      icon: `${theme?.toLowerCase() === 'dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fas fa-graduation-cap`,
      color: '',
      action: () => {
        handleActionClick()
        sendPrompt(intl.formatMessage({ id: 'remixApp.aiChatPrompt.ethernews' }))
        trackMatomoEvent(plugin, { category: 'ai', action: 'conv_starter', name: 'ether_news', isClick: true })
      }
    },
    {
      label: <FormattedMessage id="remixApp.aiChatButton.createDapp" />,
      icon: `${theme?.toLowerCase() === 'dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fas fa-cube`,
      color: '',
      action: async () => {
        await plugin.call('manager', 'activatePlugin', 'quick-dapp-v2')
        plugin.call('tabs', 'focus', 'quick-dapp-v2')
        trackMatomoEvent(plugin, { category: 'ai', action: 'conv_starter', name: 'create_dapp', isClick: true })
      }
    }
  ]

  if (allowedMcps.includes('mcpBasicExternal')) {
    btnList.push({
      label: <FormattedMessage id="remixApp.aiChatButton.etherscan" />,
      icon: `${theme?.toLowerCase() === 'dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fas fa-cube`,
      color: '',
      action: async () => {
        sendPrompt(intl.formatMessage({ id: 'remixApp.aiChatPrompt.etherscan' }))
        trackMatomoEvent(plugin, { category: 'ai', action: 'conv_starter', name: 'etherscan', isClick: true })
      }
    })
    btnList.push({
      label: <FormattedMessage id="remixApp.aiChatButton.thegraph" />,
      icon: `${theme?.toLowerCase() === 'dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fas fa-cube`,
      color: '',
      action: async () => {
        sendPrompt(intl.formatMessage({ id: 'remixApp.aiChatPrompt.thegraph' }))
        trackMatomoEvent(plugin, { category: 'ai', action: 'conv_starter', name: 'thegraph', isClick: true })
      }
    })
    btnList.push({
      label: <FormattedMessage id="remixApp.aiChatButton.alchemy" />,
      icon: `${theme?.toLowerCase() === 'dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fas fa-cube`,
      color: '',
      action: async () => {
        sendPrompt(intl.formatMessage({ id: 'remixApp.aiChatPrompt.alchemy' }))
        trackMatomoEvent(plugin, { category: 'ai', action: 'conv_starter', name: 'alchemy', isClick: true })
      }
    })
  }

  btnList.push(...dynamicButtons)

  return (
    <div className="d-flex flex-column mt-3" style={{ maxWidth: '400px' }}>
      <div className="d-flex flex-row flex-wrap gap-1 justify-content-center">
        {btnList.map((starter, index) => (
          <button
            key={index}
            data-id={`remix-ai-assistant-starter-${index}`}
            className={`mb-2 border-0 rounded-4 text-nowrap gap-2 btn ${theme?.toLowerCase() === 'dark' ? 'btn-dark' : 'btn-light text-light-emphasis'} `}
            onClick={starter.action}
          >
            <i className={`${starter.icon} me-1`}></i>
            {starter.label}
          </button>
        ))}
      </div>
    </div>
  )
}
