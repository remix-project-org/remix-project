import React from 'react'
import { PromptSubmitButton } from './promptSubmitButton'
import { PromptRecordingCounter } from './promptRecordingCounter'
import { PromptStopButton } from './promptStopButton'

interface PromptActiveButtonsProps {
  handleRecordingStoppage: () => void
  isStreaming: boolean
  isRecording: boolean
  handleSend: () => void
  themeTracker: any
  handleCancel: () => void
}

export function PromptActiveButtons(props: PromptActiveButtonsProps) {

  return (
    <div
      className="d-flex justify-content-between gap-3 align-items-center w-100 py-2 align-items-center px-3"
      style={{
        backgroundColor: props.themeTracker && props.themeTracker?.name.toLowerCase() === 'light' ? '#d9dee8' : '#222336',
      }}
    >
      <button className="btn btn-sm small font-weight-light text-secondary d-flex justify-content-center align-items-center" style={{
        backgroundColor: props.themeTracker && props.themeTracker?.name.toLowerCase() === 'light' ? '#e4e8f1' : '#2a2c3f',
        width: '2rem',
        height: '2rem',
        padding: 0
      }}
      onClick={props.handleRecordingStoppage}
      >
        <i className="fas fa-stop text-danger"></i>
      </button>
      <div>
        <i className="fas fa-microphone me-3" style={{ color: props.themeTracker && props.themeTracker.name.toLowerCase() === 'light' ? '#1ea2aa' : '#2de7f3' }}></i>
        <PromptRecordingCounter isRecording={props.isRecording} themeTracker={props.themeTracker} />
      </div>
      <PromptStopButton backgroundColor={props.themeTracker && props.themeTracker.name.toLowerCase() === 'light' ? '#1ea2aa' : "#2de7f3"} isStreaming={props.isStreaming} handleCancel={props.handleCancel} />
    </div>
  )
}
