import React, { useContext, useEffect, useRef, useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { DeployAppContext } from '../contexts'

/** What Pre-deploy Checks reports about a file (its getSummary / summaryChanged payload). */
interface ChecksSummary {
  file: string
  kind: 'empty' | 'not-checked' | 'running' | 'compile-failed' | 'out-of-date' | 'deployed' | 'gate' | 'clear'
  count: number
  checkedAt?: number
}

const LOOK: Record<ChecksSummary['kind'], { tone: string, icon: string, link: string }> = {
  empty: { tone: 'neutral', icon: 'far fa-circle', link: 'udapp.checks.runChecks' },
  'not-checked': { tone: 'neutral', icon: 'far fa-circle', link: 'udapp.checks.runChecks' },
  running: { tone: 'neutral', icon: 'fas fa-circle-notch fa-spin', link: 'udapp.checks.viewProgress' },
  'compile-failed': { tone: 'danger', icon: 'fas fa-times-circle', link: 'udapp.checks.viewErrors' },
  'out-of-date': { tone: 'warning', icon: 'fas fa-history', link: 'udapp.checks.runChecks' },
  gate: { tone: 'danger', icon: 'fas fa-exclamation-circle', link: 'udapp.checks.viewFindings' },
  clear: { tone: 'success', icon: 'fas fa-check-circle', link: 'udapp.checks.viewChecks' },
  deployed: { tone: 'success', icon: 'fas fa-check-circle', link: 'udapp.checks.viewChecks' }
}

function useNow (intervalMs = 30000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

/** One line above the Deploy button saying what Pre-deploy Checks found for the selected contract's file. */
export function ChecksStatusLine ({ filePath }: { filePath?: string }) {
  const { plugin, themeQuality } = useContext(DeployAppContext)
  const intl = useIntl()
  const now = useNow()
  const [summary, setSummary] = useState<ChecksSummary | null>(null)
  const fileRef = useRef(filePath)
  fileRef.current = filePath

  useEffect(() => {
    plugin.on('preDeployChecks', 'summaryChanged', (file: string, next: ChecksSummary) => {
      if (file === fileRef.current) setSummary(next)
    })
    return () => plugin.off('preDeployChecks', 'summaryChanged')
  }, [])

  useEffect(() => {
    setSummary(null)
    if (!filePath || !filePath.endsWith('.sol')) return
    plugin.call('preDeployChecks', 'getSummary', filePath)
      .then((next: ChecksSummary | null) => { if (fileRef.current === filePath) setSummary(next) })
      .catch(() => { /* Pre-deploy Checks not active */ })
  }, [filePath])

  if (!filePath || !filePath.endsWith('.sol')) return null
  const kind = summary?.kind || 'not-checked'
  const look = LOOK[kind]

  const text = () => {
    switch (kind) {
    case 'running': return intl.formatMessage({ id: 'udapp.checks.running' })
    case 'compile-failed': return intl.formatMessage({ id: 'udapp.checks.compileFailed' })
    case 'out-of-date': return intl.formatMessage({ id: 'udapp.checks.outOfDate' })
    case 'gate': return intl.formatMessage({ id: 'udapp.checks.gate' }, { count: summary.count })
    case 'deployed': return intl.formatMessage({ id: 'udapp.checks.deployed' })
    case 'clear': {
      const minutes = summary.checkedAt ? Math.round(Math.max(0, now - summary.checkedAt) / 60000) : null
      const ago = minutes === null ? '' : minutes < 1
        ? intl.formatMessage({ id: 'udapp.checks.justNow' })
        : intl.formatMessage({ id: 'udapp.checks.minutesAgo' }, { count: minutes })
      return [intl.formatMessage({ id: 'udapp.checks.clear' }), ago].filter(Boolean).join(' · ')
    }
    default: return intl.formatMessage({ id: 'udapp.checks.notChecked' })
    }
  }

  const openChecks = () => {
    plugin.call('preDeployChecks', 'open', filePath).catch(() => plugin.call('menuicons', 'select', 'preDeployChecks'))
  }

  return (
    <button className={`udapp-checks-status udapp-checks-${look.tone} udapp-checks-${themeQuality === 'light' ? 'light' : 'dark'}`} data-id="udappChecksStatus" data-kind={kind} onClick={openChecks}>
      <i className={look.icon} aria-hidden="true"></i>
      <span className="flex-grow-1 text-start text-truncate">{text()}</span>
      <span className="udapp-checks-link"><FormattedMessage id={look.link} /></span>
    </button>
  )
}
