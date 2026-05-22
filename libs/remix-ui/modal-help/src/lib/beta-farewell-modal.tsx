import React, { useMemo, useState } from 'react'

// ─── Types ───────────────────────────────────────────────────────

export type FarewellDismissKind = 'remind' | 'never'

interface BetaFarewellModalProps {
  /** Whether the modal is currently visible. */
  open: boolean
  /** ISO timestamp when the beta access expires. Optional — drives the day-count badge. */
  expiresAt?: string | null
  /** URL to the survey form. */
  surveyUrl: string
  /** Called when the user opens the survey (also auto-closes the modal). */
  onTakeSurvey: () => void
  /** Called when the user dismisses without a permanent preference. */
  onClose: () => void
  /** Called when the user picks one of the persistent dismiss options. */
  onDismiss: (kind: FarewellDismissKind) => void
}

// ─── Keyframes (locally scoped, prefixed bf-) ────────────────────

const KEYFRAMES = `
  @keyframes bfModalIn {
    from { opacity: 0; transform: scale(0.92) translateY(20px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }
  @keyframes bfOverlayIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes bfHeart {
    0%, 100% { transform: scale(1); }
    50%      { transform: scale(1.12); }
  }
`

// ─── Palette (mirrors beta-welcome-modal for visual cohesion) ────

const c = {
  bg: '#1a1a2e',
  s1: '#222240',
  s2: '#2a2a4a',
  cy: '#2fbfb1',
  tx: '#e0e0ec',
  tm: '#8888aa',
  td: '#5c5c7a',
  pu: '#9b7dff',
  am: '#f0a030',
  pk: '#e86baf',
  gn: '#6bdb8a'
}

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Days between now and the given ISO date. Returns null if no/invalid date.
 * Floors to integer days — "2 days left" means at least 24h remain.
 */
function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const ms = t - Date.now()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

function formatExpiry(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  // Locale-aware short date, e.g. "May 26, 2026".
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// ─── Sub-components ──────────────────────────────────────────────

const CloseButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const [h, setH] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: 28, height: 28, borderRadius: 6,
        background: h ? c.s2 : 'rgba(255,255,255,0.04)',
        border: '0.5px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color: h ? c.tx : c.tm,
        fontSize: 16, transition: 'all 0.2s'
      }}
      aria-label="Close"
    >
      &times;
    </div>
  )
}

const PrimaryButton: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => {
  const [h, setH] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        flex: 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '11px 18px',
        borderRadius: 10,
        background: h
          ? 'linear-gradient(135deg, rgba(47,191,177,0.28) 0%, rgba(155,125,255,0.28) 100%)'
          : 'linear-gradient(135deg, rgba(47,191,177,0.18) 0%, rgba(155,125,255,0.18) 100%)',
        border: `0.5px solid ${h ? 'rgba(47,191,177,0.55)' : 'rgba(47,191,177,0.35)'}`,
        color: c.tx, fontSize: 13, fontWeight: 600,
        cursor: 'pointer', transition: 'all 0.2s',
        fontFamily: "'DM Sans', sans-serif"
      }}
    >
      {children}
    </button>
  )
}

const GhostButton: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => {
  const [h, setH] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        flex: 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '10px 14px',
        borderRadius: 10,
        background: h ? c.s2 : 'transparent',
        border: `0.5px solid ${h ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'}`,
        color: h ? c.tx : c.tm, fontSize: 12, fontWeight: 500,
        cursor: 'pointer', transition: 'all 0.2s',
        fontFamily: "'DM Sans', sans-serif"
      }}
    >
      {children}
    </button>
  )
}

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase',
    color: c.td, marginBottom: 10,
    display: 'flex', alignItems: 'center', gap: 6
  }}>
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke={c.td} strokeWidth="1.5">
      <path d="M6 1v10M1 6h10" />
    </svg>
    {children}
  </div>
)

// ─── Main component ──────────────────────────────────────────────

/**
 * Farewell modal shown to beta testers as their access window closes.
 *
 * Surfaces the thank-you message, a survey CTA (which unlocks a 50% off
 * Pro reward), and reassures the user they'll transition to Free plan
 * automatically. Dismissal options ("Remind me later" / "Don't show again")
 * are handled by the parent via {@link onDismiss}.
 */
