import React, { useState } from 'react'
import { GenerativeUIPayload } from '@remix/remix-ai-core'

// ─── Local type mirror (matches GenerativeUIHandler.ts UINode union) ─────────

type NodeType =
  | 'text' | 'stack' | 'card' | 'button'
  | 'input' | 'select' | 'radio_group' | 'checkbox'
  | 'form' | 'badge' | 'divider'

interface BaseNode { type: NodeType }
interface TextNode    extends BaseNode { type: 'text';       content: string; variant?: 'body' | 'heading' | 'caption' | 'code' }
interface StackNode   extends BaseNode { type: 'stack';      direction: 'row' | 'column'; gap?: number; children: UINode[] }
interface CardNode    extends BaseNode { type: 'card';       title?: string; children: UINode[] }
interface ButtonNode  extends BaseNode { type: 'button';     label: string; action: string; style?: 'primary' | 'secondary' | 'danger'; disabled?: boolean }
interface InputNode   extends BaseNode { type: 'input';      name: string; label: string; placeholder?: string; inputType?: string; required?: boolean }
type SelectOption = string | { label: string; value: string }
interface SelectNode  extends BaseNode { type: 'select';     name: string; label: string; options: SelectOption[]; required?: boolean }
interface RadioNode   extends BaseNode { type: 'radio_group'; name: string; label: string; options: SelectOption[]; required?: boolean }
interface CheckboxNode extends BaseNode { type: 'checkbox';  name: string; label: string; defaultChecked?: boolean }
interface FormNode    extends BaseNode { type: 'form';       children: UINode[]; submitLabel: string; action: string }
interface BadgeNode   extends BaseNode { type: 'badge';      content: string; variant?: 'info' | 'success' | 'warning' | 'error' }
interface DividerNode extends BaseNode { type: 'divider' }

type UINode = TextNode | StackNode | CardNode | ButtonNode | InputNode | SelectNode | RadioNode | CheckboxNode | FormNode | BadgeNode | DividerNode

// ─── Option helpers ───────────────────────────────────────────────────────────

const optValue = (opt: SelectOption): string => typeof opt === 'string' ? opt : opt.value
const optLabel = (opt: SelectOption): string => typeof opt === 'string' ? opt : opt.label

// ─── Badge colour map ─────────────────────────────────────────────────────────

const badgeClass: Record<string, string> = {
  info:    'bg-info text-dark',
  success: 'bg-success',
  warning: 'bg-warning text-dark',
  error:   'bg-danger',
}

// ─── Form wrapper — manages its own field state ───────────────────────────────

function FormWrapper({ node, onAction, depth }: { node: FormNode; onAction: (action: string, data?: Record<string, any>) => void; depth: number }) {
  const [values, setValues] = useState<Record<string, any>>({})
  const handleChange = (name: string, value: any) => setValues(prev => ({ ...prev, [name]: value }))
  const hasButtonChild = node.children?.some(c => c.type === 'button')
  return (
    <form
      onSubmit={e => { e.preventDefault(); onAction(node.action, values) }}
      className="d-flex flex-column gap-2"
    >
      {node.children && node.children.map((child, i) => (
        <RenderNode key={i} node={child as UINode} onAction={onAction} onChange={handleChange} depth={depth + 1} asFormSubmit={child.type === 'button'} />
      ))}
      {!hasButtonChild && (
        <div>
          <button type="submit" className="btn btn-primary btn-sm mt-1">
            {node.submitLabel || 'Submit'}
          </button>
        </div>
      )}
    </form>
  )
}

// ─── Recursive node renderer ──────────────────────────────────────────────────

