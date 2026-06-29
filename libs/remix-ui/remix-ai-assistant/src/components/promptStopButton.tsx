import React from 'react'

interface PromptStopButtonProps {
  backgroundColor: string
  isStreaming: boolean
  handleCancel: () => void
}

export function PromptStopButton(props: PromptStopButtonProps) {

  return (
    <button
      className={`btn btn-sm d-flex align-items-center justify-content-center ${props.isStreaming ? 'bg-danger' : ''}`}
      style={{ backgroundColor: props.isStreaming ? undefined : props.backgroundColor }}
      data-id="remix-ai-composer-send-btn"
      onClick={() => {
        // Always call handleCancel when clicked - don't check isStreaming here
        props.handleCancel()
      }}
    >
      <i className={`fa ${props.isStreaming ? 'fa-stop text-light' : ''}`}></i>
    </button>
  )
}
