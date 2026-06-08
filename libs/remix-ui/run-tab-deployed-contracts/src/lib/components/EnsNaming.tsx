import React, { useState, useEffect, useRef, useContext, useCallback } from 'react'
import { DeployedContractsAppContext } from '../contexts'
import { DeployedContract } from '../types'
import { endpointUrls } from '@remix-endpoints-helper'
import { createWalletClient, createPublicClient, custom, type Hex } from 'viem'

const PARENT_NAME = 'remixcontract.eth'
const ETHERSCAN_BASE = 'https://etherscan.io'
const ENS_APP_BASE = 'https://app.ens.domains'
const POLL_INTERVAL = 2000
const DEBOUNCE_MS = 600

const ENS_REVERSE_REGISTRAR_L1 = '0xa58E81fe9b61B5c3fE2AFD33CF304c454AbFc7Cb' as Hex
const ENS_REVERSE_REGISTRAR_L2 = '0x0000000000D8e504002cC26E3Ec46D81971C1664' as Hex
const ENS_PUBLIC_RESOLVER_L1 = '0xF29100983E058B709F3D539b0c765937B804AC15' as Hex
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Hex

const getReverseRegistrar = (cid: number): Hex => {
  if (cid === 1) return ENS_REVERSE_REGISTRAR_L1
  return ENS_REVERSE_REGISTRAR_L2
}

// L1: setNameForAddr(address addr, address owner, address resolver, string name)
const REVERSE_REGISTRAR_ABI_L1 = [
  {
    name: 'setNameForAddr',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'addr', type: 'address' },
      { name: 'owner', type: 'address' },
      { name: 'resolver', type: 'address' },
      { name: 'name', type: 'string' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
] as const

// L2: setNameForAddr(address addr, string name)
const REVERSE_REGISTRAR_ABI_L2 = [
  {
    name: 'setNameForAddr',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'addr', type: 'address' },
      { name: 'name', type: 'string' },
    ],
    outputs: [],
  },
] as const

