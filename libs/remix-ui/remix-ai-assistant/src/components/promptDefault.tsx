import React from 'react'
import { PromptSubmitButton } from './promptSubmitButton'
import { PromptAreaProps } from './prompt'
import { CustomTooltip } from '@remix-ui/helper'
import { PromptStopButton } from './promptStopButton'

interface PromptDefaultProps {
  handleRecording: () => void
  isRecording: boolean
  isStreaming: boolean
  handleSend: () => void
  themeTracker: any
  handleCancel: () => void
}

export function PromptDefault(props: PromptDefaultProps) {

  return (
    <div
      className="flex justify-end gap-3 items-center w-full py-2 items-center px-3"
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
          className="inline-flex items-center px-3 py-1.5 text-sm rounded-md transition-colors small font-weight-light text-secondary rounded-lg"
          onClick={props.handleRecording}
          style={{
            backgroundColor: props.themeTracker && props.themeTracker?.name.toLowerCase() === 'light' ? '#e4e8f1' : '#2a2c3f',
            color: props.themeTracker && props.themeTracker?.name.toLowerCase() === 'light' ? '#747b90' : '#d5d7e3'
          }}
        >
          <i className="fas fa-microphone mr-2"></i>
        Audio Prompt
        </button>
      </CustomTooltip>
      {!props.isStreaming ? <PromptSubmitButton backgroundColor={props.themeTracker && props.themeTracker.name.toLowerCase() === 'light' ? '#1ea2aa' : "#2de7f3"} handleSend={props.handleSend} isStreaming={props.isStreaming} /> :
        <PromptStopButton backgroundColor={props.themeTracker && props.themeTracker.name.toLowerCase() === 'light' ? '#1ea2aa' : "#2de7f3"} isStreaming={props.isStreaming} handleCancel={props.handleCancel} />}
    </div>
  )
}
