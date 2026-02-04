import React from 'react'
import { PromptSubmitButton } from './promptSubmitButton'
import { PromptAreaProps } from './prompt'
import { CustomTooltip } from '@remix-ui/helper'

interface PromptDefaultProps {
  handleRecording: () => void
  isRecording: boolean
  isStreaming: boolean
  handleSend: () => void
  themeTracker: any
}

export function PromptDefault(props: PromptDefaultProps) {

  return (
    <div
      className="d-flex justify-content-end gap-3 align-items-center w-100 py-2 align-items-center px-3"
      style={{
        backgroundColor: props.themeTracker && props.themeTracker?.name.toLowerCase() === 'light' ? '#d9dee8' : '#222336',
      }}
    >
      <CustomTooltip
        placement="top"
        tooltipText={props.isRecording ? 'Stop recording' : 'Voice input'}
        tooltipId="audioPromptTooltip"
      >
        <button
          className="btn btn-sm small font-weight-light text-secondary rounded-3"
          onClick={props.handleRecording}
          style={{
            backgroundColor: props.themeTracker && props.themeTracker?.name.toLowerCase() === 'light' ? '#e4e8f1' : '#2a2c3f',
            color: props.themeTracker && props.themeTracker?.name.toLowerCase() === 'light' ? '#747b90' : '#d5d7e3'
          }}
        >
          <i className="fas fa-microphone me-2"></i>
        Audio Prompt
        </button>
      </CustomTooltip>
      <PromptSubmitButton backgroundColor={props.themeTracker && props.themeTracker.name.toLowerCase() === 'light' ? '#1ea2aa' : "#2de7f3"} handleSend={props.handleSend} isStreaming={props.isStreaming} />
    </div>
  )
}
