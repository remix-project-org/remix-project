import React, { useEffect } from 'react'
import { Features } from '@remix-api'
import './completion-nudge.css'

/**
 * AI code completion promotion.
 *
 * Inline completion runs silently on keystrokes, so when it can't run (signed
 * out, out of credits, …) the user never finds out what they're missing. The
 * nudge plugin turns that state into:
 *   - a persistent pill next to the editor's "AI copilot" toggle (bottom bar)
 *   - an explainer modal per state, shown at a pause in typing and repeated
 *     every few days while the problem lasts
 * Switching AI copilot off makes both go away for good.
 */

export type CompletionNudgeKind = 'signin' | 'credits' | 'verify-email' | 'upgrade'

export const COMPLETION_NUDGE_KINDS: CompletionNudgeKind[] = ['signin', 'credits', 'verify-email', 'upgrade']

/** Serializable pill state, sent to the bottom bar. */
export interface CompletionNudge {
  kind: CompletionNudgeKind
  label: string
  tooltip: string
  icon: string
}

/** planManager.open() intent */
export type PlanManagerIntent = { reason?: string, initialSection?: 'plans' | 'topup' | 'usage', requiredFeature?: string }

interface Cta {
  label: string
  intent: PlanManagerIntent
}

interface KindCopy {
  pill: { label: string, tooltip: string, icon: string }
  title: string
  lead: (onFreePlan: boolean) => string
  primary: Cta
  /** Optional second offer (e.g. "go monthly" next to "top up") */
  secondary?: (onFreePlan: boolean) => Cta | null
  accent: string
}

const COPY: Record<CompletionNudgeKind, KindCopy> = {
  'signin': {
    pill: {
      label: 'Sign in for AI completions',
      tooltip: 'AI completions suggest code as you type. Sign in (it\'s free) to turn them on.',
      icon: 'fas fa-wand-magic-sparkles'
    },
    title: 'Write Solidity faster with AI completions',
    lead: () => 'Remix can suggest the rest of the line, or the whole block, while you type. Sign in to turn it on: the free plan comes with starter AI credits and needs no card.',
    primary: { label: 'Sign up free', intent: { reason: 'auth-required', initialSection: 'plans' } },
    accent: 'var(--custom-ai-color, #8b5cf6)'
  },
  'credits': {
    pill: {
      label: 'Completions paused · Top up',
      tooltip: 'You\'re out of AI credits, so code suggestions are paused. Top up to switch them back on.',
      icon: 'fas fa-bolt'
    },
    title: 'Your AI completions are paused',
    lead: (onFreePlan) => onFreePlan
      ? 'You\'re out of AI credits, so Remix stopped suggesting code as you type. Top up once (top-up credits never expire) or go monthly for fresh credits every month.'
      : 'You\'ve used all your AI credits, so Remix stopped suggesting code as you type. Top up to switch suggestions back on; top-up credits never expire.',
    primary: { label: 'Top up credits', intent: { reason: 'quota-exhausted', initialSection: 'topup' } },
    secondary: (onFreePlan) => onFreePlan ? { label: 'Go monthly', intent: { initialSection: 'plans' } } : null,
    accent: '#f59e0b'
  },
  'verify-email': {
    pill: {
      label: 'Verify email for AI completions',
      tooltip: 'Confirm your email address to turn on AI code suggestions.',
      icon: 'fas fa-envelope-circle-check'
    },
    title: 'Verify your email to turn on AI completions',
    lead: () => 'Confirm your email address and Remix will start suggesting code as you type.',
    primary: { label: 'Verify email', intent: { reason: 'email-unverified' } },
    accent: '#60a5fa'
  },
  'upgrade': {
    pill: {
      label: 'Unlock AI completions',
      tooltip: 'AI code suggestions aren\'t included in your plan. See the plans that include them.',
      icon: 'fas fa-lock'
    },
    title: 'AI completions aren\'t included in your plan',
    lead: () => 'Pick a plan with AI completions and Remix will suggest code as you type.',
    primary: { label: 'See plans', intent: { reason: 'feature-required', requiredFeature: Features.AI_COMPLETION, initialSection: 'plans' } },
    accent: '#a78bfa'
  }
}

