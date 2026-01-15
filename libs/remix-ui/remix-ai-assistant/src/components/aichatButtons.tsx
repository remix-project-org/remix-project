import React from 'react'

export function AiChatButtons() {
  const btnList: {
    label: string,
    icon: string,
    color: string,
    action: () => void
  }[] = [
    {
      label: 'Files',
      icon: 'far fa-copy',
      color: 'green',
      action: () => {}
    },
    {
      label: 'Learn',
      icon: 'fas fa-brain',
      color: '',
      action: () => {}
    },
    {
      label: 'Plan a project',
      icon: 'fas fa-list',
      color: '',
      action: () => {}
    },
    {
      label: 'New workspace',
      icon: 'fas fa-plus',
      color: '',
      action: () => {}
    },
    {
      label: 'Deploy',
      icon: 'fakit fa-remixdeploy',
      color: '',
      action: () => {}
    },
    {
      label: 'Generate dapp',
      icon: 'fas fa-jet-fighter',
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
            className="btn btn-remix-dark mb-2 rounded-4 text-nowrap gap-2"
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
            className="btn btn-remix-dark mb-2 rounded-4 text-nowrap ms-1 w-100 text-start"
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
