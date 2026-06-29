import React from 'react'

interface PromptSubmitButtonProps {
  backgroundColor: string
  isStreaming: boolean
  handleSend: () => void
  handleCancel?: () => void
  disabled?: boolean
}

export function PromptSubmitButton(props: PromptSubmitButtonProps) {

  return (
    <button
      className={`btn btn-sm d-flex justify-content-center align-items-center ${props.isStreaming ? 'bg-danger' : ''}`}
      style={{
        backgroundColor: props.isStreaming ? undefined : props.backgroundColor,
        opacity: props.disabled && !props.isStreaming ? 0.5 : 1,
        cursor: props.disabled && !props.isStreaming ? 'not-allowed' : 'pointer'
      }}
      data-id="remix-ai-composer-send-btn"
      disabled={props.disabled && !props.isStreaming}
      onClick={() => {
        if (props.isStreaming && props.handleCancel) {
          props.handleCancel()
        } else if (!props.isStreaming && !props.disabled) {
          props.handleSend()
        }
      }}
    >
      <i className={`fa ${props.isStreaming ? 'fa-stop' : 'fa-paper-plane-top'} text-light`}></i>
    </button>
  )
}
