import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FormattedMessage, useIntl } from 'react-intl'
import { LoginModal, startSignInFlow } from '@remix-ui/login'
import './paste-guard.css'

/** A large paste into the editor, as the paste guard needs it. */
export interface PasteGuardRequest {
  /** changes on every paste: a new paste restarts the guard */
  nonce: number
  file: string
  /** the whole file after the paste: the scan needs the context, not just the snippet */
  content: string
  lines: number
}

/** preDeployChecks.getPasteGuardContext */
interface GuardContext {
  available: boolean
  autoScan: boolean
  signedIn: boolean
  hasAuditor: boolean
  canScan: boolean
  freeScansLeft: boolean
  resetAt?: string
}

/** preDeployChecks' pasteScanChanged payload */
interface PasteScan {
  id: number
  file: string
  lines: number
  phase: 'scanning' | 'clear' | 'issues' | 'exhausted' | 'signin' | 'unavailable' | 'error'
  reasons: string[]
}

type View = 'loading' | 'warn' | 'signin' | 'offer' | 'exhausted' | 'scanning' | 'clear' | 'issues' | 'error' | 'unavailable'

interface PasteGuardProps {
  plugin: any
  request: PasteGuardRequest | null
  /** asks RemixAI chat about the pasted code (non-Solidity files, or scans switched off server-side) */
  onAskAI: () => void
}

/** the scanning steps move on while the scan runs, so the wait shows what's being looked at */
const STEP_TIMES = [700, 3500]
const MAX_REASONS = 3

/**
 * Shown after a large paste. Signed out, it offers a free scan with a sign-in. Signed in, it scans
 * Solidity right away (or offers it when automatic scans are off) and shows the scan as it runs,
 * then the verdict with what to do next. "Run in background" hides it; it comes back if the scan
 * finds issues. Other files get a short warning.
 */
