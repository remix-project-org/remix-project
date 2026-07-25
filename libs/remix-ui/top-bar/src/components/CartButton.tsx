/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { useContext, useEffect, useState } from 'react'
import { CustomTooltip } from '@remix-ui/helper'
import { PendingCheckout } from '@remix-api'
import { TopbarContext } from '../context/topbarContext'

interface CartButtonProps {
  className?: string
}

/**
 * Top-bar cart button — a compact mirror of the plan-manager's in-panel
 * resume banner. It reads the exact same source of truth (the plan-manager's
 * unfinished-checkout list) via the `pendingCheckoutsChanged` event, so the
 * two surfaces are always in sync (including with the user's login status,
 * since the plan-manager clears the list on sign-out). Clicking it opens the
 * plan manager and immediately resumes the most recent unfinished checkout.
 */
export function CartButton({ className = '' }: CartButtonProps) {
  const { plugin } = useContext(TopbarContext)
  const [checkouts, setCheckouts] = useState<PendingCheckout[]>([])

  useEffect(() => {
    if (!plugin) return

    const handleChanged = (items: PendingCheckout[]) => {
      setCheckouts(Array.isArray(items) ? items : [])
    }

    plugin.on('planManager', 'pendingCheckoutsChanged', handleChanged)

    // Initial fetch (best-effort — the event keeps us updated afterwards).
    plugin.call('planManager', 'getPendingCheckouts')
      .then((items: PendingCheckout[]) => setCheckouts(Array.isArray(items) ? items : []))
      .catch(() => {})

    return () => {
      plugin.off('planManager', 'pendingCheckoutsChanged')
    }
  }, [plugin])

  const count = checkouts.length
  if (count === 0) return null

  const onClick = () => {
    plugin.call('planManager', 'open')
  }

  const tooltip = count === 1
    ? 'You have an unfinished checkout — click to resume'
    : `You have ${count} unfinished checkouts — click to resume`

  return (
    <CustomTooltip placement="bottom" tooltipText={tooltip}>
      <span
        className={`d-inline-flex align-items-center position-relative ms-3 ${className}`}
        style={{ cursor: 'pointer' }}
        onClick={onClick}
        data-id="topbar-cartBtn"
      >
        <span
          className="position-relative"
          style={{ fontSize: '1rem', color: 'var(--bs-body-color, #a2a3bd)', padding: '4px 8px' }}
        >
          <i className="fas fa-bag-shopping"></i>
          <span
            className="position-absolute"
            style={{
              top: 0,
              right: '-2px',
              background: 'var(--bs-danger, #e74c3c)',
              color: '#fff',
              fontSize: '0.6rem',
              fontWeight: 700,
              minWidth: '16px',
              height: '16px',
              lineHeight: '16px',
              textAlign: 'center',
              borderRadius: '10px',
              padding: '0 4px',
              pointerEvents: 'none'
            }}
            data-id="topbar-cartBadge"
          >
            {count}
          </span>
        </span>
      </span>
    </CustomTooltip>
  )
}
