import React, { useCallback } from 'react'
import { useCloudStore } from './cloud-store'
import { WorkspaceSyncStatus } from './types'
import { CustomTooltip } from '@remix-ui/helper'

/**
 * Derive icon class + color + tooltip from a WorkspaceSyncStatus.
 *
 *  ┌────────────────────────────────┬─────────────────────────────┬──────────────────┬───────────────────────────┐
 *  │ State                          │ Icon                        │ Color            │ Tooltip                   │
 *  ├────────────────────────────────┼─────────────────────────────┼──────────────────┼───────────────────────────┤
 *  │ loading                        │ fa-cloud-arrow-down beat    │ var(--bs-info)   │ Loading workspace…        │
 *  │ syncing (pull)                 │ fa-cloud fa-beat-fade       │ var(--bs-warning)│ Syncing…                  │
 *  │ pushing (local→S3)             │ fa-cloud-arrow-up beat-fade │ var(--bs-info)   │ Uploading changes…        │
 *  │ error                          │ fa-cloud-bolt               │ var(--bs-danger) │ Sync error: <msg>         │
 *  │ idle + pendingChanges > 0      │ fa-cloud-arrow-up           │ var(--bs-warning)│ N pending changes         │
 *  │ idle + pendingChanges=0 synced │ fa-cloud                    │ var(--bs-success)│ Synced <time>             │
 *  │ idle + never synced            │ fa-cloud                    │ var(--bs-info)   │ Connected to cloud        │
 *  └────────────────────────────────┴─────────────────────────────┴──────────────────┴───────────────────────────┘
 */
export function getSyncIconProps(status: WorkspaceSyncStatus | undefined): {
    icon: string
    color: string
    title: string
    animate?: string
} {
  if (!status) {
    // No status yet — initial/unknown
    return { icon: 'fas fa-cloud', color: 'var(--bs-success)', title: 'Connected to cloud' }
  }

  if (status.status === 'loading') {
    return {
      icon: 'fas fa-cloud-arrow-down',
      color: 'var(--bs-info)',
      title: 'Loading workspace…',
      animate: 'fa-beat-fade',
    }
  }

  if (status.status === 'syncing') {
    return {
      icon: 'fas fa-cloud',
      color: 'var(--bs-warning)',
      title: 'Syncing…',
      animate: 'fa-beat-fade',
    }
  }

  if (status.status === 'pushing') {
    return {
      icon: 'fas fa-cloud-arrow-up',
      color: 'var(--bs-info)',
      title: 'Uploading changes…',
      animate: 'fa-beat-fade',
    }
  }

  if (status.status === 'error') {
    return {
      icon: 'fas fa-cloud-bolt',
      color: 'var(--bs-danger)',
      title: `Sync error${status.error ? ': ' + status.error : ''}`,
    }
  }

  // idle
  if (status.pendingChanges > 0) {
    return {
      icon: 'fas fa-cloud-arrow-up',
      color: 'var(--bs-warning)',
      title: `${status.pendingChanges} pending change${status.pendingChanges !== 1 ? 's' : ''}`,
    }
  }

  if (status.lastSync) {
    return {
      icon: 'fas fa-cloud',
      color: 'var(--bs-success)',
      title: `Synced ${formatRelativeTime(status.lastSync)}`,
    }
  }

  // idle, no pending, never synced
  return { icon: 'fas fa-cloud', color: 'var(--bs-info)', title: 'Connected to cloud' }
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}min ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(ts).toLocaleDateString()
}

/**
 * Short label shown inside the cloud sync pill (next to the icon).
 * Mirrors the states in getSyncIconProps but with terse, badge-friendly text.
 */
function getSyncBadgeLabel(status: WorkspaceSyncStatus | undefined): string {
  if (!status) return 'Connected'
  switch (status.status) {
  case 'loading': return 'Loading…'
  case 'syncing': return 'Syncing…'
  case 'pushing': return 'Uploading…'
  case 'error': return 'Error'
  default:
    if (status.pendingChanges > 0) {
      return `${status.pendingChanges} pending`
    }
    if (status.lastSync) return formatRelativeTime(status.lastSync)
    return 'Connected'
  }
}

// ── Inline icon for workspace dropdown items ──────────────────────────

interface CloudSyncStatusIconProps {
    /** The cloud workspace UUID (remoteId from WorkspaceMetadata) */
    remoteId: string
    /** Extra CSS classes */
    className?: string
    /** Font size override (default: 0.8em — matches the existing dropdown icon) */
    fontSize?: string
}

