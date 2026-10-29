import React, { useContext, useEffect, useState } from 'react'
import { DeployedContractsAppContext } from '../contexts'

interface SavedContractRecord {
  entityKey: string
  address: string
  name: string
  chainId: string
  savedAt: number
  expiryLabel: string
  abi: any[]
}

type SourcifyVerification = 'perfect' | 'partial'

const CHAIN_NAMES: Record<string, string> = {
  '1': 'Ethereum',
  '11155111': 'Sepolia',
  '137': 'Polygon',
  '42161': 'Arbitrum',
  '10': 'Optimism',
  '8453': 'Base',
  '56': 'BNB Chain',
  '43114': 'Avalanche',
}

async function checkSourcify(
  contracts: SavedContractRecord[],
): Promise<Record<string, SourcifyVerification>> {
  const results: Record<string, SourcifyVerification> = {}

  const toCheck = contracts.filter(c => c.chainId && c.address && !isNaN(Number(c.chainId)))

  await Promise.all(
    toCheck.map(async (c) => {
      try {
        // Sourcify API v2 — one request per (chainId, address)
        const url = `https://sourcify.dev/server/v2/contract/${c.chainId}/${c.address}`
        const resp = await fetch(url, {
          signal: AbortSignal.timeout(8000),
          headers: { 'User-Agent': 'Remix IDE (https://remix.ethereum.org)' },
        })
        if (!resp.ok) return  // 404 = not verified; other errors ignored
        const data = await resp.json()
        const match: string = data?.match ?? data?.matchType ?? ''
        results[`${c.chainId}:${c.address.toLowerCase()}`] =
          (match === 'exact_match' || match === 'full_match') ? 'perfect' : 'partial'
      } catch {
        // Timeout or network error — fail silently
      }
    }),
  )

  return results
}

interface ArkivRetrievePanelProps {
  onClose: () => void
}

export const ArkivRetrievePanel: React.FC<ArkivRetrievePanelProps> = ({ onClose }) => {
  const { plugin } = useContext(DeployedContractsAppContext)
  const [contracts, setContracts] = useState<SavedContractRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [sourcify, setSourcify] = useState<Record<string, SourcifyVerification>>({})

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const account = await plugin.call('udappEnv', 'getSelectedAccount')
        if (!account) {
          setError('No wallet connected. Please connect a wallet.')
          return
        }
        const result = await (plugin as any).call('arkivNetwork', 'retrieveDeployedContracts', { walletAddress: account })
        const loaded: SavedContractRecord[] = result.contracts || []
        setContracts(loaded)
        // Fire Sourcify checks in the background — don't block the panel render
        checkSourcify(loaded).then(setSourcify)
      } catch (e: any) {
        setError(`Failed to retrieve: ${e?.message || String(e)}`)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  const handleLoad = async (record: SavedContractRecord) => {
    setLoadingKey(record.entityKey)
    try {
      await (plugin as any).addInstance(record.address, record.abi, record.name)
      onClose()
    } catch (e: any) {
      await plugin.call('notification', 'toast', `Failed to load contract: ${e?.message || String(e)}`)
    } finally {
      setLoadingKey(null)
    }
  }

  const chainLabel = (chainId: string) => CHAIN_NAMES[chainId] || `Chain ${chainId}`

  const formatDate = (ts: number) => {
    if (!ts) return ''
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className="m-3 mt-0 p-3 rounded" style={{ backgroundColor: 'var(--custom-onsurface-layer-2)' }} data-id="arkivRetrievePanel">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <p className="mb-0 fw-bold" style={{ fontSize: '0.9rem' }}>
          <i className="fas fa-cloud-download-alt me-2 text-primary"></i>
          Contracts saved on Arkiv
        </p>
        <button
          className="btn btn-sm"
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: 'var(--bs-quaternary)', fontSize: '1.5rem', lineHeight: 1, padding: 0 }}
          data-id="closeArkivRetrievePanel"
        >×</button>
      </div>

      {isLoading && (
        <div className="text-muted text-center py-3" style={{ fontSize: '0.8rem' }}>
          <i className="fa fa-spinner fa-spin me-2"></i>Loading from Arkiv…
        </div>
      )}

      {error && !isLoading && (
        <div className="text-danger" style={{ fontSize: '0.8rem' }}>{error}</div>
      )}

      {!isLoading && !error && contracts.length === 0 && (
        <div className="text-muted" style={{ fontSize: '0.8rem' }}>
          No contracts saved yet. Use the kebab menu on a deployed contract to save it.
        </div>
      )}

      {!isLoading && contracts.length > 0 && (
        <div className="d-flex flex-column gap-2">
          {contracts.map(record => {
            const sourcifyKey = `${record.chainId}:${record.address.toLowerCase()}`
            const verified = sourcify[sourcifyKey]

            return (
              <div
                key={record.entityKey}
                className="d-flex align-items-center justify-content-between p-2 rounded"
                style={{ backgroundColor: 'var(--custom-onsurface-layer-3)', fontSize: '0.8rem' }}
              >
                <div className="d-flex flex-column overflow-hidden me-2" style={{ minWidth: 0 }}>
                  <div className="d-flex align-items-center gap-1">
                    <span className="fw-bold text-truncate">{record.name}</span>
                    {verified && (
                      <a
                        href={`https://sourcify.dev/#/lookup/${record.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Verified on Sourcify (${verified} match)`}
                        onClick={e => e.stopPropagation()}
                        style={{ lineHeight: 1, flexShrink: 0 }}
                      >
                        <i
                          className={`fas fa-check-circle ${verified === 'perfect' ? 'text-success' : 'text-warning'}`}
                          style={{ fontSize: '0.75rem' }}
                        />
                      </a>
                    )}
                  </div>
                  <span className="text-muted" style={{ fontSize: '0.7rem', fontFamily: 'monospace' }}>
                    {record.address.slice(0, 8)}…{record.address.slice(-6)}
                  </span>
                  <span className="text-secondary" style={{ fontSize: '0.7rem' }}>
                    {chainLabel(record.chainId)}{record.savedAt ? ` · ${formatDate(record.savedAt)}` : ''}
                    {record.expiryLabel && record.expiryLabel !== 'unknown'
                      ? ` · ${record.expiryLabel === 'permanent' ? '🔒 permanent' : `⏳ ${record.expiryLabel}`}`
                      : ''}
                  </span>
                </div>
                <button
                  className="btn btn-sm btn-outline-primary flex-shrink-0"
                  style={{ fontSize: '0.7rem' }}
                  disabled={loadingKey === record.entityKey}
                  onClick={() => handleLoad(record)}
                  data-id={`loadArkivContract-${record.entityKey}`}
                >
                  {loadingKey === record.entityKey
                    ? <i className="fa fa-spinner fa-spin"></i>
                    : 'Load'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