const OWNABLE_ABI = [
  {
    name: 'owner',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

// Supported chains (must match backend)
const SUPPORTED_CHAINS = new Map<number, string>([
  [1, 'Ethereum Mainnet'],
  [8453, 'Base'],
  [42161, 'Arbitrum One'],
  [10, 'OP Mainnet'],
  [59144, 'Linea'],
  [534352, 'Scroll'],
])

const CHAIN_EXPLORERS: Record<number, { url: string; name: string }> = {
  1: { url: 'https://etherscan.io', name: 'Etherscan' },
  8453: { url: 'https://basescan.org', name: 'Basescan' },
  42161: { url: 'https://arbiscan.io', name: 'Arbiscan' },
  10: { url: 'https://optimistic.etherscan.io', name: 'Etherscan (OP)' },
  59144: { url: 'https://lineascan.build', name: 'Lineascan' },
  534352: { url: 'https://scrollscan.com', name: 'Scrollscan' },
}

const getChainExplorer = (cid: number | null): { url: string; name: string } =>
  (cid && CHAIN_EXPLORERS[cid]) || { url: 'https://etherscan.io', name: 'Etherscan' }

type PreflightStatus =
  | 'idle' | 'checking' | 'available' | 'available_for_chain'
  | 'current' | 'taken' | 'unsupported_chain' | 'parent_not_owned'
  | 'name_not_controlled' | 'project_not_controlled' | 'error'

type JobStep = 'pending' | 'checking' | 'creating_project' | 'creating_label' | 'setting_forward' | 'completed' | 'failed'
type ViewStep = 'input' | 'registering' | 'reverse' | 'done' | 'error'

interface PreflightResult {
  fullName: string
  targetCoinType: number
  status: PreflightStatus
  currentAddress?: string
  parentOwned: boolean
  estimatedTxCount: number
  steps: string[]
}

interface JobTransaction {
  type: string
  hash?: string
  gasUsed?: string
  gasCostWei?: string
}

interface JobResult {
  id: string
  status: JobStep
  fullName: string
  transactions: JobTransaction[]
  totalGasUsed?: string
  totalCostWei?: string
  error?: string
  completedAt?: number
}

// ── Helpers ──

function apiBase(): string {
  // TODO: remove localhost override before production
  return 'http://localhost:4000/contract-ens'
}

const sanitizeLabel = (v: string) =>
  v.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')

const getDefaultLabel = (contract: DeployedContract) => {
  const name = sanitizeLabel(contract.name || contract.contractData?.contract?.name || '')
  return name || `contract-${contract.address.slice(2, 8).toLowerCase()}`
}

const formatGwei = (wei: string) => {
  const gwei = Number(wei) / 1e9
  return gwei < 0.01 ? '<0.01' : gwei.toFixed(2)
}

const formatEth = (wei: string) => {
  const eth = Number(wei) / 1e18
  return eth < 0.000001 ? '<0.000001' : eth.toFixed(6)
}

const JOB_STEP_LABELS: Record<string, string> = {
  pending: 'Queued...',
  checking: 'Checking name availability...',
  creating_project: 'Creating project subname...',
  creating_label: 'Creating label subname...',
  setting_forward: 'Setting forward record...',
  completed: 'Registration complete!',
  failed: 'Registration failed',
}

const friendlyError = (raw: string): string => {
  if (!raw) return 'An unknown error occurred.'
  if (raw.includes('User rejected') || raw.includes('user rejected') || raw.includes('denied'))
    return 'Transaction was rejected in your wallet.'
  if (raw.includes('name_not_controlled'))
    return 'This name exists but is not controlled by the Remix server.'
  if (raw.includes('taken'))
    return 'This name is already taken by a different address.'
  if (raw.includes('parent_not_owned'))
    return 'The ENS naming service is not available (parent not owned).'
  if (raw.includes('contract owner'))
    return 'Only the contract owner can set the reverse name.'
  if (raw.includes('switch your wallet'))
    return raw
  if (raw.includes('No wallet provider'))
    return raw
  if (raw.includes('Internal error') || raw.includes('SERVER_ERROR'))
    return 'Server transaction failed. Please try again later.'
  if (raw.includes('503') || raw.includes('not available'))
    return 'The ENS naming service is currently unavailable. Please try again later.'
  if (raw.includes('insufficient funds'))
    return 'Insufficient funds for the transaction.'
  return raw
}

// ── Component ──

interface EnsNamingProps {
  contract: DeployedContract
  onClose: () => void
}

export function EnsNaming({ contract, onClose }: EnsNamingProps) {
  const { plugin, themeQuality } = useContext(DeployedContractsAppContext)

  // State
  const [label, setLabel] = useState(getDefaultLabel(contract))
  const [project, setProject] = useState('default')
  const [chainId, setChainId] = useState<number | null>(null)
  const [viewStep, setViewStep] = useState<ViewStep>('input')

  // Preflight
  const [preflight, setPreflight] = useState<PreflightResult | null>(null)
  const [preflightStatus, setPreflightStatus] = useState<PreflightStatus>('idle')
  const [preflightError, setPreflightError] = useState('')

  // Job
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<JobStep>('pending')
  const [jobResult, setJobResult] = useState<JobResult | null>(null)
  const [jobError, setJobError] = useState('')

  // Reverse
  const [hasOwnable, setHasOwnable] = useState(false)
  const [reverseDone, setReverseDone] = useState(false)
  const [isReverseInProgress, setIsReverseInProgress] = useState(false)
  const [reverseStatusMsg, setReverseStatusMsg] = useState('')
  const [errorContext, setErrorContext] = useState<'forward' | 'reverse'>('forward')

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const textColor = themeQuality === 'dark' ? 'white' : 'black'
  const subtextColor = 'var(--text-tertiary, #a2a3bd)'
  const fullName = label && project ? `${label}.${project}.${PARENT_NAME}` : ''

  // Detect chain on mount
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
    })();
  }, [])

  // Detect Ownable
  useEffect(() => {
    const abi = contract.abi || contract.contractData?.abi || []
    const hasOwner = abi.some((item: any) =>
      item.type === 'function' && item.name === 'owner' && item.inputs?.length === 0
    )
    setHasOwnable(hasOwner)
  }, [contract])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  // Debounced preflight check
  useEffect(() => {
    if (!label || !project || !chainId) return

    setPreflightStatus('checking')
    setPreflightError('')
    setPreflight(null)

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${apiBase()}/preflight`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label, project, chainId, contractAddress: contract.address }),
        })
        const data = await res.json()

        if (!res.ok) {
          setPreflightStatus('error')
          setPreflightError(data.error || data.details?.[0]?.message || `Server error (${res.status})`)
          return
        }

        setPreflight(data)
        setPreflightStatus(data.status)
      } catch (e: any) {
        setPreflightStatus('error')
        setPreflightError('Could not reach the ENS naming service. Please try again later.')
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [label, project, chainId, contract.address])

  // Start registration
  const handleRegister = useCallback(async () => {
    if (!chainId) return

    setViewStep('registering')
    setJobError('')
    setJobStatus('pending')
    setJobResult(null)

    try {
      const res = await fetch(`${apiBase()}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, project, chainId, contractAddress: contract.address }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || `Job creation failed (${res.status})`)
      }

      if (data.status === 'current') {
        // Already registered — no job needed
        setViewStep('done')
        setJobResult({ id: '', status: 'completed', fullName: data.fullName || fullName, transactions: [], totalGasUsed: '0', totalCostWei: '0' } as any)
        return
      }

      setJobId(data.jobId)

      // Start polling
      pollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`${apiBase()}/jobs/${data.jobId}`)
          if (!pollRes.ok) return

          const job: JobResult = await pollRes.json()
          setJobStatus(job.status)
          setJobResult(job)

          if (job.status === 'completed') {
            clearInterval(pollRef.current!)
            pollRef.current = null
            setViewStep('done')
            await plugin.call('terminal', 'log', { type: 'info', value: `✅ ENS registered: ${job.fullName}` })
            // Reverse available on both L1 and L2 (both check Ownable.owner())
            if (hasOwnable) {
              setViewStep('reverse')
            } else {
              setViewStep('done')
            }
          } else if (job.status === 'failed') {
            clearInterval(pollRef.current!)
            pollRef.current = null
            setJobError(job.error || 'Registration failed.')
            setErrorContext('forward')
            setViewStep('error')
          }
        } catch { /* polling error — retry on next interval */ }
      }, POLL_INTERVAL)

    } catch (e: any) {
      setJobError(e.message)
      setErrorContext('forward')
      setViewStep('error')
    }
  }, [label, project, chainId, contract.address, fullName, hasOwnable])

  // Reverse handler — user signs on the deployment chain
  const handleReverse = useCallback(async () => {
    if (!chainId) return
    try {
      setViewStep('registering')
      setIsReverseInProgress(true)
      setReverseStatusMsg('Connecting wallet...')
      setJobError('')

      const provider = (window as any).ethereum
      if (!provider) throw new Error('No wallet provider found. Please install MetaMask.')

      const walletClient = createWalletClient({ transport: custom(provider) })
      const publicClient = createPublicClient({ transport: custom(provider) })

      const currentChainId = await publicClient.getChainId()
      await plugin.call('terminal', 'log', { type: 'info', value: `[ENS-Reverse] Chain: ${currentChainId}, expected: ${chainId}` })
      if (currentChainId !== chainId) {
        throw new Error(`Please switch your wallet to ${SUPPORTED_CHAINS.get(chainId)} (chain ID ${chainId}). Current: ${currentChainId}`)
      }

      const [account] = await walletClient.requestAddresses()
      await plugin.call('terminal', 'log', { type: 'info', value: `[ENS-Reverse] Account: ${account}` })

      // Verify ownership
      setReverseStatusMsg('Verifying contract ownership...')
      const owner = await publicClient.readContract({
        address: contract.address as Hex,
        abi: OWNABLE_ABI,
        functionName: 'owner',
        args: [],
      })
      await plugin.call('terminal', 'log', { type: 'info', value: `[ENS-Reverse] Contract owner: ${owner}, account: ${account}` })

      if ((owner as string).toLowerCase() !== account.toLowerCase()) {
        throw new Error(`Reverse can only be set by the contract owner.\nowner(): ${owner}\nYour address: ${account}`)
      }

      const registrar = getReverseRegistrar(chainId)
      const isL1 = chainId === 1
      const abi = isL1 ? REVERSE_REGISTRAR_ABI_L1 : REVERSE_REGISTRAR_ABI_L2
      const args = isL1
        ? [contract.address as Hex, account, ENS_PUBLIC_RESOLVER_L1, fullName]
        : [contract.address as Hex, fullName]

      await plugin.call('terminal', 'log', { type: 'info', value: `[ENS-Reverse] Registrar: ${registrar}, L1: ${isL1}` })
      await plugin.call('terminal', 'log', { type: 'info', value: `[ENS-Reverse] Args: ${JSON.stringify(args)}` })

      // Simulate first to catch revert reason
      setReverseStatusMsg('Simulating transaction...')
      try {
        await publicClient.simulateContract({
          address: registrar,
          abi,
          functionName: 'setNameForAddr',
          args: args as any,
          account,
        })
        await plugin.call('terminal', 'log', { type: 'info', value: `[ENS-Reverse] Simulation passed ✓` })
      } catch (simErr: any) {
        const reason = simErr.shortMessage || simErr.message
        await plugin.call('terminal', 'log', { type: 'error', value: `[ENS-Reverse] Simulation FAILED: ${reason}` })
        if (simErr.data) {
          await plugin.call('terminal', 'log', { type: 'error', value: `[ENS-Reverse] Revert data: ${JSON.stringify(simErr.data)}` })
        }
        throw new Error(`Transaction would fail: ${reason}`)
      }

      setReverseStatusMsg('Confirm the transaction in your wallet...')
      const tx = await walletClient.writeContract({
        chain: null,
        address: registrar,
        abi,
        functionName: 'setNameForAddr',
        args: args as any,
        account,
        gas: BigInt(200000),
      })
      await plugin.call('terminal', 'log', { type: 'info', value: `[ENS-Reverse] Tx submitted: ${tx}` })

      setReverseStatusMsg('Waiting for transaction confirmation...')
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx, timeout: 120_000 })
      await plugin.call('terminal', 'log', { type: 'info', value: `[ENS-Reverse] Tx confirmed. Status: ${receipt.status}, block: ${receipt.blockNumber}, gas: ${receipt.gasUsed}` })

      if (receipt.status === 'reverted') {
        throw new Error(`Transaction reverted on-chain (tx: ${tx})`)
      }

      await plugin.call('terminal', 'log', { type: 'info', value: `✅ Reverse: ${contract.address} → ${fullName} (on ${SUPPORTED_CHAINS.get(chainId)})` })

      setIsReverseInProgress(false)
      setReverseDone(true)
      setViewStep('done')
    } catch (e: any) {
      setJobError(e.shortMessage || e.message)
      setErrorContext('reverse')
      setIsReverseInProgress(false)
      setViewStep('error')
      await plugin.call('terminal', 'log', { type: 'error', value: `[ENS-Reverse] ERROR: ${e.message}` })
      if (e.cause) await plugin.call('terminal', 'log', { type: 'error', value: `[ENS-Reverse] Cause: ${JSON.stringify(e.cause)}` })
    }
  }, [contract.address, fullName, chainId])

  // ── Status helpers ──

  const getStatusIcon = () => {
    switch (preflightStatus) {
      case 'checking': return 'fas fa-spinner fa-spin'
      case 'available': case 'available_for_chain': return 'fas fa-check-circle text-success'
      case 'current': return 'fas fa-check-circle text-info'
      case 'taken': case 'name_not_controlled': case 'project_not_controlled': return 'fas fa-times-circle text-danger'
      case 'unsupported_chain': case 'parent_not_owned': return 'fas fa-exclamation-triangle text-warning'
      case 'error': return 'fas fa-exclamation-circle text-danger'
      default: return 'fas fa-info-circle'
    }
  }

  const getStatusMessage = (): string => {
    switch (preflightStatus) {
      case 'checking': return 'Checking availability...'
      case 'available': return `${fullName} is available. ${preflight?.estimatedTxCount || 0} L1 transaction(s) needed.`
      case 'available_for_chain': return `${fullName} exists but this chain record is not set.`
      case 'current': return `${fullName} already points to this contract.`
      case 'taken': return `${fullName} is already taken${preflight?.currentAddress ? ` by ${preflight.currentAddress.slice(0, 10)}...` : ''}.`
      case 'name_not_controlled': return 'This name exists but is not controlled by the Remix server.'
      case 'project_not_controlled': return 'This project exists but is not controlled by the Remix server.'
      case 'parent_not_owned': return 'The ENS naming service is not available (parent not owned).'
      case 'unsupported_chain': return preflightError
      case 'error': return preflightError || 'An error occurred.'
      default: return 'Enter a label to check availability.'
    }
  }

  const canRegister =
    preflightStatus === 'available' ||
    preflightStatus === 'available_for_chain'

  const getProgressSteps = (): { label: string; done: boolean; active: boolean }[] => {
    const ordered: JobStep[] = ['checking', 'creating_project', 'creating_label', 'setting_forward', 'completed']
    const currentIdx = ordered.indexOf(jobStatus)
    return ordered.map((s, i) => ({
      label: JOB_STEP_LABELS[s] || s,
      done: i < currentIdx || jobStatus === 'completed',
      active: i === currentIdx,
    }))
  }

  // ── Render ──

  return (
    <div className="p-3 rounded mb-2" style={{ backgroundColor: 'var(--custom-onsurface-layer-3)', border: '1px solid var(--bs-border-color)' }}>
      {/* Header */}
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

      {/* ── INPUT STEP ── */}
      {viewStep === 'input' && (
        <>
          {/* Chain info */}
          {chainId && (
            <div className="mb-2 p-2 rounded d-flex align-items-center gap-2" style={{ backgroundColor: 'rgba(100, 196, 255, 0.05)', fontSize: '0.75rem' }}>
              <i className="fas fa-link" style={{ color: '#64c4ff' }} />
              <span style={{ color: subtextColor }}>
                Deployed on <strong style={{ color: textColor }}>{SUPPORTED_CHAINS.get(chainId)}</strong> — server registers ENS on L1 (no gas cost to you)
              </span>
            </div>
          )}

          {/* Label input */}
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

          {/* Project input */}
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

          {/* Preview */}
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

          {/* Status */}
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

          {/* Register button */}
          <button
            className="btn btn-primary btn-sm w-100"
            onClick={handleRegister}
            disabled={!canRegister}
          >
            <i className="fas fa-arrow-right me-1" />
            {preflightStatus === 'current' ? 'Already Registered' : 'Register ENS Name'}
          </button>
        </>
      )}

      {/* ── REGISTERING STEP ── */}
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

          {/* Progress steps */}
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

          {/* Live tx info */}
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
        </div>
      )}

      {/* ── REVERSE STEP ── */}
      {viewStep === 'reverse' && (
        <div>
          <div className="p-2 rounded mb-2" style={{ backgroundColor: 'rgba(100, 255, 100, 0.08)', fontSize: '0.75rem' }}>
            <div style={{ color: '#81c784' }}>
              <i className="fas fa-check-circle me-1" />
              Forward: {fullName} &rarr; {contract.address}
            </div>
          </div>
          <div className="mb-2" style={{ fontSize: '0.75rem', color: subtextColor }}>
            <strong style={{ color: textColor }}>Set Reverse Name?</strong>
            <br />
            Allows block explorers and wallets to display the ENS name for this contract address.
            Requires one transaction on <strong style={{ color: textColor }}>{SUPPORTED_CHAINS.get(chainId!) || 'the deployment chain'}</strong> signed by the contract owner.
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

      {/* ── DONE STEP ── */}
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
                Reverse record set. Explorer display may take time to update.
              </div>
            )}
            {chainId && chainId !== 1 && (
              <div style={{ color: subtextColor, marginTop: '4px', fontSize: '0.65rem' }}>
                Chain: {SUPPORTED_CHAINS.get(chainId)} (coinType record on L1)
              </div>
            )}
          </div>

          {/* Gas cost summary */}
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

          {/* Transaction hashes */}
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

          {/* Links */}
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

      {/* ── ERROR STEP ── */}
      {viewStep === 'error' && (
        <div>
          {/* Show forward completion status if error happened during reverse */}
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
            {friendlyError(jobError)}
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
                  setJobId(null)
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
