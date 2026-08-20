/**
 * Generative UI Tool Handler for Remix MCP Server
 *
 * Enables the AI to render structured UI components in the chat interface
 * instead of plain text, following the "generative UI" pattern where the
 * model outputs structured intent (a UINode tree) and the frontend decides
 * how to render it.
 */
import { remixAILogger } from '../../helpers/logger'
import { IMCPToolResult } from '../../types/mcp'
import { BaseToolHandler } from '../registry/RemixToolRegistry'
import { ToolCategory, RemixToolDefinition } from '../types/mcpTools'
import { Plugin } from '@remixproject/engine'

// ─── UINode type definitions (exported for frontend use) ─────────────────────

export interface TextNode {
  type: 'text'
  content: string
  variant?: 'body' | 'heading' | 'caption' | 'code'
}

export interface StackNode {
  type: 'stack'
  direction: 'row' | 'column'
  gap?: number
  children: UINode[]
}

export interface CardNode {
  type: 'card'
  title?: string
  children: UINode[]
}

export interface ButtonNode {
  type: 'button'
  label: string
  /** Opaque identifier sent back to the AI when the user clicks */
  action: string
  style?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
}

export interface InputNode {
  type: 'input'
  name: string
  label: string
  placeholder?: string
  inputType?: 'text' | 'number' | 'password' | 'email'
  required?: boolean
}

export interface SelectNode {
  type: 'select'
  name: string
  label: string
  options: string[]
  required?: boolean
}

export interface RadioGroupNode {
  type: 'radio_group'
  name: string
  label: string
  options: string[]
  required?: boolean
}

export interface CheckboxNode {
  type: 'checkbox'
  name: string
  label: string
  defaultChecked?: boolean
}

export interface FormNode {
  type: 'form'
  children: UINode[]
  submitLabel: string
  /** Opaque identifier sent back to the AI when the form is submitted */
  action: string
}

export interface BadgeNode {
  type: 'badge'
  content: string
  variant?: 'info' | 'success' | 'warning' | 'error'
}

export interface DividerNode {
  type: 'divider'
}

export type UINode =
  | TextNode
  | StackNode
  | CardNode
  | ButtonNode
  | InputNode
  | SelectNode
  | RadioGroupNode
  | CheckboxNode
  | FormNode
  | BadgeNode
  | DividerNode

/** Payload emitted on the plugin 'renderUI' event and sent to the chat UI */
export interface RenderUIPayload {
  tree: UINode
  title?: string
}

export interface RenderUIArgs {
  tree: UINode
  title?: string
}

// ─── Validation limits ────────────────────────────────────────────────────────

const MAX_DEPTH = 8
const MAX_CHILDREN = 24

const VALID_TYPES = new Set([
  'text', 'stack', 'card', 'button', 'input',
  'select', 'radio_group', 'checkbox', 'form', 'badge', 'divider'
])

// ─── JSON Schema (for MCP protocol introspection) ────────────────────────────

