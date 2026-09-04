import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { estimateStorage, formatBytes, getFs, MigrationPreview, previewFileSystem, StorageEstimate } from '../archive'
import { ExportResult, exportArchive, pickSaveTarget } from '../exporter'
import { clearResumeState, importArchive, OpenedArchive, openArchive, readResumeState } from '../importer'
import { setPendingConfirmation } from '../domain-config'
import { ImportResult, MigrationProgress } from '../types'
import './domain-migration.css'

export interface DomainMigrationProps {
  plugin?: any
  /** Host users are being moved to, e.g. 'app.remix.live'. */
  targetOrigin?: string
  /** Hosts the move is coming from, used to vet an archive's stated origin. */
  fromDomains?: string[]
  /** ISO date the old origin stops being updated. */
  deadline?: string | null
  /** 'import' when arriving on the new domain via the handoff link. */
  initialMode?: 'export' | 'import'
}

type Stage = 'export' | 'handoff' | 'import'
type Accent = '' | 'info' | 'success'

const STEPS: { id: Stage; label: string; hint: string }[] = [
  { id: 'export', label: 'Export', hint: 'Pack your workspaces' },
  { id: 'handoff', label: 'Move over', hint: 'Open the new site' },
  { id: 'import', label: 'Import', hint: 'Restore them there' }
]

const phaseLabels: Record<string, string> = {
  scanning: 'Reading and checksumming your files',
  packing: 'Compressing the archive',
  writing: 'Saving to disk',
  reading: 'Opening the archive',
  importing: 'Restoring your files',
  done: 'Finished'
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((t - Date.now()) / 86400000))
}

