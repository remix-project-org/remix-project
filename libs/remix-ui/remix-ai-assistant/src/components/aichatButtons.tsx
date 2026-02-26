import React, { useState, useEffect } from 'react'

interface AiChatButtonsProps {
  theme: string
  plugin?: any
  sendPrompt: (s: string) => void
  handleGenerateWorkspace: () => void
}

export function AiChatButtons({ theme, plugin, sendPrompt, handleGenerateWorkspace }: AiChatButtonsProps) {
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
      sendPrompt(`Review the file ${fileName}`)
    }
  }

  const dynamicButtons: {
    label: string,
    icon: string,
    color: string,
    action: () => void
  }[] = []

  if (currentFile) {
    const fileName = currentFile.split('/').pop() || currentFile
    dynamicButtons.push({
      label: `Review ${fileName}`,
      icon: `${theme?.toLowerCase() === 'dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fas fa-search`,
      color: '',
      action: handleReviewFile
    })
  }

  if (latestCompiledContracts && latestCompiledContracts.length > 0) {
    for (const contract of latestCompiledContracts) {
      dynamicButtons.push({
        label: `Deploy ${contract}`,
        icon: `${theme?.toLowerCase() === 'dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fas fa-rocket`,
        color: '',
        action: () => sendPrompt(`Deploy the ${contract} contract`)
      })
    }
  }

  const btnList: {
    label: string,
    icon: string,
    color: string,
    action: () => void
  }[] = [
    {
      label: 'File',
      icon: `${theme?.toLowerCase() === 'dark' ? 'text-remix-ai' : 'text-remix-ai-light'} far fa-copy`,
      color: '',
      action: () => sendPrompt('Create a new file')
    },
    {
      label: 'New workspace',
      icon: `${theme?.toLowerCase() === 'dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fas fa-plus`,
      color: '',
      action: handleGenerateWorkspace
    },
    {
      label: 'Explore RemixAI capabilities',
      icon: `${theme?.toLowerCase() === 'dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fas fa-magic`,
      color: '',
      action: () => {
        sendPrompt('Sum up a list of all the MCP endpoints and their functionalities in a concise manner. Propose a few prompts I can use to enhance my workflow.')
        plugin.call('rightSidePanel', 'maximizePanel')
      }
    },
    {
      label: 'Start Learning',
      icon: `${theme?.toLowerCase() === 'dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fas fa-graduation-cap`,
      color: '',
      action: () => {
        sendPrompt('I would like to learn Web3 development. Can you create a learning path for me with resources and projects to work on?')
        plugin.call('rightSidePanel', 'maximizePanel')
      }
    },
    {
      label: 'Create a Dapp',
      icon: `${theme?.toLowerCase() === 'dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fas fa-cube`,
      color: '',
      action: async () => {
        await plugin.call('manager', 'activatePlugin', 'quick-dapp-v2')
        plugin.call('tabs', 'focus', 'quick-dapp-v2')
      }
    },
    ...dynamicButtons
  ]

  return (
    <div className="d-flex flex-column mt-3" style={{ maxWidth: '400px' }}>
      <div className="d-flex flex-row flex-wrap gap-1 justify-content-center">
        {btnList.map((starter, index) => (
          <button
            key={`${starter.label}-${index}`}
            data-id={`remix-ai-assistant-starter-${starter.label}-${index}`}
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