export function PasteGuard ({ plugin, request, onAskAI }: PasteGuardProps) {
  const intl = useIntl()
  const [open, setOpen] = useState(false)
  const [inBackground, setInBackground] = useState(false)
  const [view, setView] = useState<View>('loading')
  const [ctx, setCtx] = useState<GuardContext | null>(null)
  const [reasons, setReasons] = useState<string[]>([])
  const [step, setStep] = useState(0)
  const [showLogin, setShowLogin] = useState(false)
  const requestRef = useRef<PasteGuardRequest | null>(null)
  const activeRef = useRef(false)
  const backgroundRef = useRef(false)

  const track = (name: string) => {
    plugin.call('matomo', 'trackEvent', 'udapp', 'lightSecurityCheckCta', `paste-${name}`, undefined).catch(() => { /* matomo not active */ })
  }

  const finish = () => {
    activeRef.current = false
    backgroundRef.current = false
    setOpen(false)
    setInBackground(false)
    setShowLogin(false)
  }

  const applyScan = (scan: PasteScan) => {
    if (!activeRef.current || !requestRef.current || scan?.file !== requestRef.current.file) return
    if (scan.phase === 'signin') return setView('signin')
    if (scan.phase === 'scanning') {
      setStep(0)
      setView('scanning')
      // started by a sign-in: the plan (Pro pitch or not) is known now
      plugin.call('preDeployChecks', 'getPasteGuardContext').then((context: GuardContext) => {
        if (requestRef.current?.file === scan.file) setCtx(context)
      }).catch(() => { /* keep what's known */ })
      return
    }
    setReasons(scan.reasons || [])
    setView(scan.phase)
    if (!backgroundRef.current) return
    // in the background: only issues bring the guard back, the status bar shows the rest
    if (scan.phase === 'issues') {
      backgroundRef.current = false
      setInBackground(false)
      setOpen(true)
      track('reopenIssues')
    } else {
      finish()
    }
  }

  useEffect(() => {
    plugin.on('preDeployChecks', 'pasteScanChanged', applyScan)
    return () => plugin.off('preDeployChecks', 'pasteScanChanged')
  }, [])

  const startScan = () => {
    const req = requestRef.current
    if (!req) return
    setStep(0)
    setView('scanning')
    plugin.call('preDeployChecks', 'startPasteScan', req.file, req.content).catch((e: any) => {
      console.warn('Paste guard: scan failed', e)
      if (requestRef.current === req) setView('error')
    })
  }

  useEffect(() => {
    if (!request) return
    requestRef.current = request
    activeRef.current = true
    backgroundRef.current = false
    setInBackground(false)
    setShowLogin(false)
    setReasons([])
    setView('loading')
    setOpen(true)
    if (!request.file.endsWith('.sol')) {
      setView('warn')
      return
    }
    plugin.call('preDeployChecks', 'getPasteGuardContext').then((context: GuardContext) => {
      if (requestRef.current !== request) return
      setCtx(context)
      if (!context.available) setView('warn')
      else if (!context.signedIn) setView('signin')
      else if (!context.canScan) setView('exhausted')
      else if (!context.autoScan) setView('offer')
      else startScan()
    }).catch(() => {
      if (requestRef.current === request) setView('warn')
    })
  }, [request?.nonce])

  // the steps advance on their own while the scan runs
  useEffect(() => {
    if (view !== 'scanning') return
    const timers = STEP_TIMES.map((ms, i) => setTimeout(() => setStep((s) => Math.max(s, i + 1)), ms))
    return () => timers.forEach(clearTimeout)
  }, [view])

  // a sign-in from elsewhere (or the login modal) moves a signed-out guard on: the plugin starts the pending scan
  useEffect(() => {
    if (view !== 'signin' || !showLogin) return
    const timer = setInterval(async () => {
      if (await plugin.call('auth', 'isAuthenticated').catch(() => false)) {
        clearInterval(timer)
        setShowLogin(false)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [view, showLogin])

  // focus stays in the guard, so Escape closes it (and not a dialog on top of it) and typing
  // doesn't edit the code behind it; the editor takes focus back after opening a file
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open || inBackground || showLogin) return
    dialogRef.current?.focus()
    const onFocusIn = (e: FocusEvent) => {
      if ((e.target as HTMLElement)?.closest?.('.monaco-editor')) dialogRef.current?.focus()
    }
    document.addEventListener('focusin', onFocusIn)
    return () => document.removeEventListener('focusin', onFocusIn)
  }, [open, inBackground, showLogin, request?.nonce])

  if (!request || (!open && !showLogin)) return null

  const file = request.file.split('/').pop()
  const hasAuditor = !!ctx?.hasAuditor

  function close (how: string) {
    track(`${view}-${how}`)
    if (view === 'scanning') {
      backgroundRef.current = true
      setInBackground(true)
      setOpen(false)
      return
    }
    if (view === 'signin') plugin.call('preDeployChecks', 'cancelPendingPasteScan').catch(() => { /* not active */ })
    finish()
  }

  const then = (name: string, run: () => any) => () => {
    track(name)
    finish()
    Promise.resolve(run()).catch((e: any) => console.warn(`Paste guard: ${name} failed`, e))
  }

  const signIn = () => {
    track('signin')
    // the plugin starts this scan as soon as the user is signed in
    plugin.call('preDeployChecks', 'startPasteScan', request.file, request.content).catch(() => { /* not active */ })
    startSignInFlow(plugin, () => setShowLogin(true), 'Paste Guard Sign In')
  }

  const fullAuditButton = () => (
    <button className="btn btn-sm btn-secondary" data-id="pasteGuardFullAudit" onClick={then('fullAudit', () => plugin.call('preDeployChecks', 'fullAudit', request.file))}>
      {hasAuditor
        ? <FormattedMessage id="editor.pasteGuard.runFullAudit" />
        : <><FormattedMessage id="editor.pasteGuard.getFullAudit" /> <span className="badge bg-primary-subtle text-primary ms-1">Pro</span></>}
    </button>
  )

  const resetIn = () => {
    const ms = ctx?.resetAt ? new Date(ctx.resetAt).getTime() - Date.now() : NaN
    if (!(ms > 0)) return null
    const hours = Math.floor(ms / 3600000)
    return hours >= 1
      ? intl.formatMessage({ id: 'editor.pasteGuard.resetsInHours' }, { hours })
      : intl.formatMessage({ id: 'editor.pasteGuard.resetsInMinutes' }, { minutes: Math.max(1, Math.ceil(ms / 60000)) })
  }

  const icon = {
    loading: 'fa-shield-alt text-info',
    warn: 'fa-exclamation-triangle text-warning',
    signin: 'fa-shield-alt text-info',
    offer: 'fa-shield-alt text-info',
    exhausted: 'fa-shield-alt text-warning',
    scanning: 'fa-shield-alt text-info remix-paste-guard-pulse',
    clear: 'fa-check-circle text-success',
    issues: 'fa-exclamation-triangle text-danger',
    error: 'fa-exclamation-circle text-warning',
    unavailable: 'fa-exclamation-circle text-warning'
  }[view]

  const title = (() => {
    switch (view) {
    case 'scanning': return intl.formatMessage({ id: 'editor.pasteGuard.scanningTitle' })
    case 'clear': return intl.formatMessage({ id: 'editor.pasteGuard.clearTitle' })
    case 'issues': return reasons.length
      ? intl.formatMessage({ id: 'editor.pasteGuard.issuesTitle' }, { count: reasons.length })
      : intl.formatMessage({ id: 'editor.pasteGuard.issuesTitleNoCount' })
    case 'exhausted': return intl.formatMessage({ id: 'editor.pasteGuard.exhaustedTitle' })
    case 'error': return intl.formatMessage({ id: 'editor.pasteGuard.errorTitle' })
    case 'unavailable': return intl.formatMessage({ id: 'editor.pasteGuard.unavailableTitle' })
    default: return intl.formatMessage({ id: 'editor.pasteGuard.checkTitle' })
    }
  })()

  const body = (() => {
    switch (view) {
    case 'loading':
      return <div className="d-flex justify-content-center py-3"><span className="spinner-border spinner-border-sm text-info" role="status"></span></div>
    case 'warn':
      return <p className="mb-0"><FormattedMessage id="editor.pasteGuard.warn" /></p>
    case 'signin':
      return <>
        <p><FormattedMessage id="editor.pasteGuard.risk" /></p>
        <p className="mb-0 remix-paste-guard-highlight"><i className="fas fa-gift me-2 text-primary"></i><FormattedMessage id="editor.pasteGuard.signinFree" /></p>
      </>
    case 'offer':
      return <>
        <p><FormattedMessage id="editor.pasteGuard.risk" /></p>
        <p className="mb-0 small text-muted"><FormattedMessage id="editor.pasteGuard.autoOff" /></p>
      </>
    case 'exhausted':
      return <>
        <p><FormattedMessage id="editor.pasteGuard.exhausted" values={{ reset: resetIn() || '' }} /></p>
        <p className="mb-0 small"><FormattedMessage id="editor.pasteGuard.reviewManually" /></p>
      </>
    case 'scanning':
      return <>
        <ul className="list-unstyled mb-3" data-id="pasteGuardSteps">
          {[
            intl.formatMessage({ id: 'editor.pasteGuard.stepRead' }, { lines: request.lines }),
            intl.formatMessage({ id: 'editor.pasteGuard.stepScams' }),
            intl.formatMessage({ id: 'editor.pasteGuard.stepVulns' })
          ].map((label, i) => (
            <li key={i} className={`remix-paste-guard-step ${i < step ? 'done' : i === step ? 'active' : ''}`} data-state={i < step ? 'done' : i === step ? 'active' : 'pending'}>
              {i < step
                ? <i className="fas fa-check text-success"></i>
                : i === step ? <span className="spinner-border spinner-border-sm text-info" role="presentation"></span> : <i className="far fa-circle text-muted"></i>}
              <span>{label}</span>
            </li>
          ))}
        </ul>
        <div className="remix-paste-guard-progress"><div></div></div>
      </>
    case 'clear':
      return <>
        <p className="mb-2"><FormattedMessage id="editor.pasteGuard.clear" values={{ file }} /></p>
        {!hasAuditor && <p className="mb-0 small remix-paste-guard-highlight"><FormattedMessage id="editor.pasteGuard.proPitch" /></p>}
      </>
    case 'issues':
      return <>
        {reasons.length > 0 && <ul className="remix-paste-guard-reasons" data-id="pasteGuardReasons">
          {reasons.slice(0, MAX_REASONS).map((r, i) => <li key={i}>{r}</li>)}
          {reasons.length > MAX_REASONS && <li className="text-muted list-unstyled"><FormattedMessage id="editor.pasteGuard.more" values={{ count: reasons.length - MAX_REASONS }} /></li>}
        </ul>}
        <p className="mb-0 small"><FormattedMessage id="editor.pasteGuard.issuesAdvice" /></p>
      </>
    case 'error':
      return <p className="mb-0"><FormattedMessage id="editor.pasteGuard.error" /></p>
    case 'unavailable':
      return <p className="mb-0"><FormattedMessage id="editor.pasteGuard.unavailable" /></p>
    }
  })()

  const actions = (() => {
    const secondary = (id: string, how: string, dataId: string) =>
      <button className="btn btn-sm btn-secondary" data-id={dataId} onClick={() => close(how)}><FormattedMessage id={id} /></button>
    switch (view) {
    case 'loading': return null
    case 'warn': return <>
      {secondary('editor.pasteGuard.continue', 'continue', 'pasteGuardContinue')}
      <button className="btn btn-sm btn-primary" data-id="pasteGuardAskAI" onClick={then('askAI', onAskAI)}><FormattedMessage id="editor.pasteGuard.askAI" /></button>
    </>
    case 'signin': return <>
      {secondary('editor.pasteGuard.continueWithoutScan', 'skip', 'pasteGuardContinue')}
      <button className="btn btn-sm btn-primary" data-id="pasteGuardSignIn" onClick={signIn}><FormattedMessage id="editor.pasteGuard.signin" /></button>
    </>
    case 'offer': return <>
      {secondary('editor.pasteGuard.continue', 'skip', 'pasteGuardContinue')}
      <button className="btn btn-sm btn-primary" data-id="pasteGuardScan" onClick={() => { track('scan'); startScan() }}><FormattedMessage id="editor.pasteGuard.scan" /></button>
    </>
    case 'exhausted': return <>
      <button className="btn btn-sm btn-link me-auto px-0" data-id="pasteGuardTopUp" onClick={then('topup', () => plugin.call('planManager', 'open', { reason: 'quota-exhausted', initialSection: 'topup' }))}><FormattedMessage id="editor.pasteGuard.topUp" /></button>
      {secondary('editor.pasteGuard.continueWithoutScan', 'skip', 'pasteGuardContinue')}
      <button className="btn btn-sm btn-primary" data-id="pasteGuardPlans" onClick={then('plans', () => plugin.call('planManager', 'open', { reason: 'quota-exhausted', initialSection: 'plans' }))}><FormattedMessage id="editor.pasteGuard.seePlans" /></button>
    </>
    case 'scanning': return <button className="btn btn-sm btn-secondary" data-id="pasteGuardBackground" onClick={() => close('background')}><FormattedMessage id="editor.pasteGuard.background" /></button>
    case 'clear': return <>
      {fullAuditButton()}
      <button className="btn btn-sm btn-primary" data-id="pasteGuardContinue" onClick={() => close('continue')}><FormattedMessage id="editor.pasteGuard.continue" /></button>
    </>
    case 'issues': return <>
      <button className="btn btn-sm btn-link text-muted me-auto px-0" data-id="pasteGuardIgnore" onClick={() => close('ignore')}><FormattedMessage id="editor.pasteGuard.ignore" /></button>
      {fullAuditButton()}
      <button className="btn btn-sm btn-danger" data-id="pasteGuardReview" onClick={then('review', () => plugin.call('preDeployChecks', 'open', request.file))}><FormattedMessage id="editor.pasteGuard.review" /></button>
    </>
    case 'error': return <>
      {secondary('editor.pasteGuard.continue', 'continue', 'pasteGuardContinue')}
      <button className="btn btn-sm btn-primary" data-id="pasteGuardRetry" onClick={() => { track('retry'); startScan() }}><FormattedMessage id="editor.pasteGuard.retry" /></button>
    </>
    case 'unavailable': return secondary('editor.pasteGuard.continue', 'continue', 'pasteGuardContinue')
    }
  })()

  return createPortal(
    <>
      {open && !inBackground && !showLogin && <>
        <div className="modal-backdrop show remix-paste-guard-backdrop"></div>
        <div ref={dialogRef} tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') close('escape') }} className="modal d-block remix-paste-guard" role="dialog" aria-modal="true" aria-labelledby="pasteGuardTitle" data-id="pasteGuard" data-view={view}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header border-0 pb-0">
                <div className="d-flex align-items-start gap-3">
                  <i className={`fas fa-2x ${icon}`}></i>
                  <div>
                    <h5 className="modal-title mb-0" id="pasteGuardTitle">{title}</h5>
                    <div className="small text-muted" data-id="pasteGuardSubtitle">
                      <FormattedMessage id="editor.pasteGuard.subtitle" values={{ lines: request.lines, file }} />
                    </div>
                  </div>
                </div>
                <button type="button" className="btn-close" data-id="pasteGuardClose" aria-label="Close" onClick={() => close('x')}></button>
              </div>
              <div className="modal-body">{body}</div>
              {actions && <div className="modal-footer border-0 pt-0">{actions}</div>}
            </div>
          </div>
        </div>
      </>}
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} plugin={plugin} />}
    </>,
    document.body
  )
}
