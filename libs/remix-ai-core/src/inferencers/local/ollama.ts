import { remixAILogger } from '../../helpers/logger'
import axios from 'axios';
import { Registry } from '@remix-project/remix-lib';
import { trackMatomoEvent } from '@remix-api'

// default Ollama ports to check (11434 is the legacy/standard port)
const OLLAMA_PORTS = [11434, 11435, 11436];
const OLLAMA_BASE_HOST = 'http://localhost';
const DEFAULT_OLLAMA_HOST = 'http://localhost:11434';

let discoveredOllamaHost: string | null = null;

export interface OllamaModelCapabilities {
  /** Model can call tools / functions (required by the Remix agent). */
  tools: boolean;
  /** Model emits a reasoning/thinking stream. */
  thinking: boolean;
  /** Model supports fill-in-the-middle / insertion (code completion). */
  insert: boolean;
}

// Capabilities are immutable per model, so cache them for the session.
const modelCapabilitiesCache = new Map<string, OllamaModelCapabilities>();

function getConfiguredOllamaEndpoint(): string | null {
  const filemanager = Registry.getInstance().get('filemanager').api;
  try {
    const config = Registry.getInstance().get('config').api
    const configuredEndpoint = config.get('settings/ollama-endpoint');
    if (configuredEndpoint && configuredEndpoint !== DEFAULT_OLLAMA_HOST) {
      trackMatomoEvent(filemanager, { category: 'ai', action: 'remixAI', name: 'ollama_using_configured_endpoint', value: configuredEndpoint });
      return configuredEndpoint;
    }
  } catch (error: unknown) {
    trackMatomoEvent(filemanager, { category: 'ai', action: 'remixAI', name: 'ollama_config_access_failed', value: (error as Error)?.message || 'unknown' });
  }
  return null;
}

function isCorsError(error: unknown): boolean {
  const axiosError = error as { response?: { status?: number }; message?: string }
  if (axiosError?.response?.status === 403) return true
  if (axiosError?.message?.includes('Network Error')) return true
  return false
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
    } catch (error: unknown) {
      if (isCorsError(error)) {
        remixAILogger.warn(
          `[Ollama] CORS error connecting to ${configuredEndpoint}. ` +
          `Start Ollama with CORS enabled: OLLAMA_ORIGINS=* ollama serve`
        )
      }
      trackMatomoEvent(filemanager, { category: 'ai', action: 'remixAI', name: 'ollama_configured_endpoint_failed', value: `${configuredEndpoint}:${(error as Error)?.message || 'unknown'}` });
      // Fall back to discovery if configured endpoint fails
      return null;
    }
  }

  // Fall back to port discovery if no configured endpoint
  let corsErrorDetected = false
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
    } catch (error: unknown) {
      if (isCorsError(error)) {
        corsErrorDetected = true
      }
      trackMatomoEvent(filemanager, { category: 'ai', action: 'remixAI', name: `ollama_port_connection_failed:${port}:${(error as Error)?.message || 'unknown'}` });
      continue; // next port
    }
  }

  if (corsErrorDetected) {
    remixAILogger.warn(
      `[Ollama] CORS error detected. Ollama may be running but blocking browser requests.\n` +
      `To fix, restart Ollama with CORS enabled:\n` +
      `  OLLAMA_ORIGINS=* ollama serve\n`
    )
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
  modelCapabilitiesCache.clear();
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
  } catch (error: unknown) {
    trackMatomoEvent(filemanager, { category: 'ai', action: 'remixAI', name: `ollama_pull_model_error:${modelName}|${(error as Error)?.message || 'unknown'}` });
    remixAILogger.error('Error pulling model:', error);
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

export async function getModelCapabilities(modelName: string): Promise<OllamaModelCapabilities> {
  console.log(`[Ollama] Getting capabilities for model "${modelName}"`)
  if (modelCapabilitiesCache.has(modelName)) return modelCapabilitiesCache.get(modelName) as OllamaModelCapabilities;

  const fallback: OllamaModelCapabilities = { tools: false, thinking: false, insert: false };
  const host = await discoverOllamaHost();
  if (!host) return fallback;

  try {
    const res = await axios.post(`${host}/api/show`, { name: modelName });
    if (res.status === 200 && res.data) {
      const caps: string[] = Array.isArray(res.data.capabilities) ? res.data.capabilities : [];
      const template: string = res.data.template || '';
      const result: OllamaModelCapabilities = {
        // `.Tools` / `ToolCalls` appear in the chat template of tool-capable models
        // when the explicit `capabilities` array is absent (older Ollama).
        tools: caps.includes('tools') || /\.Tools|ToolCalls/.test(template),
        thinking: caps.includes('thinking') || caps.includes('reasoning'),
        insert: caps.includes('insert') ||
          template.includes('fim') || template.includes('suffix') ||
          template.includes('.Suffix') || template.includes('<fim_') || template.includes('<|fim_'),
      };
      modelCapabilitiesCache.set(modelName, result);
      console.log(`[Ollama] Capabilities for model "${modelName}":`, result);
      return result;
    }
  } catch (error) {
    remixAILogger.warn(`[Ollama] Failed to read capabilities for "${modelName}": ${error}`);
  }
  return fallback;
}

/** True when the model can call tools — a hard requirement for the Remix agent. */
export async function modelSupportsTools(modelName: string): Promise<boolean> {
  return (await getModelCapabilities(modelName)).tools;
}

/** True when the model supports a thinking/reasoning stream. */
export async function modelSupportsThinking(modelName: string): Promise<boolean> {
  return (await getModelCapabilities(modelName)).thinking;
}

/** List only the installed models that support tool calling. */
export async function listToolCapableModels(): Promise<string[]> {
  const models = await listModels();
  const checked = await Promise.all(
    models.map(async (m) => ({ model: m, tools: (await getModelCapabilities(m)).tools }))
  );
  return checked.filter((c) => c.tools).map((c) => c.model);
}

export async function getBestAvailableModel(): Promise<string | null> {
  try {
    const models = await listModels();
    if (models.length === 0) return null;
    // The agent needs tool calling — return the first tool-capable model, not
    // just the first installed one. Returns null when none qualify.
    for (const model of models) {
      if ((await getModelCapabilities(model)).tools) return model;
    }
    return null;
  } catch (error: unknown) {
    remixAILogger.error('Error getting available model:', error);
    return null;
  }
}
