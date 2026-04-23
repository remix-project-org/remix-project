import React, { useCallback } from 'react'
import { useAuth } from '@remix-ui/app'
import { CustomTooltip } from '@remix-ui/helper'

const TOKEN_STORAGE_KEY = 'remix_anonymous_request_tokens'

interface BetaPromoPillProps {
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

export function BetaPromoPill({ plugin }: BetaPromoPillProps) {
  const { isAuthenticated, featureGroups } = useAuth()

  const handleClick = useCallback(() => {
    plugin.call('membershipRequest', 'showRequestForm', 'beta')
    plugin.call('matomo', 'trackEvent', 'topbar', 'betaPromo', 'joinClicked', undefined).catch(() => {})
  }, [plugin])

  const hasBeta = featureGroups?.some(fg => fg.name === 'beta')
  if (isAuthenticated || hasBeta || hasExistingBetaToken()) return null

  return (
    <CustomTooltip placement="bottom" tooltipText="Get early access to new features">
      <span
        className="beta-promo-pill d-flex align-items-center ms-3"
        onClick={handleClick}
        data-id="beta-promo-pill"
      >
        <i className="fas fa-flask me-1"></i>
        <span>Join Remix Beta</span>
      </span>
    </CustomTooltip>
  )
}
