import React from 'react'

interface AiChatButtonsProps {
  theme: string
}

export function AiChatButtons({ theme }: AiChatButtonsProps) {
  const btnList: {
    label: string,
    icon: string,
    color: string,
    action: () => void
  }[] = [
    {
      label: 'File',
      icon: `${theme === 'Dark' ? 'text-remix-ai' : 'text-remix-ai-light'} far fa-copy`,
      color: 'green',
      action: () => {}
    },
    {
      label: 'Learn',
      icon: `${theme === 'Dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fas fa-brain`,
      color: '',
      action: () => {}
    },
    {
      label: 'Plan a project',
      icon: `${theme === 'Dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fas fa-list`,
      color: '',
      action: () => {}
    },
    {
      label: 'New workspace',
      icon: `${theme === 'Dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fas fa-plus`,
      color: '',
      action: () => {}
    },
    {
      label: 'Deploy',
      icon: `${theme === 'Dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fakit fa-remixdeploy`,
      color: '',
      action: () => {}
    },
    {
      label: 'Generate dapp',
      icon: `${theme === 'Dark' ? 'text-remix-ai' : 'text-remix-ai-light'} fas fa-jet-fighter`,
      color: '',
      action: () => {}
    }
  ]

  return (
    <div className="d-flex flex-column mt-3" style={{ maxWidth: '400px' }}>
      <div className="d-flex flex-row gap-1 justify-content-center">
        {btnList.slice(0,3).map((starter, index) => (
          <button
            key={`${starter.label}-${index}`}
            data-id={`remix-ai-assistant-starter-${starter.label}-${index}`}
            className={`${theme === 'Dark' ? 'btn btn-remix-dark' : 'btn btn-remix-light'} mb-2 border rounded-4 text-nowrap gap-2`}
            onClick={() => {}}
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
            className={`${theme === 'Dark' ? 'btn btn-remix-dark' : 'btn btn-remix-light'} mb-2 border rounded-4 text-nowrap gap-2`}
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