const BetaFarewellModal: React.FC<BetaFarewellModalProps> = ({
  open,
  expiresAt,
  surveyUrl,
  onTakeSurvey,
  onClose,
  onDismiss
}) => {
  const days = useMemo(() => daysUntil(expiresAt), [expiresAt])
  const expiryLabel = useMemo(() => formatExpiry(expiresAt), [expiresAt])

  if (!open) return null

  // Pick a calm headline based on remaining time. Past-expiry users still
  // get the survey (their feedback is just as valuable), so we keep the
  // copy welcoming rather than alarmist.
  const headline = days === null
    ? 'A heartfelt thank you'
    : days <= 0
      ? 'Your beta access has ended'
      : days <= 1
        ? 'Your beta access ends tomorrow'
        : `Your beta access ends in ${days} days`

  return (
    <>
      <style>{KEYFRAMES}</style>

      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          zIndex: 9998,
          animation: 'bfOverlayIn 0.3s ease'
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24, pointerEvents: 'none'
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            fontFamily: "'DM Sans', sans-serif",
            color: c.tx, background: c.bg,
            borderRadius: 20,
            border: '0.5px solid rgba(232,107,175,0.18)',
            width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto',
            animation: 'bfModalIn 0.5s cubic-bezier(0.34,1.56,0.64,1)',
            pointerEvents: 'auto'
          }}
        >
          {/* ── Hero ── */}
          <div style={{ position: 'relative', padding: '28px 24px 20px', overflow: 'hidden' }}>
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(135deg, rgba(232,107,175,0.08) 0%, rgba(155,125,255,0.05) 50%, rgba(47,191,177,0.06) 100%)'
            }} />
            <div style={{
              position: 'absolute', inset: 0, opacity: 0.04,
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)',
              backgroundSize: '24px 24px'
            }} />

            {/* Top bar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              position: 'relative', zIndex: 2, marginBottom: 18
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: 'rgba(232,107,175,0.12)',
                  border: '0.5px solid rgba(232,107,175,0.28)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  animation: 'bfHeart 2.4s ease-in-out infinite'
                }}>
                  <svg width="18" height="18" viewBox="0 0 16 16" fill={c.pk} stroke="none">
                    <path d="M8 14s-5.5-3.5-5.5-7A3 3 0 018 5a3 3 0 015.5 2c0 3.5-5.5 7-5.5 7z" />
                  </svg>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: c.tx }}>Remix v2 Beta</div>
                  <div style={{
                    fontSize: 11, color: c.pk,
                    fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5
                  }}>
                    Wrapping up
                  </div>
                </div>
              </div>
              <CloseButton onClick={onClose} />
            </div>

            {/* Headline */}
            <div style={{
              position: 'relative', zIndex: 2,
              fontSize: 18, fontWeight: 600, color: c.tx,
              marginBottom: 8, lineHeight: 1.3
            }}>
              {headline}
            </div>

            {/* Expiry chip */}
            {expiryLabel && (
              <div style={{
                position: 'relative', zIndex: 2,
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 11, color: c.tm,
                background: 'rgba(255,255,255,0.03)',
                border: '0.5px solid rgba(255,255,255,0.06)',
                borderRadius: 6, padding: '4px 8px',
                fontFamily: "'JetBrains Mono', monospace"
              }}>
                <i className="far fa-calendar-alt" style={{ fontSize: 11, color: c.td }} />
                Ends {expiryLabel}
              </div>
            )}
          </div>

          {/* ── Thank-you body ── */}
          <div style={{ padding: '4px 24px 16px' }}>
            <div style={{ fontSize: 13, color: c.tm, lineHeight: 1.55 }}>
              Thank you for being a vital part of the <strong style={{ color: c.tx, fontWeight: 600 }}>Remix v2 Beta Program</strong>. Your insights and participation have been essential in refining the next generation of smart contract development tools.
            </div>
          </div>

          {/* ── Survey reward card ── */}
          <div style={{ padding: '0 24px 16px' }}>
            <SectionLabel>Your reward awaits</SectionLabel>
            <div style={{
              borderRadius: 12, padding: 16,
              background: 'linear-gradient(135deg, rgba(155,125,255,0.07) 0%, rgba(47,191,177,0.05) 100%)',
              border: '0.5px solid rgba(155,125,255,0.20)'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: 'rgba(240,160,48,0.14)',
                  border: '0.5px solid rgba(240,160,48,0.30)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={c.am} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 2l2.4 5 5.6.8-4 3.9.9 5.5L10 14.8 5.1 17.2 6 11.7 2 7.8l5.6-.8L10 2z" />
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: c.tx, marginBottom: 4 }}>
                    50% off your first 3 months of Remix&nbsp;Pro
                  </div>
                  <div style={{ fontSize: 12, color: c.tm, lineHeight: 1.45 }}>
                    Your detailed feedback is incredibly important as we make the substantial refinements before full release. Completing the survey is required to unlock your reward.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Free-plan transition note ── */}
          <div style={{ padding: '0 24px 18px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 8,
              background: 'rgba(47,191,177,0.06)',
              border: '0.5px solid rgba(47,191,177,0.18)'
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={c.cy} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="8" r="6.5" />
                <path d="M8 4.5v3.5l2 1.5" />
              </svg>
              <div style={{ fontSize: 11.5, color: c.tm, lineHeight: 1.4 }}>
                When your beta access ends you&apos;ll continue on the <strong style={{ color: c.tx, fontWeight: 600 }}>Free plan</strong> automatically. No interruption, no surprises.
              </div>
            </div>
          </div>

          {/* ── Actions ── */}
          <div style={{ padding: '0 24px 14px' }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <PrimaryButton onClick={() => { window.open(surveyUrl, '_blank', 'noopener,noreferrer'); onTakeSurvey() }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8l4 4 6-8" />
                </svg>
                Take the survey &amp; claim 50% off
              </PrimaryButton>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <GhostButton onClick={() => onDismiss('remind')}>
                <i className="far fa-clock" /> Remind me later
              </GhostButton>
              <GhostButton onClick={() => onDismiss('never')}>
                <i className="far fa-eye-slash" /> Don&apos;t show again
              </GhostButton>
            </div>
          </div>

          {/* ── Footer ── */}
          <div style={{
            padding: '14px 24px',
            borderTop: '0.5px solid rgba(255,255,255,0.04)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <div style={{ fontSize: 12, color: c.td, display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill={c.pk} stroke="none">
                <path d="M8 14s-5.5-3.5-5.5-7A3 3 0 018 5a3 3 0 015.5 2c0 3.5-5.5 7-5.5 7z" />
              </svg>
              With gratitude — the Remix team
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default BetaFarewellModal
export type { BetaFarewellModalProps }
