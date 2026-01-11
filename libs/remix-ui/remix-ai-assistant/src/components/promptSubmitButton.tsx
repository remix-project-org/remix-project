import React from 'react'

interface PromptSubmitButtonProps {
  backgroundColor: string
  isStreaming: boolean
  handleSend: () => void
<<<<<<< HEAD
  handleCancel?: () => void
=======
>>>>>>> ef7f7aa2e7 (create components to handle  different states of prompt zone)
}

export function PromptSubmitButton(props: PromptSubmitButtonProps) {

  return (
<<<<<<< HEAD
    <button
      className={`btn btn-sm ${props.isStreaming ? 'bg-danger' : ''}`}
      style={{ backgroundColor: props.isStreaming ? 'btn btn-sm' : props.backgroundColor }}
      data-id="remix-ai-composer-send-btn"
      onClick={() => {
        if (props.isStreaming && props.handleCancel) {
          props.handleCancel()
        } else if (!props.isStreaming) {
          props.handleSend()
        }
      }}
    >
      <i className={`fa ${props.isStreaming ? 'fa-stop' : 'fa-paper-plane-top'} text-light`}></i>
=======
    <button className="btn btn-sm "
      style={{ backgroundColor: props.backgroundColor }}
      onClick={() => {
        if (!props.isStreaming) props.handleSend()
      }}
    >
      <i className="fa fa-paper-plane-top text-light"></i>
>>>>>>> ef7f7aa2e7 (create components to handle  different states of prompt zone)
    </button>
  )
}