function RenderNode({
  node,
  onAction,
  onChange,
  depth = 0,
  asFormSubmit = false,
}: {
  node: UINode
  onAction: (action: string, data?: Record<string, any>) => void
  onChange?: (name: string, value: any) => void
  depth?: number
  asFormSubmit?: boolean
}) {
  if (!node || typeof node.type !== 'string') return null
  if (depth > 8) return null // safety guard

  switch (node.type) {
  case 'text': {
    const { content, variant = 'body' } = node
    if (variant === 'heading') return <h6 className="fw-semibold mb-1">{content}</h6>
    if (variant === 'caption') return <small className="text-muted">{content}</small>
    if (variant === 'code') return <code className="ai-inline-code">{content}</code>
    return <p className="mb-0">{content}</p>
  }

  case 'stack': {
    const dir = node.direction === 'row' ? 'flex-row flex-wrap' : 'flex-column'
    const gap = node.gap ?? 2
    return (
      <div className={`d-flex ${dir} gap-${Math.min(gap, 5)}`}>
        {(node.children ?? []).map((c, i) => (
          <RenderNode key={i} node={c as UINode} onAction={onAction} onChange={onChange} depth={depth + 1} />
        ))}
      </div>
    )
  }

  case 'card': {
    return (
      <div className="card border rounded p-2">
        {node.title && <div className="fw-semibold mb-1 small text-uppercase text-muted">{node.title}</div>}
        <div className="d-flex flex-column gap-2">
          {(node.children ?? []).map((c, i) => (
            <RenderNode key={i} node={c as UINode} onAction={onAction} onChange={onChange} depth={depth + 1} />
          ))}
        </div>
      </div>
    )
  }

  case 'button': {
    const bsVariant = node.style === 'danger' ? 'danger' : node.style === 'secondary' ? 'secondary' : 'primary'
    return (
      <button
        type={asFormSubmit ? 'submit' : 'button'}
        disabled={!!node.disabled}
        className={`btn btn-${bsVariant} btn-sm`}
        onClick={asFormSubmit ? undefined : () => onAction(node.action)}
      >
        {node.label}
      </button>
    )
  }

  case 'input': {
    return (
      <div className="mb-1">
        <label className="form-label small mb-1">{node.label}{node.required && <span className="text-danger ms-1">*</span>}</label>
        <input
          type={node.inputType ?? 'text'}
          className="form-control form-control-sm"
          placeholder={node.placeholder ?? ''}
          required={node.required}
          onChange={e => onChange?.(node.name, e.target.value)}
        />
      </div>
    )
  }

  case 'select': {
    return (
      <div className="mb-1">
        <label className="form-label small mb-1">{node.label}{node.required && <span className="text-danger ms-1">*</span>}</label>
        <select
          className="form-select form-select-sm"
          required={node.required}
          onChange={e => onChange?.(node.name, e.target.value)}
          defaultValue=""
        >
          <option value="" disabled>Select…</option>
          {(node.options ?? []).map(opt => (
            <option key={optValue(opt)} value={optValue(opt)}>{optLabel(opt)}</option>
          ))}
        </select>
      </div>
    )
  }

  case 'radio_group': {
    return (
      <div className="mb-1">
        <div className="form-label small mb-1">{node.label}{node.required && <span className="text-danger ms-1">*</span>}</div>
        {(node.options ?? []).map(opt => (
          <div key={optValue(opt)} className="form-check">
            <input
              type="radio"
              id={`${node.name}-${optValue(opt)}`}
              name={node.name}
              value={optValue(opt)}
              className="form-check-input"
              required={node.required}
              onChange={() => onChange?.(node.name, optValue(opt))}
            />
            <label htmlFor={`${node.name}-${optValue(opt)}`} className="form-check-label small">{optLabel(opt)}</label>
          </div>
        ))}
      </div>
    )
  }

  case 'checkbox': {
    return (
      <div className="form-check mb-1">
        <input
          type="checkbox"
          id={`chk-${node.name}`}
          className="form-check-input"
          defaultChecked={node.defaultChecked}
          onChange={e => onChange?.(node.name, e.target.checked)}
        />
        <label htmlFor={`chk-${node.name}`} className="form-check-label small">{node.label}</label>
      </div>
    )
  }

  case 'form': {
    return <FormWrapper node={node} onAction={onAction} depth={depth} />
  }

  case 'badge': {
    const cls = badgeClass[node.variant ?? 'info'] ?? badgeClass.info
    return <span className={`badge ${cls}`}>{node.content}</span>
  }

  case 'divider': {
    return <hr className="my-1" />
  }

  default:
    return null
  }
}

// ─── Public component ─────────────────────────────────────────────────────────

interface GenerativeUIRendererProps {
  payload: GenerativeUIPayload
  /** Called when the user clicks a button or submits a form.
   *  action — the node's action identifier string.
   *  data   — collected form field values (only for form submissions). */
  onAction: (action: string, data?: Record<string, any>) => void
}

export const GenerativeUIRenderer: React.FC<GenerativeUIRendererProps> = ({ payload, onAction }) => {
  const node = payload.tree as UINode
  if (!node || typeof node.type !== 'string') return null

  return (
    <div className="generative-ui-component mt-2 p-2 rounded" style={{ border: '1px solid var(--bs-border-color)' }}>
      {payload.title && (
        <div className="fw-semibold small mb-2 text-ai">{payload.title}</div>
      )}
      <RenderNode node={node} onAction={onAction} depth={0} />
    </div>
  )
}
