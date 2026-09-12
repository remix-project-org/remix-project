import React, { useContext, useEffect, useState } from 'react'
import { useIntl } from 'react-intl'
import {
  clearPendingConfirmation,
  isMigrationDoneReturn,
  normalizeDomain,
  parseMigrationConfig,
  readPendingConfirmation
} from '@remix-ui/domain-migration'
import { AppContext } from '../../context/context'

type Variant = 'warning' | 'migration'

interface Banner {
  id: string
  variant: Variant
  message: string
  action?: { label: string; href?: string; onClick?: () => void }
  /** Set when the dismissal should outlive the page load. */
  persistKey?: string
}

const dismissKey = (name: string) => `remix:origin-banner-dismissed:${name}`

function wasDismissed(key?: string): boolean {
  if (!key) return false
  try {
    return localStorage.getItem(key) === 'true'
  } catch {
    return false
  }
}

export const OriginWarning = () => {
  const [banner, setBanner] = useState<Banner | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const intl = useIntl()
  const { appConfig, appManager } = useContext(AppContext) || ({} as any)

  useEffect(() => {
    const host = normalizeDomain(window.location.host)
    const migration = parseMigrationConfig((key) => (appConfig as any)?.[key])

    if (isMigrationDoneReturn()) clearPendingConfirmation()

    // Someone who imported and then reloaded would otherwise lose the
    // confirmation link along with the wizard's state. The stored origin came
    // from a user-supplied archive, so it is only trusted while it matches a
    // configured migration origin.
    const pending = readPendingConfirmation()
    if (pending) {
      const pendingHost = normalizeDomain(pending)
      if (pendingHost && pendingHost !== host && migration.fromDomains.includes(pendingHost)) {
        setBanner({
          id: 'migration-confirm',
          variant: 'migration',
          message: intl.formatMessage({ id: 'remixApp.migrationBannerPending' }, { fromDomain: pendingHost }),
          action: {
            label: intl.formatMessage({ id: 'remixApp.migrationBannerPendingAction' }),
            href: `${pending}/#migrated`
          }
        })
        return
      }
    }

    // Migration banners win: they carry an action, the legacy origin warnings
    // are only informational.
    if (migration.enabled && migration.toDomain) {
      if (host === migration.toDomain) {
        const origin = migration.fromDomains.find((d) => d !== host)
        if (origin) {
          setBanner({
            id: 'migration-new',
            variant: 'migration',
            message: intl.formatMessage({ id: 'remixApp.migrationBannerNew' }, { toDomain: migration.toDomain }),
            action: {
              label: intl.formatMessage({ id: 'remixApp.migrationBannerNewAction' }, { fromDomain: origin }),
              // Opt out on the way in, or the old site bounces a migrated user
              // straight back here.
              href: `https://${origin}/?nomigrationredirect`
            },
            persistKey: dismissKey('migration-new')
          })
          return
        }
      }

      if (migration.fromDomains.includes(host)) {
        setBanner({
          id: 'migration-old',
          variant: 'migration',
          message: intl.formatMessage({ id: 'remixApp.migrationBannerOld' }, { toDomain: migration.toDomain }),
          action: {
            label: intl.formatMessage({ id: 'remixApp.migrationBannerOldAction' }),
            onClick: async () => {
              await appManager?.activatePlugin(['domainMigration'])
              await appManager?.call('domainMigration', 'showMigration')
            }
          }
        })
        return
      }
    }

    if (window.location.hostname === 'yann300.github.io') {
      setBanner({
        id: 'unstable',
        variant: 'warning',
        message: intl.formatMessage({ id: 'remixApp.originWarningUnstable' })
      })
    } else if (
      window.location.hostname === 'alpha.remix.live' ||
      (window.location.hostname === 'ethereum.github.io' && window.location.pathname.indexOf('/remix-live-alpha') === 0)
    ) {
      setBanner({
        id: 'alpha',
        variant: 'warning',
        message: intl.formatMessage({ id: 'remixApp.originWarningAlpha' })
      })
    } else if (
      window.location.protocol.indexOf('http') === 0 &&
      window.location.hostname !== 'remix.ethereum.org' &&
      window.location.hostname !== 'app.remix.live' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      setBanner({
        id: 'moved',
        variant: 'warning',
        message: intl.formatMessage({ id: 'remixApp.originWarningMoved' })
      })
    } else {
      setBanner(null)
    }
  }, [intl, appConfig])

  if (!banner || dismissed || wasDismissed(banner.persistKey)) return null

  const isMigration = banner.variant === 'migration'
  const colors = isMigration
    ? { backgroundColor: '#2fbfb1', color: '#06231f' }
    : { backgroundColor: '#c9a000', color: '#000' }

  const onDismiss = () => {
    setDismissed(true)
    if (!banner.persistKey) return
    try {
      localStorage.setItem(banner.persistKey, 'true')
    } catch {
      // storage blocked — it simply reappears next load
    }
  }

  return (
    <div
      className="d-flex align-items-center justify-content-center px-3 py-1"
      style={{ ...colors, fontSize: '0.85rem', flexShrink: 0 }}
      data-id={`originBanner-${banner.id}`}
    >
      <i className={`fas ${isMigration ? 'fa-arrow-right-arrow-left' : 'fa-exclamation-triangle'} me-2`}></i>
      <span>{banner.message}</span>
      {banner.action &&
        (banner.action.href ? (
          <a
            className="ms-2 fw-bold text-decoration-underline"
            style={{ color: 'inherit' }}
            href={banner.action.href}
            data-id={`originBannerAction-${banner.id}`}
          >
            {banner.action.label}
          </a>
        ) : (
          <button
            className="btn btn-sm p-0 ms-2 border-0 fw-bold text-decoration-underline"
            style={{ color: 'inherit', lineHeight: 1 }}
            onClick={banner.action.onClick}
            data-id={`originBannerAction-${banner.id}`}
          >
            {banner.action.label}
          </button>
        ))}
      <button
        className="btn btn-sm p-0 ms-3 border-0"
        style={{ color: 'inherit', lineHeight: 1 }}
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <i className="fas fa-times"></i>
      </button>
    </div>
  )
}

export default OriginWarning
