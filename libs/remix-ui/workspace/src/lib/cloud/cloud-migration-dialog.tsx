/**
 * Cloud Migration Dialog
 *
 * A React component that presents a modal for migrating local workspaces
 * (/.workspaces/<name>) to cloud workspaces (/.cloud-workspaces/<uuid> + S3).
 *
 * Features:
 *  - Discover local workspaces that haven't been migrated
 *  - Show file count and estimated size per workspace
 *  - Detect name conflicts with existing cloud workspaces
 *  - Allow editing the cloud name when there's a conflict
 *  - Per-workspace migration progress with visual progress bars
 *  - File-level progress: shows current file being processed
 *  - Overall progress bar across all workspaces
 *  - Atomic migration with rollback on failure
 *  - Auto-refreshes workspace list on completion
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ModalDialog } from '@remix-ui/modal-dialog'
import {
  discoverLocalWorkspaces,
  buildMigrationItems,
  migrateWorkspaces,
  dismissMigration,
  MigrationItem,
  MigrationStatus,
  LocalWorkspaceInfo,
} from './cloud-migration'
import { cloudStore } from './cloud-store'
import { refreshCloudWorkspaces } from './cloud-workspace-actions'

// ── Types ────────────────────────────────────────────────────

interface CloudMigrationDialogProps {
  visible: boolean
  onHide: () => void
  onMigrationComplete?: () => void
  plugin?: any
}

type DialogPhase = 'loading' | 'select' | 'migrating' | 'done'

// ── Helpers ──────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Human-readable status label */
const STATUS_LABELS: Record<MigrationStatus, string> = {
  pending:   'Waiting…',
  creating:  'Creating workspace',
  copying:   'Copying files',
  uploading: 'Uploading to cloud',
  verifying: 'Verifying',
  cleaning:  'Cleaning up',
  done:      'Complete',
  error:     'Failed',
  skipped:   'Skipped',
}

/** Icon + color per status */
const STATUS_ICONS: Record<MigrationStatus, { icon: string; color: string }> = {
  pending:   { icon: 'far fa-circle', color: 'var(--bs-secondary)' },
  creating:  { icon: 'fas fa-spinner fa-spin', color: 'var(--bs-info)' },
  copying:   { icon: 'fas fa-copy fa-beat-fade', color: 'var(--bs-info)' },
  uploading: { icon: 'fas fa-cloud-arrow-up fa-beat-fade', color: 'var(--bs-primary)' },
  verifying: { icon: 'fas fa-shield-halved fa-spin', color: 'var(--bs-info)' },
  cleaning:  { icon: 'fas fa-broom', color: 'var(--bs-warning)' },
  done:      { icon: 'fas fa-circle-check', color: 'var(--bs-success)' },
  error:     { icon: 'fas fa-circle-xmark', color: 'var(--bs-danger)' },
  skipped:   { icon: 'fas fa-minus-circle', color: 'var(--bs-secondary)' },
}

/** Steps in order, for the step indicator */
const STEPS: MigrationStatus[] = ['creating', 'copying', 'uploading', 'verifying', 'cleaning', 'done']

function getStepIndex(status: MigrationStatus): number {
  const idx = STEPS.indexOf(status)
  return idx >= 0 ? idx : -1
}

/**
 * Compute a 0–100 progress percentage for a single workspace.
 * Weights: creating=5%, copying=15%, snapshot=10%, file upload=60%, verify=5%, clean=5%
 */
function getItemProgress(item: MigrationItem): number {
  if (item.status === 'done') return 100
  if (item.status === 'error') return 0
  if (item.status === 'skipped' || item.status === 'pending') return 0

  let pct = 0

  // creating = 5%
  if (item.status === 'creating') return 2
  pct += 5

  // copying = 15%
  if (item.status === 'copying') {
    const total = item.totalFiles || 1
    const copied = item.copiedFiles || 0
    return pct + Math.round((copied / total) * 15)
  }
  pct += 15

  // uploading: snapshot = 10%, files = 60%
  if (item.status === 'uploading') {
    const snapshotPct = item.snapshotDone ? 10 : 5 // halfway through snapshot
    const total = item.totalFiles || 1
    const uploaded = item.uploadedFiles || 0
    const filePct = Math.round((uploaded / total) * 60)
    return pct + snapshotPct + filePct
  }
  pct += 70 // snapshot + files done

  // verifying = 5%
  if (item.status === 'verifying') return pct + 2
  pct += 5

  // cleaning = 5%
  if (item.status === 'cleaning') return pct + 2
  return pct
}

