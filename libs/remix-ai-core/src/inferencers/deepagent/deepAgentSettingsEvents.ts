import EventEmitter from 'events'

/**
 * Event emitter for DeepAgent settings changes
 * Used to notify the RemixAI plugin when API key settings change
 */
class DeepAgentSettingsEvents extends EventEmitter {
  private static instance: DeepAgentSettingsEvents

  private constructor() {
    super()
  }

  static getInstance(): DeepAgentSettingsEvents {
    if (!DeepAgentSettingsEvents.instance) {
      DeepAgentSettingsEvents.instance = new DeepAgentSettingsEvents()
    }
    return DeepAgentSettingsEvents.instance
  }
}

export const deepAgentSettingsEvents = DeepAgentSettingsEvents.getInstance()

/**
 * Call this function when DeepAgent API key settings change
 * This will emit an event that the RemixAI plugin listens to
 */
export function onDeepAgentApiKeysChanged(): void {
  console.log('[DeepAgent] API keys settings changed, emitting reinitialize event')
  deepAgentSettingsEvents.emit('apiKeysChanged')
}

/**
 * Subscribe to API key changes
 * @param callback Function to call when API keys change
 * @returns Unsubscribe function
 */
export function onApiKeysChange(callback: () => void): () => void {
  deepAgentSettingsEvents.on('apiKeysChanged', callback)
  return () => {
    deepAgentSettingsEvents.off('apiKeysChanged', callback)
  }
}
