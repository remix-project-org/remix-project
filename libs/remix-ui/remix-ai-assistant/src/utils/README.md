# Audio Recording and Transcription

This module provides audio recording and transcription capabilities using the MediaRecorder API and Fireworks AI Whisper API.

## Files

### `audioRecorder.ts`
Audio recording utility class that handles:
- Microphone access and permissions
- Recording audio using MediaRecorder API
- Managing audio chunks
- Cleanup and resource management

**Usage:**
```typescript
import { AudioRecorder } from './audioRecorder'

const recorder = new AudioRecorder()

await recorder.startRecording({
  onStop: (audioBlob) => {
    console.log('Recording stopped', audioBlob)
  },
  onError: (error) => {
    console.error('Recording error', error)
  }
})

recorder.stopRecording()
```

### `../services/fireworksTranscription.ts`
Fireworks AI transcription service that:
- Sends audio to Fireworks Whisper API
- Handles API authentication
- Returns transcribed text
- Provides error handling

**Usage:**
```typescript
import { transcribeAudio } from '../services/fireworksTranscription'

const result = await transcribeAudio(audioBlob, {
  apiKey: 'your-api-key',
  model: 'whisper-v3'
})

console.log(result.text)
```

### `../hooks/useAudioTranscription.ts`
React hook that combines recording and transcription:
- Manages recording state
- Handles transcription flow
- Provides callbacks for completion and errors

**Usage:**
```typescript
import { useAudioTranscription } from '../hooks/useAudioTranscription'

const {
  isRecording,
  isTranscribing,
  toggleRecording
} = useAudioTranscription({
  apiKey: 'your-api-key',
  onTranscriptionComplete: (text) => {
    console.log('Transcribed:', text)
  },
  onError: (error) => {
    console.error('Error:', error)
  }
})
```

## Architecture

```
Component (remix-ui-remix-ai-assistant.tsx)
    ↓
Hook (useAudioTranscription)
    ↓
AudioRecorder ← MediaRecorder API
    ↓
FireworksTranscription ← Fireworks API
    ↓
Callback (onTranscriptionComplete)
```

## Benefits of Refactoring

1. **Separation of Concerns**: Recording logic, API calls, and React state management are separated
2. **Reusability**: Each module can be used independently
3. **Testability**: Each module can be tested in isolation
4. **Maintainability**: Changes to one module don't affect others
5. **Type Safety**: Full TypeScript support with proper typing
