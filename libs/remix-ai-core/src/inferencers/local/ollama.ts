import axios from 'axios';

// Helper function to track events using MatomoManager instance
function trackMatomoEvent(category: string, action: string, name?: string) {
  try {
    if (typeof window !== 'undefined' && (window as any)._matomoManagerInstance) {
      (window as any)._matomoManagerInstance.trackEvent(category, action, name)
    }
  } catch (error) {
    // Silent fail for tracking
  }
}

// default Ollama ports to check (11434 is the legacy/standard port)
const OLLAMA_PORTS = [11434, 11435, 11436];
const OLLAMA_BASE_HOST = 'http://localhost';

let discoveredOllamaHost: string | null = null;

export async function discoverOllamaHost(): Promise<string | null> {
  if (discoveredOllamaHost) {
    trackMatomoEvent('ai', 'remixAI', `ollama_host_cache_hit:${discoveredOllamaHost}`);
    return discoveredOllamaHost;
  }

  for (const port of OLLAMA_PORTS) {
    const host = `${OLLAMA_BASE_HOST}:${port}`;
    trackMatomoEvent('ai', 'remixAI', `ollama_port_check:${port}`);
    try {
      const res = await axios.get(`${host}/api/tags`, { timeout: 2000 });
      if (res.status === 200) {
        discoveredOllamaHost = host;
        trackMatomoEvent('ai', 'remixAI', `ollama_host_discovered_success:${host}`);
        return host;
      }
    } catch (error) {
      trackMatomoEvent('ai', 'remixAI', `ollama_port_connection_failed:${port}:${error.message || 'unknown'}`);
      continue; // next port
    }
  }
  trackMatomoEvent('ai', 'remixAI', 'ollama_host_discovery_failed:no_ports_available');
  return null;
}

export async function isOllamaAvailable(): Promise<boolean> {
  trackMatomoEvent('ai', 'remixAI', 'ollama_availability_check:checking');
  const host = await discoverOllamaHost();
  const isAvailable = host !== null;
  trackMatomoEvent('ai', 'remixAI', `ollama_availability_result:available:${isAvailable}`);
  return isAvailable;
}

export async function listModels(): Promise<string[]> {
  trackMatomoEvent('ai', 'remixAI', 'ollama_list_models_start:fetching');
  const host = await discoverOllamaHost();
  if (!host) {
    trackMatomoEvent('ai', 'remixAI', 'ollama_list_models_failed:no_host');
    throw new Error('Ollama is not available');
  }

  try {
    const res = await axios.get(`${host}/api/tags`);
    return res.data.models.map((model: any) => model.name);
  } catch (error) {
    throw new Error('Failed to list Ollama models');
  }
}

export function getOllamaHost(): string | null {
  return discoveredOllamaHost;
}

export function resetOllamaHost(): void {
  trackMatomoEvent('ai', 'remixAI', `ollama_reset_host:${discoveredOllamaHost || 'null'}`);
  discoveredOllamaHost = null;
}

export async function pullModel(modelName: string): Promise<void> {
  // in case the user wants to pull a model from registry
  trackMatomoEvent('ai', 'remixAI', `ollama_pull_model_start:${modelName}`);
  const host = await discoverOllamaHost();
  if (!host) {
    trackMatomoEvent('ai', 'remixAI', `ollama_pull_model_failed:${modelName}|no_host`);
    throw new Error('Ollama is not available');
  }

  try {
    const startTime = Date.now();
    await axios.post(`${host}/api/pull`, { name: modelName });
    const duration = Date.now() - startTime;
    trackMatomoEvent('ai', 'remixAI', `ollama_pull_model_success:${modelName}|duration:${duration}ms`);
  } catch (error) {
    trackMatomoEvent('ai', 'remixAI', `ollama_pull_model_error:${modelName}|${error.message || 'unknown'}`);
    console.error('Error pulling model:', error);
    throw new Error(`Failed to pull model: ${modelName}`);
  }
}

export async function validateModel(modelName: string): Promise<boolean> {
  try {
    const models = await listModels();
    return models.includes(modelName);
  } catch (error) {
    return false;
  }
}

export async function getBestAvailableModel(): Promise<string | null> {
  trackMatomoEvent('ai', 'remixAI', 'ollama_get_best');
  try {
    const models = await listModels();
    if (models.length === 0) return null;

    // Prefer code-focused models for IDE
    const codeModels = models.filter(m =>
      m.includes('codestral') ||
      m.includes('code') ||
      m.includes('deepseek-coder') ||
      m.includes('starcoder')
    );

    if (codeModels.length > 0) {
      return codeModels[0];
    }
    // TODO get model stats and get best model
    return models[0];
  } catch (error) {
    trackMatomoEvent('ai', 'remixAI', `ollama_get_best_model_error:${error.message || 'unknown'}`);
    console.error('Error getting best available model:', error);
    return null;
  }
}
