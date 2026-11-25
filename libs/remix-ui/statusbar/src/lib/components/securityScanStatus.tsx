// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { StatusBar } from 'apps/remix-ide/src/app/components/status-bar'
import React, { useEffect, useRef, useState } from 'react'
import { useIntl } from 'react-intl'
import type { SecurityScanEvent } from '@remix-api'

/** How long a clean result stays in the status bar. */
const CLEAR_VISIBLE_MS = 6000

interface Scan {
  /** paste: code pasted in the editor. deploy: a contract just deployed. */
  kind: 'paste' | 'deploy'
  key: string
  file: string
  label: string
  phase: 'scanning' | 'clear' | 'issues'
  count: number
}

/** preDeployChecks' lightCheckChanged and pasteScanChanged payloads, as far as this needs them. */
interface ScanEvent {
  file: string
  status?: string
  phase?: string
  contractName?: string
  address?: string
  reasons?: string[]
}

function toKey (kind: Scan['kind'], event: ScanEvent) {
  return kind === 'paste' ? `paste:${event.file}` : `deploy:${event.address}`
}

function toScan (kind: Scan['kind'], event: ScanEvent): Scan | null {
  const raw = kind === 'paste' ? event.phase : event.status === 'running' ? 'scanning' : event.status
  if (raw !== 'scanning' && raw !== 'clear' && raw !== 'issues') return null
  return {
    kind,
    key: toKey(kind, event),
    file: event.file,
    label: kind === 'paste' ? event.file.split('/').pop() : event.contractName || event.file.split('/').pop(),
    phase: raw,
    count: (event.reasons || []).filter(Boolean).length
  }
}

/** Shows the background AI security scans (after a paste or a deploy) while they run, and their verdict. */
export default function SecurityScanStatus ({ plugin }: { plugin: StatusBar }) {
  const intl = useIntl()
  const [scan, setScan] = useState<Scan | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const show = (kind: Scan['kind']) => (event: ScanEvent) => {
      if (!event?.file) return
      const next = toScan(kind, event)
      setScan((current) => {
        // a result this indicator doesn't show (sign in, no credits...) only clears its own scan
        if (!next) return current && current.key === toKey(kind, event) ? null : current
        // an issue stays until it's looked at: a clean result elsewhere doesn't hide it
        if (current && current.phase === 'issues' && current.key !== next.key && next.phase === 'clear') return current
        return next
      })
    }
    plugin.on('preDeployChecks' as any, 'pasteScanChanged', show('paste'))
    plugin.on('preDeployChecks' as any, 'lightCheckChanged', show('deploy'))
    return () => {
      plugin.off('preDeployChecks' as any, 'pasteScanChanged')
      plugin.off('preDeployChecks' as any, 'lightCheckChanged')
    }
  }, [])

  useEffect(() => {
    clearTimeout(hideTimer.current)
    if (scan?.phase === 'clear') hideTimer.current = setTimeout(() => setScan(null), CLEAR_VISIBLE_MS)
    return () => clearTimeout(hideTimer.current)
  }, [scan])

  if (!scan) return null

  const open = () => {
    if (scan.phase === 'scanning') return
    const event: SecurityScanEvent = { category: 'securityScan', action: 'cta', name: `statusbar-${scan.kind}-${scan.phase}`, isClick: true }
    plugin.call('matomo' as any, 'trackEvent', event).catch(() => { /* matomo not active */ })
    if (scan.kind === 'paste') plugin.call('preDeployChecks' as any, 'open', scan.file, 'statusbar').catch(() => { /* panel not active */ })
    else plugin.call('menuicons' as any, 'select', 'udapp').catch(() => { /* panel not active */ })
    setScan(null)
  }

  const text = scan.phase === 'scanning'
    ? intl.formatMessage({ id: 'statusbar.securityScan.scanning' }, { name: scan.label })
    : scan.phase === 'clear'
      ? intl.formatMessage({ id: 'statusbar.securityScan.clear' }, { name: scan.label })
      : intl.formatMessage({ id: 'statusbar.securityScan.issues' }, { name: scan.label, count: scan.count })

  return (
    <span
      className={`remixui_statusbar_securityscan small d-flex align-items-center ms-3 ${scan.phase}`}
      data-id="statusBarSecurityScan"
      data-phase={scan.phase}
      data-kind={scan.kind}
      role={scan.phase === 'scanning' ? 'status' : 'button'}
      title={scan.phase === 'scanning' ? undefined : intl.formatMessage({ id: 'statusbar.securityScan.open' })}
      onClick={open}
    >
      {scan.phase === 'scanning'
        ? <span className="spinner-border spinner-border-sm me-2" role="presentation"></span>
        : <i className={`fas ${scan.phase === 'clear' ? 'fa-check-circle text-success' : 'fa-exclamation-triangle text-danger'} me-2`}></i>}
      <span className="text-truncate">{text}</span>
    </span>
  )
}
