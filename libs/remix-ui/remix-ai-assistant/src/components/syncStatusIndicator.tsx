/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React from 'react'
import { CustomTooltip } from '@remix-ui/helper'
import { SyncStatus } from '../lib/types'

interface SyncStatusIndicatorProps {
  status: SyncStatus
  lastSyncTime?: number | null
  onManualSync?: () => void
}

export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({
  status,
  lastSyncTime,
  onManualSync
}) => {
  const getStatusIcon = () => {
    switch (status) {
    case 'syncing':
      return <i className="fas fa-sync fa-spin"></i>
    case 'synced':
      return <i className="fas fa-cloud-check"></i>
    case 'error':
      return <i className="fas fa-cloud-exclamation text-danger"></i>
    case 'idle':
    default:
      return <i className="fas fa-cloud"></i>
    }
  }

  const getStatusText = () => {
    switch (status) {
    case 'syncing':
      return 'Syncing to cloud...'
    case 'synced':
      if (lastSyncTime) {
        const date = new Date(lastSyncTime)
        const now = new Date()
        const diffMs = now.getTime() - date.getTime()
        const diffMins = Math.floor(diffMs / (1000 * 60))

        if (diffMins < 1) return 'Synced just now'
        if (diffMins < 60) return `Synced ${diffMins}m ago`

        const diffHours = Math.floor(diffMins / 60)
        if (diffHours < 24) return `Synced ${diffHours}h ago`

        const diffDays = Math.floor(diffHours / 24)
        return `Synced ${diffDays}d ago`
      }
      return 'Synced to cloud'
    case 'error':
      return 'Sync error - click to retry'
    case 'idle':
    default:
      return 'Cloud sync available'
    }
  }

  const getStatusClass = () => {
    switch (status) {
    case 'syncing':
      return 'sync-status-syncing'
    case 'synced':
      return 'sync-status-synced'
    case 'error':
      return 'sync-status-error'
    case 'idle':
    default:
      return 'sync-status-idle'
    }
  }

  const handleClick = () => {
    if (status === 'error' && onManualSync) {
      onManualSync()
    } else if (onManualSync && status !== 'syncing') {
      onManualSync()
    }
  }

  return (
    <CustomTooltip tooltipText={getStatusText()}>
      <button
        className={`btn btn-sm btn-link sync-status-indicator ${getStatusClass()}`}
        onClick={handleClick}
        disabled={status === 'syncing'}
        data-id="sync-status-indicator sync-manual-trigger"
        data-sync-status={status}
      >
        {getStatusIcon()}
      </button>
    </CustomTooltip>
  )
}
