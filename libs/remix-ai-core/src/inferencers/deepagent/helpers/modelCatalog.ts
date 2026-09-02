import type { Plugin } from '@remixproject/engine'
import { remixAILogger } from '../../../helpers/logger'
import { AIModel } from '../../../types/models'
import { ModelSelection } from '../../../types/deepagent'
import { setModelCatalog } from '../modelParams'
import { registerHarnessProfilesFromCatalog } from '../harnessProfiles'

export async function syncModelCatalog(plugin: Plugin): Promise<AIModel[]> {
  try {
    const models = await (plugin as any).call?.('assistantState', 'getAvailableModels')
    if (Array.isArray(models)) {
      setModelCatalog(models)
      registerHarnessProfilesFromCatalog(models)
      return models
    }
  } catch { /* assistantState not active — callers fall back to defaults */ }
  return []
}

function toSelection(model: AIModel): ModelSelection {
  return {
    provider: model.provider,
    modelId: model.id,
    routeProvider: model.routeProvider
  }
}

/** The backend's assignment for a named task, resolved against the catalogue. */
async function selectionForTask(plugin: Plugin, catalog: AIModel[], taskId: string): Promise<ModelSelection | null> {
  try {
    const modelId: string | null = await (plugin as any).call?.('assistantState', 'getModelForTask', taskId)
    if (!modelId) return null
    const row = catalog.find((m) => m.id === modelId && m.available)
    if (row) return toSelection(row)
    remixAILogger.warn(`[modelCatalog] task '${taskId}' names ${modelId}, which is not an available catalogue row`)
  } catch { /* task_models not advertised */ }
  return null
}

/**
 * The backend's explicit `code_generation` assignment, for the subagents —
 * or null, meaning "keep the model you already have".
 *
 * Only an assignment can displace the user's selection, and only when the
 * catalogue backs it with tool support and an id the transport can address.
 * Nothing here searches the catalogue for a replacement: a row good enough to
 * pick out of a list is not the same as a row that works.
 */
export async function resolveCodeCapableSelection(
  plugin: Plugin,
  current: ModelSelection
): Promise<ModelSelection | null> {
  const catalog = await syncModelCatalog(plugin)
  if (!catalog.length) return null

  // A substitute is only ever an improvement on paper: the user's own model is
  // the one the main agent is demonstrably running. Two rounds of this picking
  // an arbitrary `candidates[0]` — an 8B roleplay model, then an id OpenRouter
  // does not publish — say the catalogue cannot be mined for a replacement.
  // So: honour an explicit backend assignment, and otherwise change nothing.
  const advertises = (m: AIModel | undefined, ...names: string[]) =>
    Array.isArray(m?.capabilities) && m.capabilities.some((c) => names.includes(c))

  // Subagents bind tools on every request, so an assignment that cannot call
  // them breaks every specialist it is handed to.
  const assigned = await selectionForTask(plugin, catalog, 'code_generation')
  if (!assigned) return null

  const assignedRow = catalog.find((m) => m.id === assigned.modelId)
  if (!advertises(assignedRow, 'tools', 'tool_use', 'function_calling')) {
    remixAILogger.warn(
      `[modelCatalog] task 'code_generation' names ${assigned.modelId}, which does not advertise tool calling — ` +
      `subagents stay on ${current.modelId}`
    )
    return null
  }

  // OpenRouter addresses models as `vendor/slug`. A bare id is Remix-internal
  // naming that reaches the provider as `400 not a valid model ID`.
  if ((assigned.routeProvider ?? assigned.provider) === 'openrouter' && !assigned.modelId.includes('/')) {
    remixAILogger.warn(
      `[modelCatalog] task 'code_generation' names '${assigned.modelId}', which is not an OpenRouter vendor/slug id — ` +
      `subagents stay on ${current.modelId}`
    )
    return null
  }

  remixAILogger.log(`[modelCatalog] subagents use the assigned ${assigned.modelId} instead of ${current.modelId}`)
  return assigned
}
