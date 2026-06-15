import React, { useState, useEffect, useRef, useContext, useCallback } from 'react'
import { DeployedContractsAppContext } from '../contexts'
import { DeployedContract } from '../types'
import {
  DEBOUNCE_MS,
  ENS_EVENTS,
  ENS_APP_BASE,
  ETHERSCAN_BASE,
  JOB_STEP_LABELS,
  SUPPORTED_CHAINS,
  buildFullName,
  formatEth,
  friendlyEnsError,
  getChainExplorer,
  getDefaultEnsLabel,
  getEnsEventName,
  sanitizeLabel,
  type JobResult,
  type JobStep,
  type PreflightResult,
  type PreflightStatus,
  type PrimaryEnsCheckResult,
  type PrimaryEnsStatus,
  type ReverseCheckResult,
  type ReverseStatus,
  type ViewStep,
} from '../ens-contract-names'

interface EnsNamingProps {
  contract: DeployedContract
  onClose: () => void
}

export function EnsNaming({ contract, onClose }: EnsNamingProps) {
  const { plugin, themeQuality } = useContext(DeployedContractsAppContext)

  const [label, setLabel] = useState(getDefaultEnsLabel(contract))
  const [project, setProject] = useState('default')
  const [chainId, setChainId] = useState<number | null>(null)
  const [viewStep, setViewStep] = useState<ViewStep>('input')

  const [preflight, setPreflight] = useState<PreflightResult | null>(null)
  const [preflightStatus, setPreflightStatus] = useState<PreflightStatus>('idle')
  const [preflightError, setPreflightError] = useState('')

  const [jobStatus, setJobStatus] = useState<JobStep>('pending')
  const [jobResult, setJobResult] = useState<JobResult | null>(null)
  const [jobError, setJobError] = useState('')

  const [reverseDone, setReverseDone] = useState(false)
  const [reverseStatus, setReverseStatus] = useState<ReverseStatus>('idle')
  const [reverseName, setReverseName] = useState('')
  const [reverseCheckMessage, setReverseCheckMessage] = useState('')
  const [isReverseInProgress, setIsReverseInProgress] = useState(false)
  const [reverseStatusMsg, setReverseStatusMsg] = useState('')
  const [errorContext, setErrorContext] = useState<'forward' | 'reverse'>('forward')

  const [primaryEnsStatus, setPrimaryEnsStatus] = useState<PrimaryEnsStatus>('idle')
  const [primaryEnsName, setPrimaryEnsName] = useState('')
  const [primaryEnsMessage, setPrimaryEnsMessage] = useState('')

  const requestIdRef = useRef(`ens-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const mountedRef = useRef(true)

  const textColor = themeQuality === 'dark' ? 'white' : 'black'
  const subtextColor = 'var(--text-tertiary, #a2a3bd)'
  const fullName = label && project ? buildFullName(label, project) : ''

  const applyReverseResult = useCallback((result: ReverseCheckResult) => {
    setReverseStatus(result.status)
    setReverseDone(result.done)
    setReverseName(result.name)
    setReverseCheckMessage(result.message)
  }, [])

  const applyPrimaryEnsResult = useCallback((result: PrimaryEnsCheckResult) => {
    setPrimaryEnsStatus(result.status)
    setPrimaryEnsName(result.name)
    setPrimaryEnsMessage(result.message)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    const requestId = requestIdRef.current

    const isCurrentRequest = (payload: any) => payload?.requestId === requestId
    const onEnsEvent = (eventName: string, callback: (...payload: any[]) => void) => {
      plugin.on('ensContractNames' as any, eventName as any, callback)
    }
    const offEnsEvent = (eventName: string) => {
      plugin.off('ensContractNames' as any, eventName as any)
    }

    const onForwardStatus = (payload: any) => {
      if (!mountedRef.current || !isCurrentRequest(payload)) return
      if (payload.job) {
        setJobStatus(payload.job.status)
        setJobResult(payload.job)
      } else if (payload.status) {
        setJobStatus(payload.status)
      }
    }

    const onForwardCompleted = (payload: any) => {
      if (!mountedRef.current || !isCurrentRequest(payload)) return
      if (payload.job) {
        setJobStatus(payload.job.status)
        setJobResult(payload.job)
      }
    }

    const onForwardFailed = (payload: any) => {
      if (!mountedRef.current || !isCurrentRequest(payload)) return
      setJobError(payload.error || 'Registration failed.')
      setErrorContext('forward')
      setViewStep('error')
    }

    const onReverseStatus = (payload: any) => {
      if (!mountedRef.current || !isCurrentRequest(payload)) return
      if (payload.result) applyReverseResult(payload.result)
      if (payload.message) setReverseStatusMsg(payload.message)
    }

    const onReverseCompleted = (payload: any) => {
      if (!mountedRef.current || !isCurrentRequest(payload)) return
      if (payload.result) applyReverseResult(payload.result)
      setIsReverseInProgress(false)
      setViewStep('done')
    }

    const onReverseFailed = (payload: any) => {
      if (!mountedRef.current || !isCurrentRequest(payload)) return
      setJobError(payload.error || 'Reverse registration failed.')
      setErrorContext('reverse')
      setIsReverseInProgress(false)
      setViewStep('error')
    }

    const onPrimaryEnsStatus = (payload: any) => {
      if (!mountedRef.current || !isCurrentRequest(payload) || !payload.result) return
      applyPrimaryEnsResult(payload.result)
    }

    const forwardStatusEvent = getEnsEventName(ENS_EVENTS.forwardStatus, requestId)
    const forwardCompletedEvent = getEnsEventName(ENS_EVENTS.forwardCompleted, requestId)
    const forwardFailedEvent = getEnsEventName(ENS_EVENTS.forwardFailed, requestId)
    const reverseStatusEvent = getEnsEventName(ENS_EVENTS.reverseStatus, requestId)
    const reverseCompletedEvent = getEnsEventName(ENS_EVENTS.reverseCompleted, requestId)
    const reverseFailedEvent = getEnsEventName(ENS_EVENTS.reverseFailed, requestId)
    const primaryEnsStatusEvent = getEnsEventName(ENS_EVENTS.primaryEnsStatus, requestId)

    onEnsEvent(forwardStatusEvent, onForwardStatus)
    onEnsEvent(forwardCompletedEvent, onForwardCompleted)
    onEnsEvent(forwardFailedEvent, onForwardFailed)
    onEnsEvent(reverseStatusEvent, onReverseStatus)
    onEnsEvent(reverseCompletedEvent, onReverseCompleted)
    onEnsEvent(reverseFailedEvent, onReverseFailed)
    onEnsEvent(primaryEnsStatusEvent, onPrimaryEnsStatus)

    return () => {
      mountedRef.current = false
      plugin.call('ensContractNames' as any, 'cancelOperation' as any, requestId).catch(() => {})
      offEnsEvent(forwardStatusEvent)
      offEnsEvent(forwardCompletedEvent)
      offEnsEvent(forwardFailedEvent)
      offEnsEvent(reverseStatusEvent)
      offEnsEvent(reverseCompletedEvent)
      offEnsEvent(reverseFailedEvent)
      offEnsEvent(primaryEnsStatusEvent)
    }
  }, [plugin, applyPrimaryEnsResult, applyReverseResult])

  useEffect(() => {
    (async () => {
      try {
        const network = await plugin.call('udappEnv', 'getNetwork')
        const id = Number(network?.chainId)
        if (SUPPORTED_CHAINS.has(id)) {
          setChainId(id)
        } else {
          setChainId(null)
          setPreflightStatus('unsupported_chain')
          setPreflightError(`Chain ${network?.name || id} is not supported for ENS contract naming.`)
        }
      } catch {
        setPreflightStatus('error')
        setPreflightError('Could not detect network.')
      }
    })()
  }, [plugin])

  useEffect(() => {
    if (!label || !project || !chainId) return

    let cancelled = false
    setPreflightStatus('checking')
    setPreflightError('')
    setPreflight(null)
    setReverseDone(false)
    setReverseStatus('idle')
    setReverseName('')
    setReverseCheckMessage('')

    const timer = setTimeout(async () => {
      try {
        const result = await plugin.call('ensContractNames' as any, 'preflight' as any, {
          label,
          project,
          chainId,
          contractAddress: contract.address,
        }) as PreflightResult

        if (cancelled) return
        setPreflight(result)
        setPreflightStatus(result.status)
      } catch (error: any) {
        if (cancelled) return
        setPreflightStatus('error')
        setPreflightError(error?.message || 'Could not reach the ENS naming service. Please try again later.')
      }
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [label, project, chainId, contract.address, plugin])

  const checkReverseStatus = useCallback(async (): Promise<ReverseStatus> => {
    if (!chainId || !fullName) return 'idle'

    setReverseStatus('checking')
    setReverseName('')
    setReverseCheckMessage('Checking reverse record...')

    try {
      const result = await plugin.call('ensContractNames' as any, 'checkReverseStatus' as any, {
        requestId: requestIdRef.current,
        chainId,
        contractAddress: contract.address,
        fullName,
      }) as ReverseCheckResult

      applyReverseResult(result)
      return result.status
    } catch {
      const result: ReverseCheckResult = {
        status: 'unavailable',
        name: '',
        done: false,
        message: 'Reverse status could not be checked from the current wallet.',
      }
      applyReverseResult(result)
      return result.status
    }
  }, [applyReverseResult, chainId, contract.address, fullName, plugin])

  useEffect(() => {
    if (preflightStatus === 'current') {
      checkReverseStatus()
    }
  }, [preflightStatus, checkReverseStatus])

  const checkPrimaryEnsName = useCallback(async () => {
    if (!chainId) return

    setPrimaryEnsStatus('checking')
    setPrimaryEnsName('')
    setPrimaryEnsMessage('')

    try {
      const result = await plugin.call('ensContractNames' as any, 'checkPrimaryEnsName' as any, {
        requestId: requestIdRef.current,
        chainId,
        contractAddress: contract.address,
      }) as PrimaryEnsCheckResult
      applyPrimaryEnsResult(result)
    } catch {
      setPrimaryEnsStatus('unavailable')
    }
  }, [applyPrimaryEnsResult, chainId, contract.address, plugin])

  useEffect(() => {
    checkPrimaryEnsName()
  }, [checkPrimaryEnsName])

  const openReverseStep = useCallback(async () => {
    setJobResult({ id: '', status: 'completed', fullName, transactions: [], totalGasUsed: '0', totalCostWei: '0' })
    const status = await checkReverseStatus()
    setViewStep(status === 'set' ? 'done' : 'reverse')
  }, [checkReverseStatus, fullName])

  const handleRegister = useCallback(async () => {
    if (!chainId) return

    setViewStep('registering')
    setJobError('')
    setJobStatus('pending')
    setJobResult(null)

    try {
      const job = await plugin.call('ensContractNames' as any, 'registerForward' as any, {
        requestId: requestIdRef.current,
        label,
        project,
        chainId,
        contractAddress: contract.address,
      }) as JobResult

      if (!mountedRef.current) return
      setJobStatus(job.status)
      setJobResult(job)
    } catch (error: any) {
      if (!mountedRef.current || error?.message === 'Operation canceled') return
      setJobError(error?.message || 'Registration failed.')
      setErrorContext('forward')
      setViewStep('error')
    }
  }, [label, project, chainId, contract.address, checkReverseStatus, plugin])

  useEffect(() => {
    if (viewStep !== 'registering' || isReverseInProgress || jobStatus !== 'completed') return

    let cancelled = false
    ;(async () => {
      const reverse = await checkReverseStatus()
      if (!cancelled && mountedRef.current) {
        setViewStep(reverse === 'set' ? 'done' : 'reverse')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [checkReverseStatus, isReverseInProgress, jobStatus, viewStep])

  const handleReverse = useCallback(async () => {
    if (!chainId) return

    try {
      setViewStep('registering')
      setIsReverseInProgress(true)
      setReverseStatusMsg('Connecting wallet...')
      setJobError('')

      const result = await plugin.call('ensContractNames' as any, 'setReverse' as any, {
        requestId: requestIdRef.current,
        chainId,
        contractAddress: contract.address,
        fullName,
      }) as ReverseCheckResult

      if (!mountedRef.current) return
      applyReverseResult(result)
      if (result.done) {
        setIsReverseInProgress(false)
        setViewStep('done')
      }
    } catch (error: any) {
      if (!mountedRef.current) return
      setJobError(error?.shortMessage || error?.message || 'Reverse registration failed.')
      setErrorContext('reverse')
      setIsReverseInProgress(false)
      setViewStep('error')
    }
  }, [applyReverseResult, contract.address, fullName, chainId, plugin])

  const getStatusIcon = () => {
    switch (preflightStatus) {
    case 'checking': return 'fas fa-spinner fa-spin'
    case 'available': case 'available_for_chain': return 'fas fa-check-circle text-success'
    case 'current': return 'fas fa-check-circle text-info'
    case 'taken': case 'name_not_controlled': case 'project_not_controlled': return 'fas fa-times-circle text-danger'
    case 'unsupported_chain': case 'parent_not_owned': case 'validation_only': return 'fas fa-exclamation-triangle text-warning'
    case 'error': return 'fas fa-exclamation-circle text-danger'
    default: return 'fas fa-info-circle'
    }
  }

  const getStatusMessage = (): string => {
    switch (preflightStatus) {
    case 'checking': return 'Checking availability...'
    case 'available': return `${fullName} is available. ${preflight?.estimatedTxCount || 0} L1 transaction(s) needed.`
    case 'available_for_chain': return `${fullName} exists but this chain record is not set.`
    case 'current':
      if (reverseStatus === 'checking') return `${fullName} already points to this contract. Checking reverse...`
      if (reverseStatus === 'set') return `${fullName} already has forward and reverse records set.`
      if (reverseStatus === 'not_set') return `${fullName} already points to this contract. Reverse is not set yet.`
      if (reverseStatus === 'wrong_chain' || reverseStatus === 'unavailable') return `${fullName} already points to this contract. ${reverseCheckMessage}`
      return `${fullName} already points to this contract.`
    case 'taken': return `${fullName} is already taken${preflight?.currentAddress ? ` by ${preflight.currentAddress.slice(0, 10)}...` : ''}.`
    case 'name_not_controlled': return 'This name exists but is not controlled by the Remix server.'
    case 'project_not_controlled': return 'This project exists but is not controlled by the Remix server.'
    case 'parent_not_owned': return 'The ENS naming service is not available (parent not owned).'
    case 'validation_only': return 'ENS registration is unavailable until the server wallet is configured.'
    case 'unsupported_chain': return preflightError
    case 'error': return preflightError || 'An error occurred.'
    default: return 'Enter a label to check availability.'
    }
  }

  const canRegister =
    preflightStatus === 'available' ||
    preflightStatus === 'available_for_chain'
  const canOpenReverse = preflightStatus === 'current'

  const getProgressSteps = (): { label: string; done: boolean; active: boolean }[] => {
    const ordered: JobStep[] = ['checking', 'creating_project', 'creating_label', 'setting_forward', 'completed']
    const currentIdx = ordered.indexOf(jobStatus)
    return ordered.map((s, i) => ({
      label: JOB_STEP_LABELS[s] || s,
      done: i < currentIdx || jobStatus === 'completed',
      active: i === currentIdx,
    }))
  }

  return (
    <div className="p-3 rounded mb-2" style={{ backgroundColor: 'var(--custom-onsurface-layer-3)', border: '1px solid var(--bs-border-color)' }}>
      <div className="d-flex justify-content-between align-items-center mb-2">
        <span style={{ color: textColor, fontWeight: 600, fontSize: '0.85rem' }}>
          <i className="fas fa-link me-1" /> ENS Contract Naming
        </span>
        <button
          className="btn btn-sm"
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: subtextColor, fontSize: '1.2rem', lineHeight: 1, padding: 0 }}
        >×</button>
      </div>

      {viewStep === 'input' && (
        <>
          {chainId && (
            <div className="mb-2 p-2 rounded d-flex align-items-center gap-2" style={{ backgroundColor: 'rgba(100, 196, 255, 0.05)', fontSize: '0.75rem' }}>
              <i className="fas fa-link" style={{ color: '#64c4ff' }} />
              <span style={{ color: subtextColor }}>
                Deployed on <strong style={{ color: textColor }}>{SUPPORTED_CHAINS.get(chainId)}</strong> — server registers ENS on L1 (no gas cost to you)
              </span>
            </div>
          )}

          {(primaryEnsStatus === 'checking' || primaryEnsStatus === 'verified' || primaryEnsMessage) && (
            <div
              className="mb-2 p-2 rounded"
              style={{
                backgroundColor: primaryEnsStatus === 'unverified' ? 'rgba(255, 207, 92, 0.08)' : 'rgba(100, 196, 255, 0.05)',
                fontSize: '0.72rem',
                color: primaryEnsStatus === 'unverified' ? '#ffcf5c' : subtextColor,
              }}
            >
              <i className={`fas ${primaryEnsStatus === 'checking' ? 'fa-spinner fa-spin' : primaryEnsStatus === 'verified' ? 'fa-check-circle' : 'fa-info-circle'} me-1`} />
              {primaryEnsStatus === 'checking' ? (
                'Checking primary ENS...'
              ) : primaryEnsStatus === 'verified' ? (
                <>
                  Primary ENS:{' '}
                  <strong style={{ color: '#64c4ff', wordBreak: 'break-all' }}>{primaryEnsName}</strong>
                </>
              ) : (
                <>
                  {primaryEnsName && (
                    <>
                      Reverse ENS:{' '}
                      <strong style={{ color: '#ffcf5c', wordBreak: 'break-all' }}>{primaryEnsName}</strong>
                      <br />
                    </>
                  )}
                  {primaryEnsMessage}
                </>
              )}
            </div>
          )}

          <div className="mb-2">
            <label className="small mb-1 d-block" style={{ color: subtextColor }}>Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(sanitizeLabel(e.target.value))}
              className="form-control form-control-sm"
              placeholder="my-token"
              style={{ backgroundColor: 'var(--bs-body-bg)', color: textColor, fontSize: '0.8rem' }}
              disabled={!chainId}
            />
          </div>

          <div className="mb-2">
            <label className="small mb-1 d-block" style={{ color: subtextColor }}>Project</label>
            <input
              type="text"
              value={project}
              onChange={(e) => setProject(sanitizeLabel(e.target.value))}
              className="form-control form-control-sm"
              placeholder="my-project"
              style={{ backgroundColor: 'var(--bs-body-bg)', color: textColor, fontSize: '0.8rem' }}
              disabled={!chainId}
            />
          </div>

          {fullName && (
            <div className="mb-2 p-2 rounded" style={{ backgroundColor: 'var(--custom-onsurface-layer-2)', fontSize: '0.75rem' }}>
              <div style={{ color: subtextColor }}>Preview:</div>
              <div style={{ color: '#64c4ff', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {fullName}
              </div>
              <div style={{ color: subtextColor, marginTop: '4px' }}>
                &rarr; {contract.address}
              </div>
            </div>
          )}

          <div
            className="mb-2 p-2 rounded"
            style={{
              backgroundColor: preflightStatus === 'taken' || preflightStatus === 'error'
                ? 'rgba(255, 119, 119, 0.1)'
                : canRegister ? 'rgba(100, 255, 100, 0.05)' : 'rgba(100, 196, 255, 0.05)',
              fontSize: '0.7rem',
              color: preflightStatus === 'taken' || preflightStatus === 'error' ? '#ff7777'
                : canRegister ? '#81c784' : subtextColor,
            }}
          >
            <i className={`${getStatusIcon()} me-1`} />
            {getStatusMessage()}
          </div>

          <button
            className="btn btn-primary btn-sm w-100"
            onClick={canOpenReverse ? openReverseStep : handleRegister}
            disabled={!canRegister && !canOpenReverse}
          >
            <i className={`fas ${canOpenReverse ? 'fa-exchange-alt' : 'fa-arrow-right'} me-1`} />
            {canOpenReverse ? (reverseStatus === 'set' ? 'View ENS Status' : 'Set Reverse Record') : 'Register ENS Name'}
          </button>
        </>
      )}

      {viewStep === 'registering' && (
        <div className="py-2">
          <div className="text-center mb-3">
            <div className="spinner-border spinner-border-sm text-primary mb-2" />
            <div style={{ color: textColor, fontSize: '0.85rem', fontWeight: 600 }}>
              {isReverseInProgress ? 'Setting Reverse Record' : `Registering ${fullName}`}
            </div>
            <div style={{ color: subtextColor, fontSize: '0.7rem' }}>
              {isReverseInProgress ? reverseStatusMsg : 'Server is processing L1 transactions...'}
            </div>
          </div>

          {!isReverseInProgress && (
            <>
              <div className="mb-2">
                {getProgressSteps().map((s, i) => (
                  <div key={i} className="d-flex align-items-center gap-2 py-1" style={{ fontSize: '0.7rem' }}>
                    {s.done ? (
                      <i className="fas fa-check-circle" style={{ color: '#81c784', width: 14 }} />
                    ) : s.active ? (
                      <i className="fas fa-spinner fa-spin" style={{ color: '#64c4ff', width: 14 }} />
                    ) : (
                      <i className="far fa-circle" style={{ color: subtextColor, width: 14 }} />
                    )}
                    <span style={{ color: s.active ? textColor : s.done ? '#81c784' : subtextColor }}>{s.label}</span>
                  </div>
                ))}
              </div>

              {jobResult?.transactions && jobResult.transactions.length > 0 && (
                <div className="p-2 rounded" style={{ backgroundColor: 'var(--custom-onsurface-layer-2)', fontSize: '0.65rem' }}>
                  {jobResult.transactions.map((tx, i) => (
                    <div key={i} className="d-flex justify-content-between" style={{ color: subtextColor }}>
                      <span>{tx.type}</span>
                      {tx.hash && (
                        <a
                          href={`${ETHERSCAN_BASE}/tx/${tx.hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#64c4ff' }}
                        >
                          {tx.hash.slice(0, 10)}...
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {viewStep === 'reverse' && (
        <div>
          <div className="p-2 rounded mb-2" style={{ backgroundColor: 'rgba(100, 255, 100, 0.08)', fontSize: '0.75rem' }}>
            <div style={{ color: '#81c784' }}>
              <i className="fas fa-check-circle me-1" />
              Forward: {fullName} &rarr; {contract.address}
            </div>
          </div>
          {reverseCheckMessage && (
            <div
              className="p-2 rounded mb-2"
              style={{
                backgroundColor: reverseStatus === 'set' ? 'rgba(100, 255, 100, 0.08)' : 'rgba(255, 207, 92, 0.08)',
                color: reverseStatus === 'set' ? '#81c784' : '#ffcf5c',
                fontSize: '0.7rem',
              }}
            >
              <i className={`fas ${reverseStatus === 'set' ? 'fa-check-circle' : 'fa-info-circle'} me-1`} />
              {reverseCheckMessage}
            </div>
          )}
          <div className="mb-2" style={{ fontSize: '0.75rem', color: subtextColor }}>
            <strong style={{ color: textColor }}>Set Reverse Name?</strong>
            <br />
            Allows block explorers and wallets to display the ENS name for this contract address.
            Requires one transaction on <strong style={{ color: textColor }}>{(chainId && SUPPORTED_CHAINS.get(chainId)) || 'the deployment chain'}</strong> signed by the contract owner.
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-primary btn-sm flex-fill" onClick={handleReverse}>
              <i className="fas fa-exchange-alt me-1" />
              Set Reverse
            </button>
            <button
              className="btn btn-outline-secondary btn-sm flex-fill"
              onClick={() => setViewStep('done')}
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {viewStep === 'done' && (
        <div>
          <div className="p-2 rounded mb-2" style={{ backgroundColor: 'rgba(100, 255, 100, 0.08)', fontSize: '0.75rem' }}>
            <div style={{ color: '#81c784' }}>
              <i className="fas fa-check-circle me-1" />
              Forward: {fullName} &rarr; {contract.address}
            </div>
            {reverseDone && (
              <div style={{ color: '#81c784', marginTop: '4px' }}>
                <i className="fas fa-check-circle me-1" />
                Reverse: {contract.address} &rarr; {reverseName || fullName}. Explorer display may take time to update.
              </div>
            )}
            {chainId && chainId !== 1 && (
              <div style={{ color: subtextColor, marginTop: '4px', fontSize: '0.65rem' }}>
                Chain: {SUPPORTED_CHAINS.get(chainId)} (coinType record on L1)
              </div>
            )}
          </div>

          {jobResult?.totalCostWei && jobResult.totalCostWei !== '0' && (
            <div className="p-2 rounded mb-2" style={{ backgroundColor: 'var(--custom-onsurface-layer-2)', fontSize: '0.65rem' }}>
              <div className="d-flex justify-content-between" style={{ color: subtextColor }}>
                <span>Total gas used</span>
                <span style={{ color: textColor }}>{jobResult.totalGasUsed}</span>
              </div>
              <div className="d-flex justify-content-between" style={{ color: subtextColor }}>
                <span>Total cost (paid by Remix)</span>
                <span style={{ color: textColor }}>{formatEth(jobResult.totalCostWei)} ETH</span>
              </div>
            </div>
          )}

          {jobResult?.transactions && jobResult.transactions.length > 0 && (
            <div className="p-2 rounded mb-2" style={{ backgroundColor: 'var(--custom-onsurface-layer-2)', fontSize: '0.65rem' }}>
              {jobResult.transactions.map((tx, i) => (
                <div key={i} className="d-flex justify-content-between py-1" style={{ color: subtextColor }}>
                  <span>{tx.type}</span>
                  {tx.hash && (
                    <a href={`${ETHERSCAN_BASE}/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer" style={{ color: '#64c4ff' }}>
                      {tx.hash.slice(0, 14)}...
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="d-flex gap-2 mb-2">
            <a
              href={`${getChainExplorer(chainId).url}/address/${contract.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline-primary btn-sm flex-fill"
              style={{ fontSize: '0.7rem' }}
            >
              <i className="fas fa-external-link-alt me-1" /> {getChainExplorer(chainId).name}
            </a>
            <a
              href={`${ENS_APP_BASE}/${fullName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline-primary btn-sm flex-fill"
              style={{ fontSize: '0.7rem' }}
            >
              <i className="fas fa-external-link-alt me-1" /> ENS App
            </a>
          </div>

          <button className="btn btn-sm w-100" onClick={onClose} style={{ color: subtextColor, fontSize: '0.75rem' }}>
            Close
          </button>
        </div>
      )}

      {viewStep === 'error' && (
        <div>
          {errorContext === 'reverse' && (
            <div className="p-2 rounded mb-2" style={{ backgroundColor: 'rgba(100, 255, 100, 0.08)', fontSize: '0.75rem' }}>
              <div style={{ color: '#81c784' }}>
                <i className="fas fa-check-circle me-1" />
                Forward: {fullName} &rarr; {contract.address}
              </div>
            </div>
          )}
          <div className="p-2 rounded mb-2" style={{ backgroundColor: 'rgba(255, 119, 119, 0.1)', fontSize: '0.75rem', color: '#ff7777' }}>
            <i className="fas fa-exclamation-triangle me-1" />
            {friendlyEnsError(jobError)}
          </div>
          <div className="d-flex gap-2">
            {errorContext === 'reverse' ? (
              <button
                className="btn btn-outline-primary btn-sm flex-fill"
                onClick={() => {
                  setJobError('')
                  setViewStep('reverse')
                }}
              >
                <i className="fas fa-redo me-1" />
                Retry Reverse
              </button>
            ) : (
              <button
                className="btn btn-outline-primary btn-sm flex-fill"
                onClick={() => {
                  setViewStep('input')
                  setJobError('')
                }}
              >
                Retry
              </button>
            )}
            <button className="btn btn-outline-secondary btn-sm flex-fill" onClick={() => {
              if (errorContext === 'reverse') {
                setJobError('')
                setViewStep('done')
              } else {
                onClose()
              }
            }}>
              {errorContext === 'reverse' ? 'Skip Reverse' : 'Close'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
