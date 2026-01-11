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
  )
}
