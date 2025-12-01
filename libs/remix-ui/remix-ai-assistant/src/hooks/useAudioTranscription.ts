/**
 * React hook for audio recording and transcription
 */

import { useState, useRef, useCallback } from 'react'
import { AudioRecorder } from '../utils/audioRecorder'
import { transcribeAudio, FireworksTranscriptionError } from '../services/fireworksTranscription'

export interface UseAudioTranscriptionOptions {
  model?: string
  onTranscriptionComplete?: (text: string) => void
  onError?: (error: Error) => void
}

export interface UseAudioTranscriptionResult {
  isRecording: boolean
  isTranscribing: boolean
  error: Error | null
  startRecording: () => Promise<void>
  stopRecording: () => void
  toggleRecording: () => Promise<void>
}

export function useAudioTranscription(
  options: UseAudioTranscriptionOptions
): UseAudioTranscriptionResult {
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const audioRecorderRef = useRef<AudioRecorder | null>(null)

  const startRecording = useCallback(async () => {
    try {
      setError(null)

      // Create new recorder instance
      if (!audioRecorderRef.current) {
        audioRecorderRef.current = new AudioRecorder()
      }

      await audioRecorderRef.current.startRecording({
        onStop: async (audioBlob) => {
          setIsRecording(false)
          setIsTranscribing(true)

          try {
            // Transcribe the audio
            const result = await transcribeAudio(audioBlob, {
              model: options.model
            })

            setIsTranscribing(false)

            // Call completion callback with transcribed text
            if (result.text && result.text.trim()) {
              options.onTranscriptionComplete?.(result.text.trim())
            }
          } catch (err) {
            setIsTranscribing(false)
            const error = err instanceof Error ? err : new Error('Transcription failed')
            setError(error)
            options.onError?.(error)
          }
        },
        onError: (err) => {
          setIsRecording(false)
          setError(err)
          options.onError?.(err)
        }
      })

      setIsRecording(true)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to start recording')
      setError(error)
      setIsRecording(false)
      options.onError?.(error)
    }
  }, [options])

  const stopRecording = useCallback(() => {
    if (audioRecorderRef.current) {
      audioRecorderRef.current.stopRecording()
    }
  }, [])

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      stopRecording()
    } else {
      await startRecording()
    }
  }, [isRecording, startRecording, stopRecording])

  return {
    isRecording,
    isTranscribing,
    error,
    startRecording,
    stopRecording,
    toggleRecording
  }
}
