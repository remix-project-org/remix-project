import React, { useState, useContext } from 'react'
import { useAuth } from '@remix-ui/app'
import { ThemeContext } from '../themeContext'

const DISMISSED_KEY = 'remix_beta_promo_dismissed'
const TOKEN_STORAGE_KEY = 'remix_anonymous_request_tokens'

interface HomeTabBetaPromoProps {
  plugin: any
}

function hasExistingBetaToken(): boolean {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY)
    if (!raw) return false
    const tokens = JSON.parse(raw) as { group_name: string }[]
    return tokens.some(t => t.group_name === 'beta')
  } catch {
    return false
  }
}

export default function HomeTabBetaPromo({ plugin }: HomeTabBetaPromoProps) {
  const { isAuthenticated, featureGroups } = useAuth()
  const theme = useContext(ThemeContext)
  const isDark = theme.name === 'dark'
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISSED_KEY) === 'true'
  )

  // Don't show if:
  // - already dismissed
  // - user is logged in (they're either in beta or can join from their profile)
  // - user already has a pending request token for beta
  const hasBeta = featureGroups?.some(fg => fg.name === 'beta')
  if (dismissed || isAuthenticated || hasBeta || hasExistingBetaToken()) return null

  const handleJoin = () => {
    plugin.call('membershipRequest', 'showRequestForm', 'beta')
    plugin.call('matomo', 'trackEvent', 'hometab', 'betaPromo', 'joinClicked', undefined).catch(() => {})
  }

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation()
    localStorage.setItem(DISMISSED_KEY, 'true')
    setDismissed(true)
    plugin.call('matomo', 'trackEvent', 'hometab', 'betaPromo', 'dismissed', undefined).catch(() => {})
  }

  return (
    <div
      className="card mb-3 rounded overflow-hidden border position-relative"
      style={{ cursor: 'pointer' }}
      onClick={handleJoin}
      data-id="beta-promo-banner"
    >
      <img
        src="assets/img/remix-link-illustration.svg"
        alt=""
        style={{
          position: 'absolute',
          top: '-120px',
          right: '-40px',
          width: 260,
          height: 260,
          zIndex: 0,
          opacity: 0.15,
          pointerEvents: 'none'
        }}
      />
      <div className="p-3 d-flex align-items-center" style={{ zIndex: 1 }}>
        <div className="me-3 d-flex align-items-center justify-content-center" style={{ minWidth: 36 }}>
          <i className="fas fa-flask fa-lg text-primary"></i>
        </div>
        <div className="flex-grow-1">
          <div className={`fw-bold mb-0 ${isDark ? 'text-white' : 'text-dark'}`} style={{ fontSize: '0.85rem' }}>
            Try Remix Beta
          </div>
          <div style={{ fontSize: '0.75rem', opacity: 0.75 }}>
            Get early access to new features before they go live.
          </div>
        </div>
        <div className="d-flex align-items-center ms-2">
          <span className="text-primary me-2" style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
            Register now <i className="fas fa-chevron-right" style={{ fontSize: '0.6rem' }}></i>
          </span>
          <button
            className="btn btn-sm p-0 border-0"
            onClick={handleDismiss}
            title="Dismiss"
            style={{ opacity: 0.5, lineHeight: 1 }}
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
      </div>
    </div>
  )
}
