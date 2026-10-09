/**
 * Model selection tools for the Remix MCP Server.
 *
 * Lets the agent see which models the user can run and request a switch to one
 * of them. The switch is deliberately *queued* rather than applied: see
 * SwitchModelHandler for why applying inline destroys the running agent.
 */
import { remixAILogger } from '../../helpers/logger'
import { IMCPToolResult } from '../../types/mcp'
import { BaseToolHandler } from '../registry/RemixToolRegistry'
import { ToolCategory, RemixToolDefinition } from '../types/mcpTools'
import { AIModel, findModel, modelTransportProvider, BYOK_API_KEY_SETTINGS } from '../../types/models'
import { isFrontierModelId } from '../../helpers/modelTiers'
import { Plugin } from '@remixproject/engine'

export interface ListModelsArgs { frontierOnly?: boolean }
export interface SwitchModelArgs { modelId: string; provider?: string; reason?: string }

/** The catalogue the user is actually entitled to, as the agent should see it. */
async function loadModels(plugin: Plugin): Promise<AIModel[]> {
  const models = await plugin.call('assistantState' as any, 'getAvailableModels' as any)
  return Array.isArray(models) ? models : []
}

// ─── list_models ─────────────────────────────────────────────────────────────

export class ListModelsHandler extends BaseToolHandler {
  name = 'list_models'
  description =
    'List the AI models this user can switch to, with the id to pass to switch_model. ' +
    'Call this before switch_model unless you already know the exact id — guessing ids fails. '

  inputSchema = {
    type: 'object' as const,
    properties: {
      frontierOnly: {
        type: 'boolean',
        description: 'Only return frontier-class models (best for audits and other heavy reasoning).'
      }
    },
    required: [] as string[]
  }

  getPermissions(): string[] {
    return []
  }

  async execute(args: ListModelsArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const models = await loadModels(plugin)
      const selectedId = (plugin as any).selectedModelId ?? null
      const usable = models
        .filter(model => model && model.available !== false)
        .map(model => ({
          id: model.id,
          provider: model.provider,
          displayName: model.displayName,
          frontier: isFrontierModelId(model.id)
        }))
      const listed = args?.frontierOnly ? usable.filter(model => model.frontier) : usable
      return this.createSuccessResult({ selectedId, models: listed, count: listed.length })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return this.createErrorResult(`Could not read the model catalogue: ${msg}`)
    }
  }
}

// ─── switch_model ────────────────────────────────────────────────────────────

export class SwitchModelHandler extends BaseToolHandler {
  name = 'switch_model'
  description =
    'Switch the assistant model, using an exact id from list_models. ' +
    'Takes effect on the NEXT message, never mid-answer. ' +
    'Ask the user first: it changes their setting and their costs.'

  inputSchema = {
    type: 'object' as const,
    properties: {
      modelId: {
        type: 'string',
        description: 'Exact model id from list_models, e.g. "anthropic/claude-sonnet-4-5".'
      },
      provider: {
        type: 'string',
        description: 'Optional provider, to disambiguate when the same id exists twice.'
      },
      reason: {
        type: 'string',
        description: 'One sentence shown to the user explaining why this model is better here.'
      }
    },
    required: ['modelId']
  }

  getPermissions(): string[] {
    return []
  }

  validate(args: SwitchModelArgs): boolean | string {
    const required = this.validateRequired(args, ['modelId'])
    if (required !== true) return required
    if (typeof args.modelId !== 'string' || args.modelId.trim() === '') {
      return 'modelId must be a non-empty string — use list_models to get valid ids'
    }
    return true
  }

  async execute(args: SwitchModelArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const models = await loadModels(plugin)
      const model = findModel(models, args.modelId, args.provider)
      if (!model) {
        const known = models.filter(m => m.available !== false).map(m => m.id).slice(0, 20).join(', ')
        return this.createErrorResult(`Unknown model "${args.modelId}". Available ids: ${known || 'none'}`)
      }

      // The paywall and the sign-in flow are UI concerns; a tool cannot open
      // them, so say plainly what the user has to do instead of half-switching.
      if (model.available === false) {
        return this.createErrorResult(
          `${model.displayName} is not available to this user (${model.reason || 'locked'}). ` +
          'Tell them to unlock it from the model selector rather than retrying.'
        )
      }

      if (model.requireAPIKey) {
        const setting = BYOK_API_KEY_SETTINGS[modelTransportProvider(model)]
        const key = setting ? await plugin.call('settings' as any, 'get' as any, `settings/${setting}`) : null
        if (!key) {
          return this.createErrorResult(
            `${model.displayName} needs the user's own API key. ` +
            'Tell them to add it under Settings → RemixAI Assistant → Bring Your Own API Keys.'
          )
        }
      }

      if ((plugin as any).selectedModelId === model.id) {
        return this.createSuccessResult({ switched: false, model: model.displayName, note: 'Already the selected model.' })
      }

      // Queue, never apply here. plugin.setModel -> ModelManager.setModel ->
      // DeepAgentManager.reinitialize() -> close() on the very inferencer that
      // is running this tool call, which would kill the turn mid-flight. The
      // chat UI drains this once the stream ends.
      plugin.emit('modelSwitchRequested', {
        modelId: model.id,
        provider: model.provider,
        displayName: model.displayName,
        reason: args.reason ?? null
      })

      return this.createSuccessResult({
        switched: true,
        appliesTo: 'next message',
        model: model.displayName,
        note: `Switch to ${model.displayName} queued; it takes effect on the next message, not this one.`
      })
    } catch (error) {
      remixAILogger.error('[switch_model] execution error:', error)
      const msg = error instanceof Error ? error.message : String(error)
      return this.createErrorResult(`Could not switch model: ${msg}`)
    }
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createModelSelectionTools(): RemixToolDefinition[] {
  const list = new ListModelsHandler()
  const swap = new SwitchModelHandler()
  return [
    {
      name: list.name,
      description: list.description,
      inputSchema: list.inputSchema,
      category: ToolCategory.COORDINATION,
      permissions: list.getPermissions(),
      handler: list
    },
    {
      name: swap.name,
      description: swap.description,
      inputSchema: swap.inputSchema,
      category: ToolCategory.COORDINATION,
      permissions: swap.getPermissions(),
      handler: swap
    }
  ]
}
