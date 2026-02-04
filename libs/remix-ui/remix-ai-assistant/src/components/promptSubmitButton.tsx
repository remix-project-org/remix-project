import React from 'react'

interface PromptSubmitButtonProps {
  backgroundColor: string
  isStreaming: boolean
  handleSend: () => void
  handleCancel?: () => void
}

export function PromptSubmitButton(props: PromptSubmitButtonProps) {

  return (
    <button
      className={`btn btn-sm ${props.isStreaming ? 'bg-danger' : ''}`}
      style={{ backgroundColor: props.isStreaming ? undefined : props.backgroundColor }}
      data-id="remix-ai-composer-send-btn"
      onClick={() => {
        if (props.isStreaming && props.handleCancel) {
          // props.handleCancel()
        } else if (!props.isStreaming) {
          props.handleSend()
        }
      }}
    >
      <i className={`fa ${props.isStreaming ? 'fa-stop' : 'fa-paper-plane-top'} text-light`}></i>
    </button>
  )
}
