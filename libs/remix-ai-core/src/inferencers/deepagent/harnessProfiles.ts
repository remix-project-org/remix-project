import { createHarnessProfile } from 'deepagents'
import type { HarnessProfile, HarnessProfileOptions } from 'deepagents'
import { AIModel, modelTransportProvider } from '../../types/models'
import { ModelTransport, ModelSelection } from '../../types/deepagent'
import { remixAILogger } from '../../helpers/logger'

/**
 * How a model must be *prompted and tooled* — the counterpart to
 * `modelParams.ts`, which covers how it must be *driven*.
 *
 * `deepagents` calls this a "harness profile": a prompt suffix, tool
 * visibility, per-tool description rewrites and general-purpose-subagent
 * shaping, resolved per model. Before this, every model got the same system
 * prompt and the same tool set, so a model needing a shorter prompt or fewer
 * tools had nowhere to say so.
 *
 * Same contract as the runtime parameters: the backend catalogue is the source
 * of truth, per-transport fallbacks cover payloads that advertise nothing, and
 * **no model ids are hardcoded on the client** — a literal id goes stale the
 * moment the catalogue moves.
 *
 */
export const TRANSPORT_HARNESS_DEFAULTS: Record<ModelTransport, HarnessProfileOptions> = {
  openrouter: {},
  bedrock: {},
  ollama: {}
}

/** `transport:modelId`, mirroring the key shape the library's registry uses. */
export function harnessProfileKey(
  selection: Pick<ModelSelection, 'provider' | 'routeProvider'> & { modelId: string }
): string {
  return `${selection.routeProvider ?? selection.provider}:${selection.modelId}`
}

function keyForModel(model: AIModel): string {
  return `${modelTransportProvider(model)}:${model.id}`
}

/** The catalogue fields that shape the harness, or undefined when none are set. */
function harnessOptionsFor(model: AIModel): HarnessProfileOptions | undefined {
  const options: HarnessProfileOptions = {}
  if (model.systemPromptSuffix) options.systemPromptSuffix = model.systemPromptSuffix
  if (model.excludedTools?.length) options.excludedTools = [...model.excludedTools]
  if (model.toolDescriptionOverrides && Object.keys(model.toolDescriptionOverrides).length) {
    options.toolDescriptionOverrides = { ...model.toolDescriptionOverrides }
  }
  if (model.generalPurposeSubagent) options.generalPurposeSubagent = { ...model.generalPurposeSubagent }
  return Object.keys(options).length > 0 ? options : undefined
}

/** transport:modelId → validated profile. Replaced wholesale on each sync. */
let registry = new Map<string, HarnessProfile>()

export function registerHarnessProfilesFromCatalog(models: ReadonlyArray<AIModel> | null | undefined): void {
  if (!Array.isArray(models)) return

  const next = new Map<string, HarnessProfile>()
  for (const model of models) {
    const transport = modelTransportProvider(model) as ModelTransport
    const transportDefaults = TRANSPORT_HARNESS_DEFAULTS[transport]
    const advertised = harnessOptionsFor(model)
    if (!advertised && !(transportDefaults && Object.keys(transportDefaults).length)) continue

    // The model's own fields win over its transport default.
    const options: HarnessProfileOptions = { ...transportDefaults, ...advertised }
    try {
      next.set(keyForModel(model), createHarnessProfile(options))
    } catch (error) {
      // A malformed profile must not take the catalogue (or the agent) down —
      // the model simply runs unshaped.
      remixAILogger.warn(`[harnessProfiles] rejected profile for ${keyForModel(model)}`, error)
    }
  }

  registry = next
  if (next.size > 0) {
    remixAILogger.log(`[harnessProfiles] ${next.size} harness profile(s) from the catalogue`)
  }
}

/**
 * The profile for a selection, or undefined when it has none.
 */
export function resolveHarnessProfile(
  selection: Pick<ModelSelection, 'provider' | 'routeProvider'> & { modelId: string }
): HarnessProfile | undefined {
  const transport = selection.routeProvider ?? selection.provider
  return registry.get(harnessProfileKey(selection)) ?? registry.get(`${transport}:`)
}

/** Test seam — drops every registered profile. */
export function clearHarnessProfiles(): void {
  registry = new Map()
}

/**
 * Apply a profile's tool rules to the tool list we hand `createDeepAgent`.
 */
export function applyHarnessToolRules<T extends { name?: string; description?: string }>(
  tools: T[],
  profile: HarnessProfile | undefined
): T[] {
  if (!profile || !Array.isArray(tools)) return tools

  const excluded = profile.excludedTools
  const overrides = profile.toolDescriptionOverrides
  const hasExclusions = excluded && excluded.size > 0
  const hasOverrides = overrides && Object.keys(overrides).length > 0
  if (!hasExclusions && !hasOverrides) return tools

  const kept = hasExclusions
    ? tools.filter((tool) => !(tool?.name && excluded.has(tool.name)))
    : tools

  if (!hasOverrides) return kept
  return kept.map((tool) => {
    const override = tool?.name ? overrides[tool.name] : undefined
    return override ? { ...tool, description: override } : tool
  })
}
