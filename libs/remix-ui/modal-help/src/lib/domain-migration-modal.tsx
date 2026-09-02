import React, { useMemo } from 'react'
import './domain-migration-modal.css'

export type MigrationDismissKind = 'remind' | 'never'

interface DomainMigrationModalProps {
  open: boolean
  /** Host users are moving to, e.g. 'app.remix.live'. */
  toDomain: string
  /** Host being retired. Defaults to the current origin. */
  fromDomain?: string
  /** ISO date the old origin stops being updated. Drives the countdown chip. */
  deadline?: string | null
  /** Opens the export/import panel. */
  onStartMigration: () => void
  onDismiss: (kind: MigrationDismissKind) => void
  onClose: () => void
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((t - Date.now()) / (1000 * 60 * 60 * 24)))
}

/**
 * Announces that the current origin is being retired and walks the user
 * through moving their workspaces.
 *
 * Deliberately reassuring rather than alarmist: files are never deleted by
 * this flow, and the copy says so, because the failure mode we care about is
 * a user who panics and does something destructive.
 */
const DomainMigrationModal: React.FC<DomainMigrationModalProps> = ({
  open,
  toDomain,
  fromDomain,
  deadline,
  onStartMigration,
  onDismiss,
  onClose
}) => {
  const days = useMemo(() => daysUntil(deadline), [deadline])
  const from = fromDomain || window.location.host

  if (!open) return null

  return (
    <div className="dmm" data-id="domainMigrationModal" onClick={(e) => e.stopPropagation()}>
      {/* ── Hero ── */}
      <div className="dmm__hero">
        <div className="dmm__wash" />
        <div className="dmm__grid" />

        <div className="dmm__hero-content">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <div className="d-flex align-items-center gap-2">
              <div className="dmm__icon">
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 8h9M8 5l3 3-3 3M13 2v12" />
                </svg>
              </div>
              <div>
                <div className="dmm__brand">Remix is moving</div>
                <div className="dmm__eyebrow">New home</div>
              </div>
            </div>
            <div className="dmm__close" onClick={onClose} aria-label="Close" role="button">
              &times;
            </div>
          </div>

          <div className="dmm__title mb-2">Bring your Workspaces to {toDomain}</div>

          <div className="d-flex align-items-center gap-2 flex-wrap">
            <span className="dmm__chip dmm__chip--old">{from}</span>
            <i className="fas fa-arrow-right dmm__arrow" />
            <DomainLink toDomain={toDomain} className="dmm__chip dmm__chip--new">
              {toDomain}
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3H3v10h10v-3M9.5 2.5H13.5V6.5M13.5 2.5L7 9" />
              </svg>
            </DomainLink>
            {days !== null && (
              <span className={`dmm__chip${days <= 7 ? ' dmm__chip--urgent' : ''}`}>
                {days === 0 ? 'updates ending' : `${days}d of updates left`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Why ── */}
      <div className="dmm__why">
        Your Workspaces are stored by your browser and tied to <span className="dmm__strong">{from}</span>. Browsers keep
        that storage separate per domain, so your Workspaces will not appear on the new address by themselves — you need
        to move them once.
      </div>

      {/* ── Steps ── */}
      <div className="dmm__section">
        <div className="dmm__label">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 1v10M1 6h10" />
          </svg>
          Three steps, a few minutes
        </div>
        <div className="dmm__steps">
          <Step
            n={1}
            title="Export an archive here"
            body="Every Workspace and your settings are packed into one file, with a checksum for each file."
          />
          <Step
            n={2}
            accent="info"
            title={`Open ${toDomain}`}
            body="Same Remix, new address. Sign in as usual if you have an account."
            titleExtra={<DomainLink toDomain={toDomain} className="dmm__link">open now</DomainLink>}
          />
          <Step
            n={3}
            accent="success"
            title="Import the archive there"
            body="Checksums are verified as files are restored, so nothing arrives silently damaged."
          />
        </div>
      </div>

      {/* ── Reassurance ── */}
      <div className="dmm__section">
        <div className="dmm__reassure">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 1.5l5.5 2.2v4c0 3.2-2.3 5.6-5.5 6.8-3.2-1.2-5.5-3.6-5.5-6.8v-4L8 1.5z" />
            <path d="M5.6 8l1.7 1.7L10.6 6.4" />
          </svg>
          <div>
            Nothing is deleted here. The archive is a <span className="dmm__strong">copy</span>, and your Workspaces stay
            on this domain until you remove them yourself.
          </div>
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="dmm__section">
        <button className="btn btn-primary w-100 mb-2" onClick={onStartMigration} data-id="domainMigrationModalStart">
          <i className="fas fa-download me-2" />
          Move my Workspaces
        </button>
        <div className="d-flex gap-2">
          <button className="btn btn-secondary btn-sm flex-fill" onClick={() => onDismiss('remind')}>
            <i className="far fa-clock me-1" /> Remind me later
          </button>
          <button className="btn btn-secondary btn-sm flex-fill" onClick={() => onDismiss('never')}>
            <i className="far fa-eye-slash me-1" /> Don&apos;t show again
          </button>
        </div>
        <div className="dmm__aside">
          Already moved, or nothing to bring?{' '}
          <DomainLink toDomain={toDomain} className="dmm__link">Go to {toDomain}</DomainLink>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="dmm__footer">
        You can start this any time from the Workspace menu → <span className="dmm__strong">Move your Workspaces</span>
      </div>
    </div>
  )
}

/** The destination as a link, for users who have already moved or have nothing to bring. */
const DomainLink: React.FC<{ toDomain: string; className?: string; children?: React.ReactNode }> = ({
  toDomain,
  className,
  children
}) => (
  <a
    href={`https://${toDomain}`}
    onClick={(e) => e.stopPropagation()}
    data-id="domainMigrationModalToDomainLink"
    title={`Open ${toDomain}`}
    className={className}
  >
    {children ?? toDomain}
  </a>
)

const Step: React.FC<{
  n: number
  title: string
  body: string
  accent?: 'info' | 'success'
  titleExtra?: React.ReactNode
}> = ({ n, title, body, accent, titleExtra }) => (
  <div className="dmm__step">
    <div className={`dmm__step-num${accent ? ` dmm__step-num--${accent}` : ''}`}>{n}</div>
    <div className="dmm__step-content">
      <div className="dmm__step-title">
        {title}
        {titleExtra}
      </div>
      <div className="dmm__step-body">{body}</div>
    </div>
  </div>
)

export default DomainMigrationModal
export type { DomainMigrationModalProps }
