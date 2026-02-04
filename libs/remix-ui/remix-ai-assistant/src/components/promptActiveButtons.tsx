import React from 'react'
import { PromptSubmitButton } from './promptSubmitButton'
import { PromptRecordingCounter } from './promptRecordingCounter'

interface PromptActiveButtonsProps {
  handleRecordingStoppage: () => void
  isStreaming: boolean
  isRecording: boolean
  handleSend: () => void
  themeTracker: any
}

export function PromptActiveButtons(props: PromptActiveButtonsProps) {

  return (
    <div
      className="d-flex justify-content-between gap-3 align-items-center w-100 py-2 align-items-center px-3"
      style={{
        backgroundColor: props.themeTracker && props.themeTracker?.name.toLowerCase() === 'light' ? '#d9dee8' : '#222336',
      }}
    >
      <button className="btn btn-sm small font-weight-light text-secondary rounded-3" style={{
        backgroundColor: props.themeTracker && props.themeTracker?.name.toLowerCase() === 'light' ? '#e4e8f1' : '#2a2c3f'
      }}
      onClick={props.handleRecordingStoppage}
      >
        <i className="fas fa-trash me-2 text-danger"></i>
      </button>
      <div>
        <i className="fas fa-microphone" style={{ color: props.themeTracker && props.themeTracker.name === 'light' ? '#1ea2aa' : '#2de7f3' }}></i>
        <PromptRecordingCounter isRecording={props.isRecording} />
      </div>
      <PromptSubmitButton backgroundColor="#2de7f3" handleSend={props.handleSend} isStreaming={props.isStreaming} />
    </div>
  )
}
