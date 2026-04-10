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
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(ts).toLocaleDateString()
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
 * Single topbar widget: toggle switch + reactive cloud/sync icon.
 *
 * - Not logged in       → cloud-slash (disabled, muted) + off toggle
 * - Logged in, cloud OFF → cloud-slash + off toggle → click enables
 * - Logged in, cloud ON  → live sync icon (green/orange/red) + on toggle
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

  const iconColor = isOn
    ? syncProps?.color
    : theme === 'dark' ? '#f9fafe' : '#222336'

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
          ? (syncProps!.title + ' — click to disable cloud')
          : 'Cloud storage is OFF — click to enable'

  return (
    <CustomTooltip placement="bottom" tooltipText={tooltipText}>
      <button
        data-id="cloud-toggle"
        className={`d-inline-flex align-items-center border-0 p-0 text-theme-contrast ${className}`}
        style={{
          background: 'transparent',
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          opacity: isDisabled ? 0.4 : 1,
          outline: 'none',
          gap: '6px',
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

        {/* Toggle track */}
        <span
          style={{
            position: 'relative',
            display: 'inline-block',
            width: '36px',
            height: '20px',
            borderRadius: '10px',
            backgroundColor: isOn ? 'var(--bs-success)' : 'var(--bs-secondary)',
            transition: 'background-color 0.25s ease',
            flexShrink: 0,
          }}
        >
          {/* Toggle knob */}
          <span
            style={{
              position: 'absolute',
              top: '2px',
              left: isOn ? '18px' : '2px',
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              backgroundColor: '#fff',
              transition: 'left 0.25s ease',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }}
          />
        </span>
      </button>
    </CustomTooltip>
  )
}