const UI_NODE_SCHEMA = {
  type: 'object',
  description: 'A UINode — one of: text, stack, card, button, input, select, radio_group, checkbox, form, badge, divider.',
  properties: {
    type: {
      type: 'string',
      enum: Array.from(VALID_TYPES),
      description: 'The kind of UI element.'
    },
    // text
    content:     { type: 'string' },
    variant:     { type: 'string', enum: ['body', 'heading', 'caption', 'code', 'info', 'success', 'warning', 'error'] },
    // stack
    direction:   { type: 'string', enum: ['row', 'column'] },
    gap:         { type: 'number' },
    // card
    title:       { type: 'string' },
    // button / form
    label:       { type: 'string' },
    action:      { type: 'string' },
    style:       { type: 'string', enum: ['primary', 'secondary', 'danger'] },
    disabled:    { type: 'boolean' },
    submitLabel: { type: 'string' },
    // input / select / radio_group / checkbox
    name:        { type: 'string' },
    placeholder: { type: 'string' },
    inputType:   { type: 'string', enum: ['text', 'number', 'password', 'email'] },
    required:    { type: 'boolean' },
    defaultChecked: { type: 'boolean' },
    options:     { type: 'array', items: { type: 'string' } },
    // container children — typed as array of objects to allow recursion
    children: {
      type: 'array',
      items: { type: 'object' }
    }
  },
  required: ['type']
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export class RenderUIHandler extends BaseToolHandler {
  name = 'render_ui'
  description =
    'Render a structured UI component inside the chat interface instead of plain text. ' +
    'Use this whenever you want to present interactive elements such as clarifying-question forms, ' +
    'option pickers, confirmation dialogs, progress cards, or multi-step wizards. ' +
    'Build the UI as a recursive tree of UINode primitives (text, stack, card, button, input, ' +
    'select, radio_group, checkbox, form, badge, divider). ' +
    'When the user interacts (button click or form submit) the action identifier and any ' +
    'collected form data are sent back to you as a follow-up message.'

  inputSchema = {
    type: 'object' as const,
    properties: {
      tree: UI_NODE_SCHEMA,
      title: {
        type: 'string',
        description: 'Optional heading displayed above the rendered component.'
      }
    },
    required: ['tree']
  }

  getPermissions(): string[] {
    return []
  }

  validate(args: RenderUIArgs): boolean | string {
    const required = this.validateRequired(args, ['tree'])
    if (required !== true) return required

    if (!args.tree || typeof args.tree !== 'object') {
      return 'tree must be an object'
    }

    return this.validateNode(args.tree, 0)
  }

  private validateNode(node: any, depth: number): true | string {
    if (depth > MAX_DEPTH) {
      return `UI tree exceeds maximum nesting depth of ${MAX_DEPTH}`
    }
    if (!node || typeof node !== 'object') {
      return `Node at depth ${depth} must be an object`
    }
    if (typeof node.type !== 'string' || !VALID_TYPES.has(node.type)) {
      return `Invalid node type "${node.type}" at depth ${depth}. Must be one of: ${Array.from(VALID_TYPES).join(', ')}`
    }

    // Validate required fields per type
    switch (node.type as UINode['type']) {
    case 'text':
      if (typeof node.content !== 'string' || node.content.trim() === '') {
        return 'text node requires a non-empty "content" string'
      }
      break
    case 'stack':
      if (node.direction !== 'row' && node.direction !== 'column') {
        return 'stack node requires "direction" of "row" or "column"'
      }
      break
    case 'button':
      if (typeof node.label !== 'string' || node.label.trim() === '') {
        return 'button node requires a non-empty "label" string'
      }
      if (typeof node.action !== 'string' || node.action.trim() === '') {
        return 'button node requires a non-empty "action" string'
      }
      break
    case 'input':
      if (typeof node.name !== 'string' || node.name.trim() === '') return 'input node requires "name"'
      if (typeof node.label !== 'string' || node.label.trim() === '') return 'input node requires "label"'
      break
    case 'select':
    case 'radio_group':
      if (typeof node.name !== 'string' || node.name.trim() === '') return `${node.type} node requires "name"`
      if (typeof node.label !== 'string' || node.label.trim() === '') return `${node.type} node requires "label"`
      if (!Array.isArray(node.options) || node.options.length === 0) return `${node.type} node requires a non-empty "options" array`
      break
    case 'checkbox':
      if (typeof node.name !== 'string' || node.name.trim() === '') return 'checkbox node requires "name"'
      if (typeof node.label !== 'string' || node.label.trim() === '') return 'checkbox node requires "label"'
      break
    case 'form':
      if (typeof node.submitLabel !== 'string' || node.submitLabel.trim() === '') {
        return 'form node requires a non-empty "submitLabel" string'
      }
      if (typeof node.action !== 'string' || node.action.trim() === '') {
        return 'form node requires a non-empty "action" string'
      }
      break
    case 'badge':
      if (typeof node.content !== 'string' || node.content.trim() === '') {
        return 'badge node requires a non-empty "content" string'
      }
      break
    }

    // Recurse into children
    if (node.children !== undefined) {
      if (!Array.isArray(node.children)) {
        return `"children" at depth ${depth} must be an array`
      }
      if (node.children.length > MAX_CHILDREN) {
        return `Node at depth ${depth} has too many children (max ${MAX_CHILDREN})`
      }
      for (let i = 0; i < node.children.length; i++) {
        const result = this.validateNode(node.children[i], depth + 1)
        if (result !== true) return `children[${i}]: ${result}`
      }
    }

    return true
  }

  async execute(args: RenderUIArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const payload: RenderUIPayload = {
        tree: args.tree,
        ...(args.title ? { title: args.title } : {})
      }

      // Emit to the remixAI plugin event bus so the chat UI can render the component.
      // The chat frontend listens via: plugin.on('remixAI', 'renderUI', (payload) => ...)
      plugin.emit('renderUI', payload)

      remixAILogger.log(`[render_ui] emitted renderUI event, rootType=${args.tree.type}`)

      return this.createSuccessResult({
        rendered: true,
        rootNodeType: args.tree.type,
        title: args.title ?? null,
        note: 'UI component rendered in the chat interface. Waiting for user interaction.'
      })
    } catch (error) {
      remixAILogger.error('[render_ui] execution error:', error)
      const msg = error instanceof Error ? error.message : String(error)
      return this.createErrorResult(`Failed to render UI: ${msg}`)
    }
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createGenerativeUITools(): RemixToolDefinition[] {
  return [
    {
      name: 'render_ui',
      description: new RenderUIHandler().description,
      inputSchema: new RenderUIHandler().inputSchema,
      category: ToolCategory.COORDINATION,
      permissions: [],
      handler: new RenderUIHandler()
    }
  ]
}
