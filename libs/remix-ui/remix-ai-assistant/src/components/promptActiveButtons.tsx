import React from 'react'
import { PromptSubmitButton } from './promptSubmitButton'
import { PromptRecordingCounter } from './promptRecordingCounter'

interface PromptActiveButtonsProps {
  handleRecordingStoppage: () => void
  isStreaming: boolean
  isRecording: boolean
  handleSend: () => void
}

export function PromptActiveButtons(props: PromptActiveButtonsProps) {

  return (
    <div className="d-flex justify-content-between gap-3 align-items-center w-100 bg-light pb-2 align-items-center px-3">
      <button className="btn btn-sm small font-weight-light text-secondary rounded-3" style={{ backgroundColor: '#342a3b' }}
        onClick={props.handleRecordingStoppage}
      >
        <i className="fas fa-trash me-2 text-danger"></i>
      </button>
      <div>
        <i className="fas fa-microphone" style={{ color: '#2de7f3' }}></i>
        <PromptRecordingCounter isRecording={props.isRecording} />
      </div>
      <PromptSubmitButton backgroundColor="#2de7f3" handleSend={props.handleSend} isStreaming={props.isStreaming} />
    </div>
  )
}
