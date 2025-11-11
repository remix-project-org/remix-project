/**
 * Fireworks AI Transcription Service
 * Provides speech-to-text transcription using Fireworks API
 */

export interface TranscriptionOptions {
  model?: string
  language?: string
  apiKey: string
}

export interface TranscriptionResult {
  text: string
  duration?: number
  language?: string
}

export class FireworksTranscriptionError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: any
  ) {
    super(message)
    this.name = 'FireworksTranscriptionError'
  }
}

/**
 * Transcribe audio using Fireworks AI Whisper API
 */
export async function transcribeAudio(
  audioBlob: Blob,
  options: TranscriptionOptions
): Promise<TranscriptionResult> {
  const { model = 'whisper-v3', apiKey } = options

  if (!apiKey) {
    throw new FireworksTranscriptionError('Fireworks API key is required')
  }

  // Create form data
  const formData = new FormData()
  formData.append('file', audioBlob, 'recording.webm')
  formData.append('model', model)

  try {
    const response = await fetch('https://audio-prod.api.fireworks.ai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText)
      throw new FireworksTranscriptionError(
        `Transcription failed: ${errorText}`,
        response.status,
        errorText
      )
    }

    const result = await response.json()

    if (!result.text) {
      throw new FireworksTranscriptionError('No transcription text in response', undefined, result)
    }

    return {
      text: result.text,
      duration: result.duration,
      language: result.language
    }
  } catch (error) {
    if (error instanceof FireworksTranscriptionError) {
      throw error
    }

    // Handle network or other errors
    const message = error instanceof Error ? error.message : 'Unknown error occurred'
    throw new FireworksTranscriptionError(`Network error: ${message}`)
  }
}

/**
 * Check if Fireworks API key is configured
 */
export function hasApiKey(apiKey: string | null | undefined): apiKey is string {
  return typeof apiKey === 'string' && apiKey.length > 0
}
