import React, { useEffect, useState } from 'react'
import '../components/styles/preload.css'
import { confirmMigration, ConfirmOutcome } from '../utils/migrationConfirm'

/**
 * Landing page for the "I'm done" link sent from the new domain.
 *
 * Rendered instead of the IDE: the user is only passing through to tell this
 * origin it can stop serving them, so booting the whole app would be waste.
 */

const c = {
  bg: '#1a1a2e',
  s2: '#2a2a4a',
  cy: '#2fbfb1',
  tx: '#e0e0ec',
  tm: '#8888aa',
  td: '#5c5c7a',
  am: '#f0a030',
  gn: '#6bdb8a'
}

const mono = "'JetBrains Mono', monospace"
const sans = "'DM Sans', sans-serif"

const KEYFRAMES = `
  @keyframes mcIn { from { opacity: 0; transform: scale(0.96) translateY(12px); } to { opacity: 1; transform: scale(1) translateY(0); } }
  @keyframes mcSpin { to { transform: rotate(360deg); } }
`

export interface MigrationConfirmedProps {
  onTrack?: (action: string, name?: string) => void
}

export const MigrationConfirmed: React.FC<MigrationConfirmedProps> = ({ onTrack }) => {
  const [outcome, setOutcome] = useState<ConfirmOutcome | null>(null)
  const [retrying, setRetrying] = useState(false)

  const run = async () => {
    setRetrying(true)
    const result = await confirmMigration()
    setOutcome(result)
    setRetrying(false)
    onTrack?.(
      result.status === 'confirmed' ? 'MigrationConfirmed' : 'MigrationConfirmFailed',
      result.status === 'confirmed' ? result.toDomain : undefined
    )
  }

  useEffect(() => {
    // This page renders instead of Preload, which is what normally clears the
    // splash; left alone it would cover us at z-index 9999.
    try {
      const splash = document.getElementById('pre-splash')
      splash?.parentNode?.removeChild(splash)
    } catch { /* noop */ }
    run()
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: c.bg, color: c.tx, fontFamily: sans,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, overflowY: 'auto'
    }}>
      <style>{KEYFRAMES}</style>
      <div
        data-id="migrationConfirmed"
        style={{
          position: 'relative', overflow: 'hidden',
          width: '100%', maxWidth: 520, borderRadius: 20,
          border: `0.5px solid ${outcome?.status === 'confirmed' ? 'rgba(107,219,138,0.22)' : 'rgba(47,191,177,0.18)'}`,
          animation: 'mcIn 0.4s cubic-bezier(0.34,1.56,0.64,1)'
        }}
      >
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg, rgba(47,191,177,0.10) 0%, rgba(155,125,255,0.06) 50%, rgba(240,160,48,0.07) 100%)'
        }} />
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.04,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }} />

        <div style={{ position: 'relative', zIndex: 2, padding: '30px 26px' }}>
          {!outcome && <Working />}
          {outcome?.status === 'confirmed' && <Confirmed toDomain={outcome.toDomain} />}
          {outcome?.status === 'unavailable' && <Unavailable retrying={retrying} onRetry={run} />}
        </div>
      </div>
    </div>
  )
}

/* ─── States ─── */

const Working: React.FC = () => (
  <div style={{ textAlign: 'center', padding: '20px 0' }}>
    <div style={{
      width: 30, height: 30, margin: '0 auto 14px', borderRadius: '50%',
      border: `2px solid ${c.s2}`, borderTopColor: c.cy, animation: 'mcSpin 0.8s linear infinite'
    }} />
    <div style={{ fontSize: 13, color: c.tm }}>Wrapping up…</div>
  </div>
)

const Confirmed: React.FC<{ toDomain: string }> = ({ toDomain }) => (
  <>
    <Header
      icon={
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={c.gn} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 10.5l4 4 8-9" />
        </svg>
      }
      accent={c.gn}
      title="You're all set"
      kicker="Migration complete"
    />
    <p style={{ fontSize: 13, color: c.tm, lineHeight: 1.6, margin: '0 0 18px' }}>
      Remix will now take you to <Domain>{toDomain}</Domain> whenever you open this address. Your old Workspaces are still
      here, untouched, in case you ever need them.
    </p>

    <a href={`https://${toDomain}/?migrationdone`} data-id="migrationConfirmedGo" style={primaryStyle}>
      Go to {toDomain}
    </a>

    <Footnote>
      Need to come back? Open the old Remix url with this parameter:{' '}
      <code style={{ fontFamily: mono, color: c.tm }}>remix.ethereum.org?nomigrationredirect</code> and it stays put for that visit.
    </Footnote>
  </>
)

const Unavailable: React.FC<{ retrying: boolean; onRetry: () => void }> = ({ retrying, onRetry }) => (
  <>
    <Header
      icon={<i className="fas fa-plug-circle-exclamation" style={{ color: c.am, fontSize: 16 }} />}
      accent={c.am}
      title="Couldn't finish just yet"
      kicker="Try again"
    />
    <p style={{ fontSize: 13, color: c.tm, lineHeight: 1.6, margin: '0 0 18px' }}>
      We couldn&apos;t reach Remix to complete this, so nothing has been saved. Your Workspaces on the new site are fine —
      this step only stops this old address from loading in future. It&apos;s usually a temporary connection problem.
    </p>
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <button
        onClick={onRetry}
        disabled={retrying}
        data-id="migrationConfirmedRetry"
        style={{ ...primaryStyle, opacity: retrying ? 0.6 : 1, cursor: retrying ? 'not-allowed' : 'pointer' }}
      >
        {retrying ? 'Trying…' : 'Try again'}
      </button>
      <a
        href="/"
        style={{
          ...buttonBase,
          padding: '10px 16px', fontSize: 12, fontWeight: 500,
          background: 'transparent', border: '0.5px solid rgba(255,255,255,0.08)', color: c.tm
        }}
      >
        Continue to Remix
      </a>
    </div>
  </>
)

/* ─── Pieces ─── */

const Header: React.FC<{ icon: React.ReactNode; accent: string; title: string; kicker: string }> = ({
  icon,
  accent,
  title,
  kicker
}) => (
  <>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: `${accent}1f`, border: `0.5px solid ${accent}47`,
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Remix</div>
        <div style={{ fontSize: 11, color: accent, fontFamily: mono, letterSpacing: 0.5 }}>{kicker}</div>
      </div>
    </div>
    <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.3, marginBottom: 10 }}>{title}</div>
  </>
)

const Domain: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <strong style={{ color: c.cy, fontFamily: mono, fontWeight: 600 }}>{children}</strong>
)

const buttonBase: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '11px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
  fontFamily: sans, textDecoration: 'none', cursor: 'pointer', border: 'none'
}

const primaryStyle: React.CSSProperties = {
  ...buttonBase,
  background: 'linear-gradient(135deg, rgba(47,191,177,0.22) 0%, rgba(155,125,255,0.22) 100%)',
  border: '0.5px solid rgba(47,191,177,0.45)',
  color: c.tx
}

const Footnote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    marginTop: 18, paddingTop: 14, borderTop: '0.5px solid rgba(255,255,255,0.05)',
    fontSize: 11.5, color: c.td, lineHeight: 1.5
  }}>
    {children}
  </div>
)