export const DomainMigration: React.FC<DomainMigrationProps> = ({ targetOrigin, fromDomains, deadline, initialMode }) => {
  const [stage, setStage] = useState<Stage>(initialMode === 'import' ? 'import' : 'export')
  const [storage, setStorage] = useState<StorageEstimate | null>(null)
  const [preview, setPreview] = useState<MigrationPreview | null>(null)
  const [progress, setProgress] = useState<MigrationProgress | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exportResult, setExportResult] = useState<ExportResult | null>(null)
  const [archive, setArchive] = useState<OpenedArchive | null>(null)
  const [canResume, setCanResume] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [copied, setCopied] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const destination = targetOrigin || 'the new site'
  const handoffUrl = targetOrigin ? `https://${targetOrigin}/#migrate=import` : null
  const days = useMemo(() => daysUntil(deadline), [deadline])

  // Link back to the origin the archive came from, so it can record the move
  // and redirect on later visits. Carries no destination: that origin resolves
  // it from config, so a crafted link can't point Remix somewhere else.
  //
  // The manifest is a user-supplied file, so its stated origin is only trusted
  // when it is one of the configured migration origins — otherwise a crafted
  // archive could get Remix to present an attacker's domain as the next step.
  const sourceHost = useMemo(() => {
    if (!archive?.manifest?.sourceOrigin) return null
    try {
      const url = new URL(archive.manifest.sourceOrigin)
      const host = url.host.toLowerCase()
      if (!host || host === window.location.host.toLowerCase()) return null
      if (!url.protocol.startsWith('http')) return null
      return (fromDomains || []).includes(host) ? host : null
    } catch {
      return null
    }
  }, [archive, fromDomains])
  const confirmUrl = sourceHost ? `${archive!.manifest.sourceOrigin.replace(/\/$/, '')}/#migrated` : null

  useEffect(() => {
    estimateStorage().then(setStorage)
  }, [])

  useEffect(() => {
    if (stage !== 'export' || preview) return
    previewFileSystem(getFs()).then(setPreview).catch(() => setPreview(null))
  }, [stage, preview])

  const onExport = useCallback(async () => {
    setError(null)
    setExportResult(null)
    // Picker first: awaiting anything before it would spend the user gesture.
    const target = await pickSaveTarget()
    setBusy(true)
    try {
      const result = await exportArchive(target, setProgress)
      setExportResult(result)
      setProgress(null)
      setStage('handoff')
    } catch (e: any) {
      setError(e?.message || String(e))
      setProgress(null)
    } finally {
      setBusy(false)
    }
  }, [])

  const onPickArchive = useCallback(async (file: File) => {
    setError(null)
    setImportResult(null)
    setArchive(null)
    setBusy(true)
    try {
      const opened = await openArchive(file)
      setArchive(opened)
      setCanResume(!!readResumeState(opened.archiveId))
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }, [])

  const onImport = useCallback(
    async (resume: boolean) => {
      if (!archive) return
      setError(null)
      setImportResult(null)
      setBusy(true)
      try {
        setImportResult(await importArchive(archive, { resume }, setProgress))
        setCanResume(false)
        // Survives the reload below, so the confirmation step stays reachable.
        if (sourceHost) setPendingConfirmation(archive.manifest.sourceOrigin)
      } catch (e: any) {
        setError(e?.message || String(e))
        setCanResume(!!readResumeState(archive.archiveId))
      } finally {
        setBusy(false)
        setProgress(null)
      }
    },
    [archive, sourceHost]
  )

  const copyHandoff = () => {
    if (!handoffUrl) return
    navigator.clipboard?.writeText(handoffUrl).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      },
      () => setError('Could not copy the link. Select and copy it manually.')
    )
  }

  return (
    <div className="dm-root" data-id="domainMigration">
      <div className="dm-inner">
        <Hero destination={destination} targetOrigin={targetOrigin} days={days} />
        <WhyPanel destination={destination} />
        <Stepper current={stage} />

        {stage === 'export' && (
          <section className="dm-card" data-id="domainMigrationExport">
            <CardTitle step={1}>Pack your workspaces into one file</CardTitle>

            {preview ? (
              <>
                <div className="d-flex flex-wrap gap-2 mb-3">
                  <Stat label="Workspaces" value={String(preview.workspaces.length)} />
                  <Stat label="Files" value={String(preview.fileCount)} accent="info" />
                  <Stat label="Size" value={formatBytes(preview.totalBytes)} accent="success" />
                </div>
                {preview.workspaces.length > 0 && (
                  <div className="dm-hint mb-2">
                    Including: {preview.workspaces.map((w) => <span className="dm-tag" key={w}>{w}</span>)}
                  </div>
                )}
                {preview.cloudWorkspaces.length > 0 && (
                  <Note variant="info" icon="fas fa-cloud">
                    {preview.cloudWorkspaces.length} cloud workspace{preview.cloudWorkspaces.length > 1 ? 's' : ''}{' '}
                    {preview.cloudWorkspaces.length > 1 ? 'are' : 'is'} <span className="dm-strong">not</span> in the
                    archive — they already live in the cloud and come back when you sign in on {destination}.
                  </Note>
                )}
              </>
            ) : (
              <div className="dm-body text-body-secondary mb-3">Looking at your workspaces…</div>
            )}

            <button className="btn btn-primary mt-3" onClick={onExport} disabled={busy} data-id="domainMigrationExportBtn">
              <i className="fas fa-box-archive me-2" />
              {busy ? 'Exporting…' : 'Export my workspaces'}
            </button>
            <div className="dm-hint mt-2">
              Your browser will ask where to save the file. Your Remix preferences — theme, layout, networks, recent
              workspaces — travel with it. Sign-in details stay behind, so you&apos;ll log in again on {destination}.
            </div>
          </section>
        )}

        {stage === 'handoff' && (
          <section className="dm-card dm-card--info" data-id="domainMigrationHandoff">
            <CardTitle step={2}>Take the file to {destination}</CardTitle>

            {exportResult && (
              <Note variant="success" icon="fas fa-circle-check" dataId="domainMigrationExportDone">
                Saved <code className="dm-mono dm-strong">{exportResult.fileName}</code> —{' '}
                {exportResult.manifest.totalFiles} files ({formatBytes(exportResult.manifest.totalBytes)}) and{' '}
                {exportResult.manifest.settingsCount ?? 0} settings. Check your downloads folder if you can&apos;t see it.
              </Note>
            )}

            <p className="dm-body my-3">
              The button below takes you to <span className="dm-mono dm-strong">{destination}</span> and jumps straight
              to the import step. You&apos;ll be asked for the file you just saved.
            </p>

            {handoffUrl ? (
              <>
                <div className="d-flex flex-wrap gap-2">
                  <a className="btn btn-primary" href={handoffUrl} data-id="domainMigrationHandoffLink">
                    <i className="fas fa-arrow-up-right-from-square me-2" />
                    Open {targetOrigin} and import
                  </a>
                  <button className="btn btn-secondary" onClick={copyHandoff} data-id="domainMigrationCopyLink">
                    <i className={`fas ${copied ? 'fa-check' : 'fa-copy'} me-2`} />
                    {copied ? 'Copied' : 'Copy link'}
                  </button>
                </div>
                <Note variant="warning" icon="fas fa-lightbulb">
                  Your archive is saved on disk, so it&apos;s safe to leave this page. You can come back any time to
                  export again.
                </Note>
              </>
            ) : (
              <Note variant="warning" icon="fas fa-triangle-exclamation">
                The new address hasn&apos;t been configured yet. Keep the exported file safe and import it once the new
                site is announced.
              </Note>
            )}

            <button
              className="btn btn-link btn-sm ps-0 mt-3"
              onClick={() => setStage('export')}
              data-id="domainMigrationBackToExport"
            >
              <i className="fas fa-arrow-left me-1" /> Export again
            </button>
          </section>
        )}

        {stage === 'import' && (
          <section className="dm-card dm-card--success" data-id="domainMigrationImport">
            <CardTitle step={3}>Restore your workspaces here</CardTitle>

            {!archive && !importResult && (
              <div
                className={`dm-drop${dragging ? ' is-dragging' : ''}`}
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  const file = e.dataTransfer.files?.[0]
                  if (file) onPickArchive(file)
                }}
                data-id="domainMigrationDropzone"
              >
                <div className="dm-drop__icon">
                  <i className="fas fa-file-arrow-down" />
                </div>
                <div className="dm-drop__title">Drop your migration archive here</div>
                <div className="dm-hint">
                  or click to browse for the <code className="dm-mono">.zip</code> you exported
                </div>
              </div>
            )}

            <input
              ref={fileInput}
              type="file"
              accept=".zip,application/zip"
              className="d-none"
              disabled={busy}
              data-id="domainMigrationFileInput"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) onPickArchive(file)
              }}
            />

            {archive && !importResult && (
              <div data-id="domainMigrationSummary">
                <div className="d-flex flex-wrap gap-2 mb-3">
                  <Stat label="Files" value={String(archive.manifest.totalFiles)} />
                  <Stat label="Size" value={formatBytes(archive.manifest.totalBytes)} accent="info" />
                  <Stat label="Workspaces" value={String(archive.manifest.workspaces.length)} accent="success" />
                </div>
                <div className="dm-hint mb-2">
                  From <span className="dm-mono dm-strong">{archive.manifest.sourceOrigin}</span>, exported{' '}
                  {new Date(archive.manifest.createdAt).toLocaleString()} ·{' '}
                  {archive.manifest.settingsCount ?? Object.keys(archive.manifest.config || {}).length} settings
                </div>

                {canResume && (
                  <Note variant="warning" icon="fas fa-rotate-left" dataId="domainMigrationResume">
                    A previous import of this archive was interrupted. You can carry on where it stopped.
                  </Note>
                )}

                <div className="d-flex flex-wrap gap-2 align-items-center mt-3">
                  {canResume && (
                    <button className="btn btn-primary" onClick={() => onImport(true)} disabled={busy} data-id="domainMigrationResumeBtn">
                      <i className="fas fa-rotate-left me-2" /> Resume import
                    </button>
                  )}
                  <button
                    className={`btn ${canResume ? 'btn-secondary' : 'btn-primary'}`}
                    onClick={() => {
                      clearResumeState(archive.archiveId)
                      setCanResume(false)
                      onImport(false)
                    }}
                    disabled={busy}
                    data-id="domainMigrationImportBtn"
                  >
                    {canResume ? 'Start over' : (
                      <>
                        <i className="fas fa-download me-2" />
                        {busy ? 'Importing…' : 'Import everything'}
                      </>
                    )}
                  </button>
                  <button className="btn btn-link btn-sm" onClick={() => setArchive(null)} disabled={busy}>
                    Choose another file
                  </button>
                </div>
              </div>
            )}

            {importResult && (
              <div data-id="domainMigrationImportDone">
                <Note variant="success" icon="fas fa-circle-check">
                  Restored <span className="dm-strong">{importResult.imported}</span> files
                  {importResult.skipped > 0 && <> ({importResult.skipped} already done)</>} and applied{' '}
                  {importResult.configApplied} settings
                  {importResult.configSkipped > 0 && <> ({importResult.configSkipped} kept as they already are here)</>}.
                </Note>

                {Object.keys(importResult.renamedWorkspaces).length > 0 && (
                  <Note variant="warning" icon="fas fa-tag">
                    Renamed to avoid overwriting workspaces already here:{' '}
                    {Object.entries(importResult.renamedWorkspaces)
                      .map(([from, to]) => `${from} → ${to}`)
                      .join(', ')}
                  </Note>
                )}

                {importResult.issues.length > 0 && (
                  <Note variant="danger" icon="fas fa-triangle-exclamation" dataId="domainMigrationIssues">
                    <span className="dm-strong">{importResult.issues.length} files could not be restored.</span>
                    <ul className="dm-issues">
                      {importResult.issues.slice(0, 8).map((issue) => (
                        <li key={issue.path}>{issue.path} — {issue.reason}</li>
                      ))}
                    </ul>
                    {importResult.issues.length > 8 && <div className="mt-1">…and {importResult.issues.length - 8} more.</div>}
                  </Note>
                )}

                {confirmUrl ? (
                  <>
                    <p className="dm-body mt-3 mb-2">
                      <span className="dm-strong">One last step.</span> Click on the button below to set up a redirect on remix.ethereum.org so that you don’t accidentally work in two different instances of the tool. The redirect will bring you right back here.
                    </p>
                    <div className="d-flex flex-wrap gap-2 align-items-center">
                      <a className="btn btn-primary" href={confirmUrl} data-id="domainMigrationConfirmLink">
                        <i className="fas fa-circle-check me-2" />
                        Setup the redirect on {sourceHost}
                      </a>
                      <button className="btn btn-secondary" onClick={() => window.location.reload()} data-id="domainMigrationReload">
                        <i className="fas fa-rotate-right me-2" /> Reload to see my workspaces
                      </button>
                    </div>
                  </>
                ) : (
                  <button className="btn btn-primary mt-3" onClick={() => window.location.reload()} data-id="domainMigrationReload">
                    <i className="fas fa-rotate-right me-2" /> Reload Remix to see your workspaces
                  </button>
                )}
              </div>
            )}

            {!importResult && (
              <button
                className="btn btn-link btn-sm ps-0 mt-3"
                onClick={() => setStage('export')}
                data-id="domainMigrationBackFromImport"
              >
                <i className="fas fa-arrow-left me-1" /> I need to export from the old site first
              </button>
            )}
          </section>
        )}

        {progress && progress.phase !== 'done' && <Progress progress={progress} />}

        {error && (
          <Note variant="danger" icon="fas fa-circle-exclamation" dataId="domainMigrationError">
            {error}
          </Note>
        )}

        {storage?.known && (
          <div className="dm-footnote" data-id="domainMigrationStorage">
            browser storage · {formatBytes(storage.usage)} used of {formatBytes(storage.quota)} ·{' '}
            {formatBytes(storage.available)} free
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Hero ─── */

const Hero: React.FC<{ destination: string; targetOrigin?: string; days: number | null }> = ({
  destination,
  targetOrigin,
  days
}) => (
  <div className="dm-hero">
    <div className="dm-hero__wash" />
    <div className="dm-hero__grid" />

    <div className="dm-hero__content">
      <div className="d-flex align-items-center gap-2 mb-3">
        <div className="dm-hero__icon">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 8h9M8 5l3 3-3 3M13 2v12" />
          </svg>
        </div>
        <div>
          <div className="fw-semibold">Remix is moving</div>
          <div className="dm-hero__eyebrow">New home</div>
        </div>
      </div>

      <div className="dm-hero__title mb-2">
        Move your data to <span className="dm-hero__dest">{destination}</span>
      </div>

      <div className="d-flex align-items-center gap-2 flex-wrap">
        <span className="dm-chip dm-chip--old">{window.location.host}</span>
        <i className="fas fa-arrow-right text-body-secondary dm-arrow" />
        <span className="dm-chip dm-chip--new">{targetOrigin || 'coming soon'}</span>
        {days !== null && (
          <span className={`dm-chip${days <= 7 ? ' dm-chip--urgent' : ''}`}>
            {days === 0 ? 'updates ending' : `${days}d of updates left`}
          </span>
        )}
      </div>
    </div>
  </div>
)

const WhyPanel: React.FC<{ destination: string }> = ({ destination }) => (
  <div className="dm-why">
    Your workspaces are saved by <span className="dm-strong">your browser</span>, not by Remix&apos;s servers — and
    browsers keep that storage locked to one address. Nothing on{' '}
    <span className="dm-mono dm-strong">{window.location.host}</span> can reach {destination} on its own, so you need to
    carry it across once. It takes a couple of minutes, and nothing is deleted here — what you export is a copy.
  </div>
)

/* ─── Stepper ─── */

const Stepper: React.FC<{ current: Stage }> = ({ current }) => {
  const currentIndex = STEPS.findIndex((s) => s.id === current)
  return (
    <div className="dm-steps" data-id="domainMigrationStepper">
      {STEPS.map((step, i) => {
        const state = i < currentIndex ? 'is-done' : i === currentIndex ? 'is-active' : ''
        return (
          <React.Fragment key={step.id}>
            <div className={`dm-step ${state}`}>
              <div className="dm-step__badge">
                {i < currentIndex ? <i className="fas fa-check" /> : i + 1}
              </div>
              <div className="text-center">
                <div className="dm-step__label">{step.label}</div>
                <div className="dm-step__hint">{step.hint}</div>
              </div>
            </div>
            {i < STEPS.length - 1 && <div className={`dm-step__line${i < currentIndex ? ' is-done' : ''}`} />}
          </React.Fragment>
        )
      })}
    </div>
  )
}

/* ─── Building blocks ─── */

const CardTitle: React.FC<{ step: number; children: React.ReactNode }> = ({ step, children }) => (
  <div className="d-flex align-items-center gap-2 mb-3">
    <span className="dm-card__step">Step {step}</span>
    <span className="dm-card__title">{children}</span>
  </div>
)

const Stat: React.FC<{ label: string; value: string; accent?: Accent }> = ({ label, value, accent }) => (
  <div className={`dm-stat${accent ? ` dm-stat--${accent}` : ''}`}>
    <div className="dm-stat__value">{value}</div>
    <div className="dm-stat__label">{label}</div>
  </div>
)

const Note: React.FC<{
  variant?: 'success' | 'warning' | 'danger' | 'info'
  icon: string
  dataId?: string
  children: React.ReactNode
}> = ({ variant, icon, dataId, children }) => (
  <div className={`dm-note${variant ? ` dm-note--${variant}` : ''}`} data-id={dataId}>
    <i className={`${icon} dm-note__icon`} />
    <div className="dm-note__body">{children}</div>
  </div>
)

const Progress: React.FC<{ progress: MigrationProgress }> = ({ progress }) => {
  const percent = progress.fraction === null ? null : Math.round(progress.fraction * 100)
  return (
    <div className="mt-3" data-id="domainMigrationProgress">
      <div className="d-flex justify-content-between dm-hint mb-1">
        <span>{phaseLabels[progress.phase] || progress.phase}</span>
        <span className="dm-mono">
          {progress.filesTotal > 0 ? `${progress.filesDone}/${progress.filesTotal}` : `${progress.filesDone}`} files
          {percent !== null && ` · ${percent}%`}
        </span>
      </div>
      <div className="dm-progress__track">
        <div
          className={`dm-progress__fill${percent === null ? ' is-indeterminate' : ''}`}
          role="progressbar"
          aria-valuenow={percent ?? undefined}
          aria-valuemin={0}
          aria-valuemax={100}
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>
      {progress.currentPath && <div className="dm-hint dm-mono text-truncate mt-1">{progress.currentPath}</div>}
    </div>
  )
}
