import React, { useContext, useEffect, useState } from 'react'
import type { NudgeRule } from '@remix-project/remix-lib'
import { AppContext } from '../../context/context'

export const NudgeBanner = () => {
  const [nudge, setNudge] = useState<NudgeRule | null>(null)
  const [isReady, setIsReady] = useState(false)
  const { appManager } = useContext(AppContext) || ({} as any)

  // Poll for nudgePlugin activation before subscribing
  useEffect(() => {
    if (!appManager) return
    const checkInterval = setInterval(async () => {
      try {
        const isActive = await appManager.call('manager', 'isActive', 'nudgePlugin')
        if (isActive) {
          setIsReady(true)
          clearInterval(checkInterval)
        }
      } catch {
        // Plugin manager not ready yet, keep polling
      }
    }, 500)
    return () => clearInterval(checkInterval)
  }, [appManager])

  useEffect(() => {
    if (!isReady || !appManager) return
    const handler = (rule: NudgeRule | null) => setNudge(rule)
    appManager.on('nudgePlugin', 'nudgeBannerChanged', handler)
    // Sync current state — the event may have fired before we subscribed
    appManager.call('nudgePlugin', 'getBanner')
      .then((rule: NudgeRule | null) => { if (rule) setNudge(rule) })
      .catch(() => {})
    return () => { appManager.off('nudgePlugin', 'nudgeBannerChanged', handler) }
  }, [isReady, appManager])

  if (!nudge) return null

  const onDismiss = () => {
    appManager?.call('nudgePlugin', 'dismissBanner').catch(() => {})
    setNudge(null)
  }

  const onAction = () => {
    if (!nudge.action.actionTarget) return
    const [pluginName, method, ...args] = nudge.action.actionTarget.split('::')
    appManager?.call(pluginName, method, ...args).catch(() => {})
  }

  return (
    <div
      className="d-flex align-items-center justify-content-center px-3 py-1"
      style={{ backgroundColor: '#2fbfb1', color: '#000', fontSize: '0.85rem', flexShrink: 0 }}
      data-id={`nudgeBanner-${nudge.id}`}
    >
      {nudge.action.icon && !nudge.action.icon.trim().startsWith('<svg') && (
        <i className={`${nudge.action.icon} me-2`}></i>
      )}
      <span>{nudge.action.message}</span>
      {nudge.action.actionLabel && nudge.action.actionTarget && (
        <button
          className="btn btn-sm p-0 ms-2 border-0 fw-bold text-decoration-underline"
          style={{ color: 'inherit', lineHeight: 1 }}
          onClick={onAction}
          data-id={`nudgeBannerAction-${nudge.id}`}
        >
          {nudge.action.actionLabel}
        </button>
      )}
      {nudge.action.dismissable !== false && (
        <button
          className="btn btn-sm p-0 ms-3 border-0"
          style={{ color: 'inherit', lineHeight: 1 }}
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <i className="fas fa-times"></i>
        </button>
      )}
    </div>
  )
}

export default NudgeBanner
