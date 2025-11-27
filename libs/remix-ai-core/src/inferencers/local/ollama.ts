import axios from 'axios';
import { Registry } from '@remix-project/remix-lib';
import { trackMatomoEvent } from '@remix-api'

// default Ollama ports to check (11434 is the legacy/standard port)
const OLLAMA_PORTS = [11434, 11435, 11436];
const OLLAMA_BASE_HOST = 'http://localhost';
const DEFAULT_OLLAMA_HOST = 'http://localhost:11434';

let discoveredOllamaHost: string | null = null;

function getConfiguredOllamaEndpoint(): string | null {
  const filemanager = Registry.getInstance().get('filemanager').api;
  try {
    const config = Registry.getInstance().get('config').api
    const configuredEndpoint = config.get('settings/ollama-endpoint');
    if (configuredEndpoint && configuredEndpoint !== DEFAULT_OLLAMA_HOST) {
      trackMatomoEvent(filemanager, { category: 'ai', action: 'remixAI', name: 'ollama_using_configured_endpoint', value: configuredEndpoint });
      return configuredEndpoint;
    }
  } catch (error) {
    trackMatomoEvent(filemanager, { category: 'ai', action: 'remixAI', name: 'ollama_config_access_failed', value: error.message || 'unknown' });
  }
  return null;
}

export async function discoverOllamaHost(): Promise<string | null> {
  const filemanager = Registry.getInstance().get('filemanager').api;
  if (discoveredOllamaHost) {
    trackMatomoEvent(filemanager, { category: 'ai', action: 'remixAI', name: `ollama_host_cache_hit:${discoveredOllamaHost}` })
    return discoveredOllamaHost;
  }

  // First, try to use the configured endpoint from settings
  const configuredEndpoint = getConfiguredOllamaEndpoint();
  if (configuredEndpoint) {
    try {
      const res = await axios.get(`${configuredEndpoint}/api/tags`, { timeout: 2000 });
      if (res.status === 200) {
        discoveredOllamaHost = configuredEndpoint;
        trackMatomoEvent(filemanager, { category: 'ai', action: 'remixAI', name: 'ollama_configured_endpoint_success', value: configuredEndpoint });
        return configuredEndpoint;
      }
      return null;
    } catch (error) {
      trackMatomoEvent(filemanager, { category: 'ai', action: 'remixAI', name: 'ollama_configured_endpoint_failed', value: `${configuredEndpoint}:${error.message || 'unknown'}` });
      // Fall back to discovery if configured endpoint fails
      return null;
    }
  }

  // Fall back to port discovery if no configured endpoint
  for (const port of OLLAMA_PORTS) {
    const host = `${OLLAMA_BASE_HOST}:${port}`;
    trackMatomoEvent(filemanager, { category: 'ai', action: 'remixAI', name: `ollama_port_check:${port}` });
    try {
      const res = await axios.get(`${host}/api/tags`, { timeout: 2000 });
      if (res.status === 200) {
        discoveredOllamaHost = host;
        trackMatomoEvent(filemanager, { category: 'ai', action: 'remixAI', name: `ollama_host_discovered_success:${host}` });
        return host;
      }
    } catch (error) {
      trackMatomoEvent(filemanager, { category: 'ai', action: 'remixAI', name: `ollama_port_connection_failed:${port}:${error.message || 'unknown'}` });
      continue; // next port
    }
  }
  trackMatomoEvent(filemanager, { category: 'ai', action: 'remixAI', name: 'ollama_host_discovery_failed:no_ports_available' });
  return null;
}

export async function isOllamaAvailable(): Promise<boolean> {
  const filemanager = Registry.getInstance().get('filemanager').api;
  trackMatomoEvent(filemanager, { category: 'ai', action: 'remixAI', name: 'ollama_availability_check:checking' });
  const host = await discoverOllamaHost();
  const isAvailable = host !== null;
  trackMatomoEvent(filemanager, { category: 'ai', action: 'remixAI', name: `ollama_availability_result:available:${isAvailable}` });
  return isAvailable;
}

export async function listModels(): Promise<string[]> {
  const filemanager = Registry.getInstance().get('filemanager').api;
  trackMatomoEvent(filemanager, { category: 'ai', action: 'remixAI', name: 'ollama_list_models_start:fetching' });
  const host = await discoverOllamaHost();
  if (!host) {
    trackMatomoEvent(filemanager, { category: 'ai', action: 'remixAI', name: 'ollama_list_models_failed:no_host' });
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
  const fileManager = Registry.getInstance().get('filemanager').api;
  trackMatomoEvent(fileManager, { category: 'ai', action: 'remixAI', name: `ollama_reset_host:${discoveredOllamaHost || 'null'}` });
  discoveredOllamaHost = null;
}

export function resetOllamaHostOnSettingsChange(): void {
  const fileManager = Registry.getInstance().get('filemanager').api;
  // This function should be called when Ollama settings are updated
  resetOllamaHost();
  trackMatomoEvent(fileManager, { category: 'ai', action: 'remixAI', name: 'ollama_reset_on_settings_change' });
}

export async function pullModel(modelName: string): Promise<void> {
  const filemanager = Registry.getInstance().get('filemanager').api;
  // in case the user wants to pull a model from registry
  trackMatomoEvent(filemanager, { category: 'ai', action: 'remixAI', name: `ollama_pull_model_start:${modelName}` });
  const host = await discoverOllamaHost();
  if (!host) {
    trackMatomoEvent(filemanager, { category: 'ai', action: 'remixAI', name: `ollama_pull_model_failed:${modelName}|no_host` });
    throw new Error('Ollama is not available');
  }

  try {
    const startTime = Date.now();
    await axios.post(`${host}/api/pull`, { name: modelName });
    const duration = Date.now() - startTime;
    trackMatomoEvent(filemanager, { category: 'ai', action: 'remixAI', name: `ollama_pull_model_success:${modelName}|duration:${duration}ms` });
  } catch (error) {
    trackMatomoEvent(filemanager, { category: 'ai', action: 'remixAI', name: `ollama_pull_model_error:${modelName}|${error.message || 'unknown'}` });
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
  const filemanager = Registry.getInstance().get('filemanager').api;
  trackMatomoEvent(filemanager, { category: 'ai', action: 'remixAI', name: 'ollama_get_best' });
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
    trackMatomoEvent(filemanager, { category: 'ai', action: 'remixAI', name: `ollama_get_best_model_error:${error.message || 'unknown'}` });
    console.error('Error getting best available model:', error);
    return null;
  }
}