const BENEFITS: { icon: string, text: React.ReactNode }[] = [
  { icon: 'fas fa-bolt', text: <>Finishes the line or block you&apos;re writing. Press <kbd>Tab</kbd> to accept.</> },
  { icon: 'fas fa-cubes', text: 'Tuned for Solidity and aware of the other contracts in your workspace.' },
  { icon: 'fas fa-comment-dots', text: <>Describe what you need in a <code>///</code> comment and get the code.</> }
]

export function buildCompletionNudge(kind: CompletionNudgeKind): CompletionNudge {
  const { label, tooltip, icon } = COPY[kind].pill
  return { kind, label, tooltip, icon }
}

export function completionCta(kind: CompletionNudgeKind, which: 'primary' | 'secondary', onFreePlan: boolean): PlanManagerIntent | null {
  const copy = COPY[kind]
  if (which === 'primary') return copy.primary.intent
  return copy.secondary?.(onFreePlan)?.intent ?? null
}

/* ─── One-time explainer modal ─── */

interface CompletionPromoModalProps {
  kind: CompletionNudgeKind
  onFreePlan: boolean
  onAction: (which: 'primary' | 'secondary') => void
  onClose: () => void
}

export function CompletionPromoModal({ kind, onFreePlan, onAction, onClose }: CompletionPromoModalProps) {
  const copy = COPY[kind]
  const secondary = copy.secondary?.(onFreePlan) ?? null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="cn-backdrop" onClick={onClose} />
      <div
        className="cn-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cn-modal-title"
        data-id={`completionPromo-${kind}`}
        style={{ '--cn-accent': copy.accent } as React.CSSProperties}
      >
        <button className="cn-close" onClick={onClose} title="Close" data-id="completionPromoClose">
          <i className="fas fa-times"></i>
        </button>

        <CompletionDemo />

        <div className="cn-body">
          <span className="cn-eyebrow"><i className="fas fa-wand-magic-sparkles"></i> AI code completion</span>
          <h5 id="cn-modal-title" className="cn-title">{copy.title}</h5>
          <p className="cn-lead">{copy.lead(onFreePlan)}</p>
          <ul className="cn-benefits">
            {BENEFITS.map((b, i) => (
              <li key={i}><i className={b.icon}></i><span>{b.text}</span></li>
            ))}
          </ul>
          <div className="cn-actions">
            <button className="btn cn-primary" onClick={() => onAction('primary')} data-id="completionPromoPrimary">
              {copy.primary.label}
            </button>
            {secondary && (
              <button className="btn cn-secondary" onClick={() => onAction('secondary')} data-id="completionPromoSecondary">
                {secondary.label}
              </button>
            )}
            <button className="btn btn-link cn-later" onClick={onClose} data-id="completionPromoLater">Not now</button>
          </div>
          <p className="cn-footnote">
            Rather type everything yourself? Switch off <strong>AI copilot</strong> in the editor&apos;s bottom bar and we won&apos;t bring it up again.
          </p>
        </div>
      </div>
    </>
  )
}

/** Mini editor: a line is typed, a ghost suggestion appears, Tab accepts it. Loops. */
function CompletionDemo() {
  return (
    <div className="cn-demo" aria-hidden="true">
      <div className="cn-demo-code">
        <div><span className="cn-kw">function</span> <span className="cn-fn">withdraw</span>(<span className="cn-ty">uint256</span> amount) <span className="cn-kw">external</span> {'{'}</div>
        <div className="cn-demo-line">
          {'    '}<span className="cn-typed">require(</span>
          <span className="cn-ghost">balances[msg.sender] &gt;= amount, <span className="cn-str">&quot;Insufficient balance&quot;</span>);</span>
          <span className="cn-caret" />
        </div>
        <div className="cn-ghost cn-ghost--block">{'    '}balances[msg.sender] -= amount;</div>
        <div className="cn-ghost cn-ghost--block">{'    '}<span className="cn-kw">payable</span>(msg.sender).<span className="cn-fn">transfer</span>(amount);</div>
        <div>{'}'}</div>
      </div>
      <span className="cn-demo-key"><kbd>Tab</kbd> to accept</span>
    </div>
  )
}
