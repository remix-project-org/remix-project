<<<<<<< HEAD
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
=======
/* eslint-disable prefer-const */
import React, { useEffect, useRef, useState } from 'react'

interface PromptRecordingCounterProps {
  isRecording: boolean
}

export function PromptRecordingCounter(props: PromptRecordingCounterProps) {
  const [countSeconds, setCountSeconds] = useState(0)
  const [countMilli, setCountMilli] = useState(0)
  const requestId = useRef<number>()
  const animate = (startTime) => {
    let endTime = Date.now() - startTime
    setCountSeconds(Math.floor(endTime / 1000))
    setCountMilli(endTime % 100)
  }
  useEffect(() => {
    const startTime = Date.now()
    let intervalId
    intervalId = setInterval(() => animate(startTime), 100)

    return () => {

      clearInterval(intervalId)
    }
  }, [])
  return (
    <span className="ms-1">{countSeconds}:{countMilli}</span>
>>>>>>> ef7f7aa2e7 (create components to handle  different states of prompt zone)
  )
}
