import React, { Dispatch } from 'react'
import { AiAssistantType, AiContextType, groupListType } from '../types/componentTypes'

/**
 * Permission-gated visibility for the "Upgrade plan" / "Buy credits"
 * pills next to a locked item.
 *
 *   - 'hidden'      => pill is not rendered.
 *   - 'coming_soon' => pill is rendered as a compact non-interactive
 *                     "Coming soon" affordance.
 *   - 'available'   => pill is the normal clickable CTA.
 *
 * Computed by the parent from the backend permissions
 * (`ai:upgrade_available`, `ai:buy_credits`, `ai:modes_coming_soon`) so
 * this component stays presentational.
 */
export type LockedPillState = 'hidden' | 'coming_soon' | 'available'

export interface GroupListMenuProps {
  setChoice: Dispatch<React.SetStateAction<AiContextType | AiAssistantType | any>>
  choice: AiContextType | AiAssistantType | any
  setShowOptions: Dispatch<React.SetStateAction<boolean>>
  groupList: groupListType[]
  onLockedItemClick?: (item: groupListType) => void
  /** State of the "Upgrade plan" pill on locked items. Defaults to `'available'`
   *  to preserve the pre-existing always-on behaviour for non-permission-aware callers. */
  upgradePillState?: LockedPillState
  /** State of the "Buy credits" pill on locked items. Defaults to `'hidden'`
   *  since this pill is new and only relevant when the parent opts in. */
  buyCreditsPillState?: LockedPillState
  /** Click handler for the "Buy credits" pill. Falls back to `onLockedItemClick`. */
  onBuyCreditsClick?: (item: groupListType) => void
}

export default function GroupListMenu(props: GroupListMenuProps) {
  const upgradeState: LockedPillState = props.upgradePillState ?? 'available'
  const buyCreditsState: LockedPillState = props.buyCreditsPillState ?? 'hidden'
  const hasVisibleLockedPill = upgradeState !== 'hidden' || buyCreditsState !== 'hidden'
  // The `__signin__` placeholder is its own CTA (clicking it opens the
  // plan-manager sign-in hand-off) so it must remain visible even when no
  // upgrade/buy-credits pills are shown — otherwise anonymous users see an
  // empty model picker. Other locked rows are only meaningful alongside an
  // upgrade or buy-credits pill, so we hide them when both pills are hidden.
  const visibleItems = props.groupList.filter(item => {
    if (!item.isLocked) return true
    if (item.stateValue === '__signin__') return true
    return hasVisibleLockedPill
  })

  const renderPill = (
    item: groupListType,
    kind: 'upgrade' | 'buy_credits',
    state: LockedPillState
  ) => {
    if (state === 'hidden') return null
    const isComing = state === 'coming_soon'
    const isUpgrade = kind === 'upgrade'
    const label = isComing ? 'Coming soon' : isUpgrade ? 'Upgrade plan' : 'Buy AI credits'
    const icon = isComing ? 'fa-clock' : isUpgrade ? 'fa-arrow-up' : 'fa-bolt'
    const dataId = isUpgrade
      ? `${item.dataId}-upgrade-pill`
      : `${item.dataId}-buy-credits-pill`
    const handleClick = (e: React.MouseEvent) => {
      // Stop propagation so the pill click doesn't also trigger the outer
      // row handler (which routes to onLockedItemClick).
      e.stopPropagation()
      if (isComing) return
      props.setShowOptions(false)
      if (kind === 'buy_credits' && props.onBuyCreditsClick) {
        props.onBuyCreditsClick(item)
      } else {
        props.onLockedItemClick?.(item)
      }
    }
    return (
      <span
        key={kind}
        data-id={dataId}
        data-pill-kind={kind}
        data-pill-state={state}
        className={`badge ms-2 text-white ${isComing ? 'bg-secondary' : 'bg-primary'}`}
        style={{
          fontSize: '0.65rem',
          padding: '2px 6px',
          cursor: isComing ? 'default' : 'pointer',
          opacity: isComing ? 0.85 : 1
        }}
        aria-disabled={isComing || undefined}
        onClick={isComing ? undefined : handleClick}
      >
        <i className={`fas ${icon} me-1`} style={{ fontSize: '0.6rem' }}></i>
        {label}
      </span>
    )
  }

  return (
    <div className="btn-group-vertical w-100">
      {visibleItems.map((item, index) => {
        const upgradePill = item.isLocked ? renderPill(item, 'upgrade', upgradeState) : null
        const buyCreditsPill = item.isLocked ? renderPill(item, 'buy_credits', buyCreditsState) : null
        return (
          <button
            key={`${item.label}-${index}`}
            className={`btn btn-light border-0 ${item.isLocked ? 'opacity-75' : ''} ${item.disabled ? 'opacity-50' : ''}`}
            data-id={item.dataId}
            data-locked={item.isLocked ? 'true' : 'false'}
            data-disabled={item.disabled ? 'true' : 'false'}
            title={item.disabled ? (item.disabledReason || 'This model is not supported') : undefined}
            onClick={() => {
              props.setShowOptions(false)
              if (item.isLocked) {
                props.onLockedItemClick?.(item)
              } else {
                // Disabled rows (e.g. unsupported models) still route through
                // setChoice so the caller can surface a message and fall back.
                props.setChoice(item.stateValue)
              }
            }}
          >
            <div className="d-flex flex-column small text-start">
              <div className="d-flex align-items-center justify-content-between mb-1">
                <div className="d-flex align-items-center">
                  <span className="form-check-label fw-bold">{item.label}</span>
                  {item.disabled && (
                    <span className="badge bg-secondary ms-2" style={{ fontSize: '0.6rem' }}>
                      {item.disabledReason || 'Unsupported'}
                    </span>
                  )}
                  {upgradePill}
                  {buyCreditsPill}
                </div>
                {!item.bodyText && props.choice === item.stateValue && !item.isLocked && <span className={item.icon}></span>}
              </div>
              {item.bodyText && (
                <div className="d-flex justify-content-between">
                  <span className="form-check-label me-2 text-wrap">{item.bodyText}</span>
                  {props.choice === item.stateValue && !item.isLocked && <span className={item.icon}></span>}
                </div>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
