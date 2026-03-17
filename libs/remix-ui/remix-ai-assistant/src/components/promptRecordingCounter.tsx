import React from 'react'

interface PromptRecordingCounterProps {
  isRecording: boolean
  themeTracker?: any
}

export function PromptRecordingCounter(props: PromptRecordingCounterProps) {
  const isLight = props.themeTracker?.name?.toLowerCase() === 'light'
  const barColor = isLight ? '#1ea2aa' : '#2de7f3'
  return (
    <span className="ms-1 recording-wave">
      <span className="recording-wave__bar" style={{ backgroundColor: barColor }}></span>
      <span className="recording-wave__bar" style={{ backgroundColor: barColor }}></span>
      <span className="recording-wave__bar" style={{ backgroundColor: barColor }}></span>
      <span className="recording-wave__bar" style={{ backgroundColor: barColor }}></span>
      <span className="recording-wave__bar" style={{ backgroundColor: barColor }}></span>
    </span>
  )
}
