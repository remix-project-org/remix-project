import React from 'react'

/**
 * CooldownBanner
 *
 * Plain informational alert rendered above the chat input when the AI
 * assistant is rate-limited or terminally blocked. Driven by the
 * `CooldownDisplay` snapshot the assistant-state plugin exposes via
 * `getCooldownDisplay()`.
 *
 * Intentionally simple: no countdown, no polling, no per-second
 * re-render. Just the backend's message and a dismiss button. The user
 * can keep typing and sending — if they retry while rate-limited the
 * backend will reject the request and the next error envelope refreshes
 * the banner.
 */
export interface CooldownBannerDisplay {
  active: boolean
  isTerminal: boolean
  remainingMs: number
  remainingSec: number
  expiresAt: number | null
  feature: string | null
  limit: number | null
  window: string | null
  message: string
  code: string
}

interface CooldownBannerProps {
  display: CooldownBannerDisplay
  onDismiss?: () => void
}

function formatExpiresAt(expiresAt: number | null): string | null {
  if (!expiresAt) return null
  try {
    return new Date(expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return null
  }
}

export const CooldownBanner: React.FC<CooldownBannerProps> = ({ display, onDismiss }) => {
  const isTerminal = display.isTerminal
  const isGlobal = display.code === 'RATE_LIMITED_GLOBAL'

  const title = isTerminal
    ? 'Access blocked'
    : isGlobal
      ? 'Slow down'
      : 'Rate limit reached'

  const icon = isTerminal ? 'fa-ban' : isGlobal ? 'fa-gauge-high' : 'fa-hourglass-half'
  const expiresAtText = !isTerminal ? formatExpiresAt(display.expiresAt) : null

  return (
    <div
      className={`alert mb-1 mx-2 py-2 px-3 d-flex align-items-start gap-2 ${
        isTerminal ? 'alert-danger' : 'alert-warning'
      }`}
      role="alert"
      data-id="ai-cooldown-banner"
      style={{ borderRadius: 8, fontSize: '0.85rem' }}
    >
      <i className={`fa-solid ${icon} mt-1`} aria-hidden="true" />
      <div className="flex-grow-1">
        <div className="fw-bold">{title}</div>
        <div className="small">{display.message}</div>
        {expiresAtText && (
          <div className="small text-muted mt-1">
            <i className="fa-regular fa-clock me-1" aria-hidden="true" />
            Resets at {expiresAtText}
          </div>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          className="btn btn-sm btn-link text-decoration-none p-0 ms-2"
          aria-label="Dismiss"
          data-id="ai-cooldown-dismiss"
          onClick={onDismiss}
        >
          <i className="fa-solid fa-xmark" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
