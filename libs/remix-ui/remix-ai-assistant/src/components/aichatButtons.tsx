import React from 'react'

interface AiChatButtonsProps {
  theme: string
  plugin?: any
  sendPrompt: (s: string) => void
}

export function AiChatButtons({ theme, plugin, sendPrompt }: AiChatButtonsProps) {

  const statusCallback = (status: string): Promise<void> => {
    console.log('status', status)
    plugin.call('remixaiassistant', 'handleExternalMessage', status)
    return Promise.resolve()
  }
  const result = plugin?.call('remixAI' as any, 'basic_prompt', '')
  const btnList: {
    label: string,
    icon: string,
    color: string,
    action: () => void
  }[] = [
    {
      label: 'File',
      icon: `${theme?.toLowerCase() === 'dark' ? 'text-remix-ai' : 'text-remix-ai-light'} far fa-copy`,
      color: 'green',
      action: async () => {
        // plugin && await plugin.call('remixAI' as any, 'basic_prompt', 'Create a file for me')
        sendPrompt('Create a file for me')
        // plugin && await plugin.call('remixaiassistant', 'handleExternalMessage', 'Create a file for me')
      }
    },
    {
      label: 'Learn',
      icon: `${theme?.toLowerCase() === 'dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fas fa-brain`,
      color: '',
      action: () => {
        sendPrompt('I would like to learn about something...')
      }
    },
    {
      label: 'Plan a project',
      icon: `${theme?.toLowerCase() === 'dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fas fa-list`,
      color: '',
      action: () => {
        sendPrompt('Plan a new project')
      }
    },
    {
      label: 'New workspace',
      icon: `${theme?.toLowerCase() === 'dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fas fa-plus`,
      color: '',
      action: () => {
        sendPrompt('Create a new workspace')
      }
    },
    {
      label: 'Deploy',
      icon: `${theme?.toLowerCase() === 'dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fakit fa-remixdeploy`,
      color: '',
      action: () => {
        sendPrompt('Deploy a contract')
      }
    },
    {
      label: 'Generate dapp',
      icon: `${theme?.toLowerCase() === 'dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fas fa-jet-fighter`,
      color: '',
      action: () => {
        sendPrompt('Create a Dapp')
        console.log('Generate Dapp')
      }
    }
  ]

  return (
    <div className="d-flex flex-column mt-3" style={{ maxWidth: '400px' }}>
      <div className="d-flex flex-row gap-1 justify-content-center">
        {btnList.slice(0,3).map((starter, index) => (
          <button
            key={`${starter.label}-${index}`}
            data-id={`remix-ai-assistant-starter-${starter.label}-${index}`}
            className={`mb-2 border-0 rounded-4 text-nowrap gap-2 btn btn-lg btn-light`}
            // style={{ backgroundColor: theme?.toLowerCase() === 'dark' ? 'btn btn-lg p-2 btn-light' : 'btn btn-lg p-2 btn-dark' }}
            onClick={starter.action}
          >
            <i className={`${starter.icon} me-1`}></i>
            {starter.label}
          </button>
        ))}
      </div>
      <div className="d-flex justify-content-between w-100">
        {btnList.slice(3).map((starter, index) => (
          <button
            key={`${starter.label}-${index}`}
            data-id={`remix-ai-assistant-starter-${starter.label}-${index}`}
            className={`mb-2 border-0 rounded-4 text-nowrap gap-2 btn btn-lg btn-light`}
            // style={{ backgroundColor: theme?.toLowerCase() === 'dark' ? 'btn btn-lg p-2 btn-light' : 'btn btn-lg btn-dark p-2' }}
            onClick={() => {}}
          >
            <i className={`${starter.icon} me-1`}></i>
            {starter.label}
          </button>
        ))}
      </div>
    </div>
  )
}
