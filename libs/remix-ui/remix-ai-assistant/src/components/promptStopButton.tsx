import React from 'react'

interface PromptStopButtonProps {
  backgroundColor: string
  isStreaming: boolean
  handleCancel: () => void
}

export function PromptStopButton(props: PromptStopButtonProps) {

  return (
    <button
      className={`btn btn-sm ${props.isStreaming ? 'bg-danger' : ''}`}
      style={{ backgroundColor: props.isStreaming ? undefined : props.backgroundColor }}
      data-id="remix-ai-composer-send-btn"
      onClick={() => {
        if (props.isStreaming) {
          props.handleCancel()
        }
      }}
    >
      <i className={`fa ${props.isStreaming ? 'fa-stop text-light' : ''}`}></i>
    </button>
  )
}