// ── Subcomponents ────────────────────────────────────────────

/** A thin progress bar */
const ProgressBar: React.FC<{ percent: number; color?: string; height?: number; className?: string }> = ({
  percent,
  color = 'var(--bs-info)',
  height = 4,
  className = '',
}) => (
  <div
    className={`w-100 rounded-pill overflow-hidden ${className}`}
    style={{ height, backgroundColor: 'var(--bs-border-color, rgba(128,128,128,0.2))' }}
  >
    <div
      className="h-100 rounded-pill"
      style={{
        width: `${Math.min(100, Math.max(0, percent))}%`,
        backgroundColor: color,
        transition: 'width 0.3s ease',
      }}
    />
  </div>
)

/** Workspace migration card — shown during migrating/done phases */
const MigrationCard: React.FC<{ item: MigrationItem; localWs?: LocalWorkspaceInfo }> = ({ item, localWs }) => {
  const si = STATUS_ICONS[item.status] || STATUS_ICONS.pending
  const progress = getItemProgress(item)
  const isActive = !['pending', 'done', 'error', 'skipped'].includes(item.status)

  // Determine progress bar color based on status
  let barColor = 'var(--bs-info)'
  if (item.status === 'done') barColor = 'var(--bs-success)'
  if (item.status === 'error') barColor = 'var(--bs-danger)'
  if (item.status === 'uploading') barColor = 'var(--bs-primary)'

  return (
    <div
      className={`p-3 mb-2 rounded border ${isActive ? 'border-info' : ''}`}
      style={{
        backgroundColor: isActive ? 'rgba(var(--bs-info-rgb, 13,202,240), 0.04)' : undefined,
        transition: 'background-color 0.3s, border-color 0.3s',
      }}
    >
      {/* Header row: icon + name + status badge */}
      <div className="d-flex align-items-center mb-1">
        <i
          className={`${si.icon} me-2 flex-shrink-0`}
          style={{ color: si.color, fontSize: '1.1rem', width: '1.2rem', textAlign: 'center' }}
        />
        <span className="fw-bold text-truncate flex-grow-1">{item.cloudName || item.localName}</span>
        <span
          className="badge ms-2 flex-shrink-0"
          style={{
            backgroundColor: si.color,
            color: '#fff',
            fontSize: '0.65rem',
            fontWeight: 600,
          }}
        >
          {STATUS_LABELS[item.status]}
        </span>
      </div>

      {/* Progress bar (only for active/done items) */}
      {item.status !== 'pending' && item.status !== 'skipped' && (
        <ProgressBar percent={progress} color={barColor} className="mb-1" />
      )}

      {/* Detail line: current operation + file counters */}
      {item.status !== 'pending' && item.status !== 'skipped' && (
        <div className="d-flex justify-content-between align-items-center">
          <div
            className="small text-truncate flex-grow-1 me-2"
            style={{
              color: item.status === 'error' ? 'var(--bs-danger)' : 'var(--bs-secondary)',
              fontFamily: item.currentFile ? 'monospace' : 'inherit',
              fontSize: item.currentFile ? '0.7rem' : '0.75rem',
            }}
          >
            {item.currentFile ? item.currentFile : (item.progress || STATUS_LABELS[item.status])}
          </div>
          {/* File counters */}
          {item.totalFiles != null && item.totalFiles > 0 && (
            <div className="small text-muted flex-shrink-0" style={{ fontSize: '0.7rem' }}>
              {item.status === 'copying' && item.copiedFiles != null && (
                <span>{item.copiedFiles}/{item.totalFiles} copied</span>
              )}
              {item.status === 'uploading' && item.uploadedFiles != null && (
                <span>
                  {item.uploadedFiles}/{item.totalFiles} uploaded
                  {item.uploadedBytes != null && item.totalBytes ? (
                    <span className="ms-1">({formatSize(item.uploadedBytes)}/{formatSize(item.totalBytes)})</span>
                  ) : null}
                </span>
              )}
              {item.status === 'done' && (
                <span>{item.totalFiles} files · {item.totalBytes ? formatSize(item.totalBytes) : ''}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error detail */}
      {item.status === 'error' && item.error && (
        <div className="small text-danger text-break mt-1" style={{ fontSize: '0.7rem' }}>
          <i className="fas fa-exclamation-triangle me-1" />
          {item.error}
        </div>
      )}
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────

export const CloudMigrationDialog: React.FC<CloudMigrationDialogProps> = ({
  visible,
  onHide,
  onMigrationComplete,
  plugin,
}) => {
  const [phase, setPhase] = useState<DialogPhase>('loading')
  const [localWorkspaces, setLocalWorkspaces] = useState<LocalWorkspaceInfo[]>([])
  const [items, setItems] = useState<MigrationItem[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [cloudNames, setCloudNames] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // ── Auto-scroll to active item during migration ──
  useEffect(() => {
    if (phase !== 'migrating') return
    const active = items.find(i => !['pending', 'done', 'error', 'skipped'].includes(i.status))
    if (!active || !scrollRef.current) return
    const el = scrollRef.current.querySelector(`[data-ws="${active.localName}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [items, phase])

  // ── Load local workspaces when dialog becomes visible ──

  useEffect(() => {
    if (!visible) return
    let cancelled = false

    setPhase('loading')
    setError(null)

    ;(async () => {
      try {
        const locals = await discoverLocalWorkspaces()
        if (cancelled) return

        if (locals.length === 0) {
          setLocalWorkspaces([])
          setItems([])
          setSelected(new Set())
          setPhase('select')
          return
        }

        setLocalWorkspaces(locals)
        const migrationItems = await buildMigrationItems(locals)
        if (cancelled) return

        setItems(migrationItems)
        setSelected(new Set(migrationItems.map(i => i.localName)))
        const names: Record<string, string> = {}
        for (const it of migrationItems) {
          names[it.localName] = it.cloudName
        }
        setCloudNames(names)
        setPhase('select')
      } catch (err) {
        if (!cancelled) {
          setError(err.message || String(err))
          setPhase('select')
        }
      }
    })()

    return () => { cancelled = true }
  }, [visible])

  // ── Selection handlers ──

  const toggleSelect = useCallback((localName: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(localName) ? next.delete(localName) : next.add(localName)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    setSelected(prev =>
      prev.size === items.length ? new Set() : new Set(items.map(i => i.localName))
    )
  }, [items])

  const updateCloudName = useCallback((localName: string, newCloudName: string) => {
    setCloudNames(prev => ({ ...prev, [localName]: newCloudName }))
  }, [])

  // ── Migration ──

  const selectedCount = useMemo(() =>
    items.filter(i => selected.has(i.localName)).length
  , [items, selected])

  const startMigration = useCallback(async () => {
    const preparedItems = items.map(item => ({
      ...item,
      cloudName: cloudNames[item.localName] || item.cloudName,
      status: (selected.has(item.localName) ? 'pending' : 'skipped') as MigrationStatus,
      // Pre-populate totalFiles from discovery for progress display
      totalFiles: localWorkspaces.find(l => l.name === item.localName)?.fileCount || 0,
      totalBytes: localWorkspaces.find(l => l.name === item.localName)?.totalSize || 0,
    }))

    setItems(preparedItems)
    setPhase('migrating')

    try {
      const results = await migrateWorkspaces(preparedItems, (updatedItems) => {
        setItems([...updatedItems])
      })

      setPhase('done')

      // Refresh cloud workspace list in the store → triggers dropdown re-render
      if (results.length > 0) {
        try {
          const freshWorkspaces = await refreshCloudWorkspaces()
          cloudStore.setCloudWorkspaces(freshWorkspaces)
        } catch (e) {
          console.warn('[MigrationDialog] Failed to refresh workspace list:', e)
        }
        onMigrationComplete?.()
      }
    } catch (err) {
      console.error('[MigrationDialog] Migration failed:', err)
      setPhase('done')
    }
  }, [items, selected, cloudNames, localWorkspaces, onMigrationComplete])

  // ── Result summary ──

  const summary = useMemo(() => {
    const done = items.filter(i => i.status === 'done').length
    const failed = items.filter(i => i.status === 'error').length
    const skipped = items.filter(i => i.status === 'skipped').length
    const total = items.filter(i => i.status !== 'skipped').length
    return { done, failed, skipped, total }
  }, [items])

  // ── Overall progress (across all workspaces) ──

  const overallProgress = useMemo(() => {
    const active = items.filter(i => i.status !== 'skipped')
    if (active.length === 0) return 0
    const total = active.reduce((sum, i) => sum + getItemProgress(i), 0)
    return Math.round(total / active.length)
  }, [items])

  // ── Elapsed time ──
  const startTimeRef = useRef<number | null>(null)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (phase === 'migrating' && !startTimeRef.current) {
      startTimeRef.current = Date.now()
    }
    if (phase !== 'migrating') return
    const timer = setInterval(() => {
      if (startTimeRef.current) setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [phase])

  const formatElapsed = (s: number) => {
    const min = Math.floor(s / 60)
    const sec = s % 60
    return min > 0 ? `${min}m ${sec}s` : `${sec}s`
  }

  // ── Prevent closing during migration ──

  const handleHide = useCallback(() => {
    if (phase === 'migrating') return
    // If the user is dismissing from the selection phase (i.e. "Skip"),
    // persist the dismissal so we don't re-ask every time cloud mode activates.
    if (phase === 'select' || phase === 'loading') {
      dismissMigration()
    }
    startTimeRef.current = null
    setElapsed(0)
    onHide()
  }, [phase, onHide])

  // ── Render ──

  const renderBody = () => {
    // Loading phase
    if (phase === 'loading') {
      return (
        <div className="d-flex align-items-center justify-content-center py-4">
          <i className="fas fa-spinner fa-spin fa-lg me-2" style={{ color: 'var(--bs-info)' }} />
          <span>Discovering local workspaces…</span>
        </div>
      )
    }

    // Error during discovery
    if (error && phase === 'select') {
      return (
        <div className="alert alert-danger mb-0">
          <i className="fas fa-exclamation-triangle me-2" />
          Failed to discover workspaces: {error}
        </div>
      )
    }

    // Nothing to migrate
    if (phase === 'select' && items.length === 0) {
      return (
        <div className="d-flex flex-column align-items-center py-4">
          <i className="fas fa-circle-check mb-2" style={{ fontSize: '2.5rem', color: 'var(--bs-success)' }} />
          <span className="mt-1">All local workspaces have been migrated to the cloud.</span>
        </div>
      )
    }

    // ── Selection phase ──
    if (phase === 'select') {
      return (
        <div className="d-flex flex-column" style={{ maxHeight: '60vh', overflow: 'auto' }}>
          <div className="mb-2 d-flex align-items-center">
            <input
              type="checkbox"
              id="migration-select-all"
              data-id="migration-select-all"
              checked={selected.size === items.length}
              onChange={toggleSelectAll}
              className="form-check-input me-2 mt-0"
            />
            <label htmlFor="migration-select-all" className="form-check-label small text-muted">
              Select all ({items.length} workspace{items.length !== 1 ? 's' : ''})
            </label>
          </div>

          {items.map((item) => {
            const localWs = localWorkspaces.find(l => l.name === item.localName)
            const isSelected = selected.has(item.localName)

            return (
              <div
                key={item.localName}
                data-id={`migration-ws-${item.localName}`}
                className={`d-flex align-items-start p-2 mb-1 rounded ${
                  isSelected ? 'border border-primary' : 'border'
                }`}
                style={{ cursor: 'pointer' }}
                onClick={() => toggleSelect(item.localName)}
              >
                <input
                  type="checkbox"
                  data-id={`migration-ws-checkbox-${item.localName}`}
                  checked={isSelected}
                  onChange={() => toggleSelect(item.localName)}
                  className="form-check-input me-2 mt-1 flex-shrink-0"
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex-grow-1 min-w-0">
                  <div className="d-flex align-items-center">
                    <span className="fw-bold text-truncate">{item.localName}</span>
                    {item.nameConflict && (
                      <span className="badge bg-warning ms-2 flex-shrink-0">name conflict</span>
                    )}
                  </div>
                  {localWs && (
                    <div className="small text-muted">
                      {localWs.fileCount} file{localWs.fileCount !== 1 ? 's' : ''} · {formatSize(localWs.totalSize)}
                    </div>
                  )}
                  {item.nameConflict && isSelected && (
                    <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                      <label className="small text-muted">Cloud workspace name:</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={cloudNames[item.localName] || ''}
                        onChange={(e) => updateCloudName(item.localName, e.target.value)}
                      />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )
    }

    // ── Migrating / Done phase ──
    return (
      <div className="d-flex flex-column" data-id={`migration-phase-${phase}`}>
        {/* Overall progress header */}
        <div className="mb-3 p-3 rounded border" style={{ backgroundColor: 'rgba(var(--bs-info-rgb, 13,202,240), 0.06)' }}>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <div className="d-flex align-items-center">
              {phase === 'migrating' ? (
                <i className="fas fa-cloud-arrow-up fa-beat-fade me-2" style={{ color: 'var(--bs-primary)', fontSize: '1.2rem' }} />
              ) : (
                <i className={`fas ${summary.failed > 0 ? 'fa-exclamation-triangle' : 'fa-circle-check'} me-2`}
                  style={{ color: summary.failed > 0 ? 'var(--bs-warning)' : 'var(--bs-success)', fontSize: '1.2rem' }} />
              )}
              <span className="fw-bold">
                {phase === 'migrating' ? 'Migrating workspaces…' : 'Migration complete'}
              </span>
            </div>
            <div className="small text-muted">
              {phase === 'migrating' && <span>{formatElapsed(elapsed)}</span>}
              {phase === 'done' && <span>{formatElapsed(elapsed)} total</span>}
            </div>
          </div>

          {/* Overall progress bar */}
          <ProgressBar
            percent={overallProgress}
            color={phase === 'done'
              ? (summary.failed > 0 ? 'var(--bs-warning)' : 'var(--bs-success)')
              : 'var(--bs-primary)'}
            height={6}
            className="mb-2"
          />

          <div className="d-flex justify-content-between small text-muted">
            <span>{overallProgress}% complete</span>
            <span>
              {summary.done}/{summary.total} workspaces
              {summary.failed > 0 && <span className="text-danger ms-2">({summary.failed} failed)</span>}
            </span>
          </div>
        </div>

        {/* Per-workspace cards */}
        <div ref={scrollRef} style={{ maxHeight: '45vh', overflowY: 'auto', overflowX: 'hidden' }}>
          {items.filter(i => i.status !== 'skipped').map((item) => (
            <div key={item.localName} data-ws={item.localName}>
              <MigrationCard item={item} localWs={localWorkspaces.find(l => l.name === item.localName)} />
            </div>
          ))}
        </div>

        {/* Done summary */}
        {phase === 'done' && (
          <div className="mt-2 p-2 rounded border d-flex align-items-center">
            <i className={`fas ${summary.failed > 0 ? 'fa-exclamation-triangle' : 'fa-circle-check'} me-2`}
              style={{ color: summary.failed > 0 ? 'var(--bs-warning)' : 'var(--bs-success)' }} />
            <span className="small">
              <strong>{summary.done}</strong> migrated successfully
              {summary.failed > 0 && <>, <strong className="text-danger">{summary.failed}</strong> failed</>}
              {summary.skipped > 0 && <>, <strong>{summary.skipped}</strong> skipped</>}
              {summary.done > 0 && <span className="text-muted"> — your cloud workspaces are ready to use.</span>}
            </span>
          </div>
        )}
      </div>
    )
  }

  // ── Modal button configuration ──

  const getOkLabel = (): string | JSX.Element => {
    switch (phase) {
    case 'loading':
      return 'Loading…'
    case 'select':
      return selectedCount > 0
        ? `Migrate ${selectedCount} workspace${selectedCount !== 1 ? 's' : ''}`
        : 'Migrate'
    case 'migrating':
      return (
        <span>
          <i className="fas fa-spinner fa-spin me-1" />
          Migrating… {overallProgress}%
        </span>
      ) as any
    case 'done':
      return 'Done'
    }
  }

  const getOkFn = () => {
    if (phase === 'select' && selectedCount > 0) return startMigration
    if (phase === 'done') return handleHide
    return undefined
  }

  return (
    <ModalDialog
      id="cloud-migration-dialog"
      title={
        <span>
          <i className="fas fa-cloud-arrow-up me-2" />
          Migrate Workspaces to Cloud
        </span>
      }
      message={renderBody()}
      hide={!visible}
      handleHide={handleHide}
      okLabel={getOkLabel()}
      okFn={getOkFn()}
      okBtnClass={phase === 'done' ? 'btn-success' : (phase === 'migrating' ? 'btn-secondary disabled' : 'btn-primary')}
      cancelLabel={phase === 'migrating' ? undefined : (phase === 'done' ? undefined : 'Skip')}
      cancelFn={phase === 'migrating' ? undefined : handleHide}
      showCancelIcon={phase !== 'migrating'}
      modalParentClass="modal-dialog-centered"
      donotHideOnOkClick={phase === 'select' || phase === 'migrating'}
      preventBlur={phase === 'migrating'}
    />
  )
}

export default CloudMigrationDialog
