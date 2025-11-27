/**
 * Audio recording utilities using MediaRecorder API
 */

export interface AudioRecorderOptions {
  onDataAvailable?: (chunks: Blob[]) => void
  onStop?: (audioBlob: Blob) => void
  onError?: (error: Error) => void
}

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null
  private audioChunks: Blob[] = []
  private stream: MediaStream | null = null

  /**
   * Start recording audio from the microphone
   */
  async startRecording(options: AudioRecorderOptions = {}): Promise<void> {
    try {
      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.audioChunks = []

      // Create MediaRecorder instance
      this.mediaRecorder = new MediaRecorder(this.stream)

      // Handle data available event
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data)
          options.onDataAvailable?.(this.audioChunks)
        }
      }

      // Handle stop event
      this.mediaRecorder.onstop = () => {
        // Create audio blob from recorded chunks
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' })

        // Clean up stream
        this.cleanup()

        // Call stop callback
        options.onStop?.(audioBlob)
      }

      // Handle errors
      this.mediaRecorder.onerror = (event) => {
        const error = new Error(`MediaRecorder error: ${event}`)
        options.onError?.(error)
        this.cleanup()
      }

      // Start recording
      this.mediaRecorder.start()
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to start recording')
      options.onError?.(err)
      this.cleanup()
      throw err
    }
  }

  /**
   * Stop recording audio
   */
  stopRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop()
    }
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.mediaRecorder !== null && this.mediaRecorder.state === 'recording'
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    // Stop all tracks to release microphone
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
    }
  }

  /**
   * Dispose of the recorder and release all resources
   */
  dispose(): void {
    this.stopRecording()
    this.cleanup()
    this.mediaRecorder = null
    this.audioChunks = []
  }
}
