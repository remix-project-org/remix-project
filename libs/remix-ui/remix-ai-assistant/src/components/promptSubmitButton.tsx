import React from 'react'

interface PromptSubmitButtonProps {
  backgroundColor: string
  isStreaming: boolean
  handleSend: () => void
}

export function PromptSubmitButton(props: PromptSubmitButtonProps) {

  return (
    <button className="btn btn-sm "
      style={{ backgroundColor: props.backgroundColor }}
      onClick={() => {
        if (!props.isStreaming) props.handleSend()
      }}
    >
      <i className="fa fa-paper-plane-top text-light"></i>
    </button>
  )
}