/**
 * A small cloud icon that reflects the live sync status of a cloud workspace.
 * Drop-in replacement for the old static `<i className="fas fa-cloud" …>` icons
 * in the workspace dropdown.
 */
export const CloudSyncStatusIcon: React.FC<CloudSyncStatusIconProps> = ({
  remoteId,
  className = 'ms-2',
  fontSize = '0.8em',
}) => {
  const { syncStatus } = useCloudStore()
  const ws = syncStatus[remoteId]
  const { icon, color, title, animate } = getSyncIconProps(ws)

  return (
    <i
      className={`${icon}${animate ? ' ' + animate : ''} ${className}`}
      style={{ color, fontSize }}
      title={title}
    />
  )
}

// ── Cloud Toggle (with integrated sync status icon) ───────────────────

interface CloudToggleProps {
  /** Called when the user toggles cloud ON while authenticated */
  onEnableCloud: () => void
  /** Called when the user toggles cloud OFF */
  onDisableCloud: () => void
  className?: string
  theme?: 'light' | 'dark'
}

/**
 * Single topbar widget: a pill badge (reactive cloud/sync icon + status label)
 * that toggles cloud storage on/off when clicked.
 *
 * - Not logged in        → grayed-out pill, cloud-slash icon, "Off"
 * - Logged in, cloud OFF  → grayed-out pill, cloud-slash icon, "Off" → click enables
 * - Logged in, cloud ON   → full-color pill, live sync icon (green/orange/red)
 *                           + label (relative sync time / status) → click disables
 */
export const CloudToggle: React.FC<CloudToggleProps> = ({
  onEnableCloud,
  onDisableCloud,
  className = '',
  theme = 'dark'
}) => {
  const { isCloudMode, isAuthenticated, loading, activeWorkspaceId, syncStatus, workspaceQueueBusy } = useCloudStore()

  const isOn = isCloudMode
  const isDisabled = loading || !isAuthenticated || workspaceQueueBusy

  // Derive the icon: when cloud is on, reflect live sync status; when off, show cloud-slash
  const syncProps = isOn
    ? getSyncIconProps(activeWorkspaceId ? syncStatus[activeWorkspaceId] : undefined)
    : null

  const iconClass = isOn
    ? `${syncProps?.icon}${syncProps?.animate ? ' ' + syncProps?.animate : ''}`
    : `fas fa-cloud-slash${loading ? ' fa-beat-fade' : ''}`

  // When cloud is OFF the whole pill is grayed out; when ON the icon/text use
  // the live sync color (green when synced, orange/red for pending/error).
  const mutedColor = theme === 'dark' ? '#9ba1b0' : '#8a8d99'
  const iconColor = isOn ? syncProps?.color : mutedColor

  const label = isOn ? getSyncBadgeLabel(activeWorkspaceId ? syncStatus[activeWorkspaceId] : undefined) : 'Off'

  const pillBg = theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'

  const handleClick = useCallback(() => {
    if (isDisabled) return
    if (isOn) {
      onDisableCloud()
    } else {
      onEnableCloud()
    }
  }, [isDisabled, isOn, onEnableCloud, onDisableCloud])

  const tooltipText = workspaceQueueBusy
    ? 'Workspace operation in progress…'
    : loading
      ? 'Connecting…'
      : !isAuthenticated
        ? 'Sign in to use cloud storage'
        : isOn
          ? (syncProps?.title + ' — click to disable cloud')
          : 'Cloud storage is OFF — click to enable'

  return (
    <CustomTooltip placement="bottom" tooltipText={tooltipText}>
      <button
        data-id="cloud-toggle"
        className={`d-inline-flex align-items-center border-0 ${className}`}
        style={{
          backgroundColor: pillBg,
          borderRadius: '8px',
          padding: '4px 10px',
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          // Grayed out when cloud mode is OFF (or disabled / signed out) showing toggle state
          opacity: isOn && !isDisabled ? 1 : 0.4,
          outline: 'none',
          gap: '8px',
          transition: 'opacity 0.2s ease',
        }}
        onClick={handleClick}
        disabled={isDisabled}
        aria-label={tooltipText}
      >
        {/* Cloud / sync-status icon */}
        <i
          className={iconClass}
          style={{
            fontSize: '1rem',
            color: iconColor,
            transition: 'color 0.2s',
          }}
        />

        {/* Status label (relative sync time when active, "Off" otherwise) */}
        <span
          style={{
            fontSize: '0.85rem',
            lineHeight: 1,
            color: iconColor,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
      </button>
    </CustomTooltip>
  )
}
