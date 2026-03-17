/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import { useState, useEffect, useCallback, useRef } from 'react'
import { ChatHistoryStorageManager } from '@remix/remix-ai-core'
import { SyncStatus } from '../lib/types'

interface UseCloudSyncProps {
  storageManager: ChatHistoryStorageManager | null
  enabled?: boolean
  autoSyncInterval?: number // in milliseconds, default 5 minutes
}

interface UseCloudSyncReturn {
  syncStatus: SyncStatus
  lastSyncTime: number | null
  isSyncing: boolean
  syncError: string | null

  // Manual sync operations
  syncNow: () => Promise<void>
  pullFromCloud: () => Promise<void>
  pushToCloud: () => Promise<void>

  // Sync control
  enableSync: () => void
  disableSync: () => void
}

/**
 * Custom hook for managing cloud sync operations
 * Handles background sync, manual sync triggers, and sync status
 */
export const useCloudSync = ({
  storageManager,
  enabled = false,
  autoSyncInterval = 5 * 60 * 1000 // 5 minutes
}: UseCloudSyncProps): UseCloudSyncReturn => {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncEnabled, setSyncEnabled] = useState(enabled)

  const syncTimerRef = useRef<NodeJS.Timeout | null>(null)
  const isMountedRef = useRef(true)

  /**
   * Pull data from cloud storage
   */
  const pullFromCloud = useCallback(async () => {
    if (!storageManager || !syncEnabled) {
      return
    }

    if (!storageManager.isSyncEnabled()) {
      return
    }

    setIsSyncing(true)
    setSyncStatus('syncing')
    setSyncError(null)

    try {
      const result = await storageManager.pullFromCloud()

      if (!isMountedRef.current) return

      if (result && result.success) {
        setSyncStatus('synced')
        setLastSyncTime(result.timestamp)
      } else {
        setSyncStatus('error')
        setSyncError(result?.errors?.join(', ') || 'Unknown sync error')
      }
    } catch (err) {
      if (!isMountedRef.current) return

      const errorMessage = err instanceof Error ? err.message : 'Failed to pull from cloud'
      setSyncStatus('error')
      setSyncError(errorMessage)
      console.error('Pull from cloud failed:', err)
    } finally {
      if (isMountedRef.current) {
        setIsSyncing(false)
      }
    }
  }, [storageManager, syncEnabled])

  /**
   * Push data to cloud storage
   */
  const pushToCloud = useCallback(async () => {
    if (!storageManager || !syncEnabled) {
      return
    }

    if (!storageManager.isSyncEnabled()) {
      return
      return
    }

    setIsSyncing(true)
    setSyncStatus('syncing')
    setSyncError(null)

    try {
      const result = await storageManager.syncToCloud()

      if (!isMountedRef.current) return

      if (result && result.success) {
        setSyncStatus('synced')
        setLastSyncTime(result.timestamp)
      } else {
        setSyncStatus('error')
        setSyncError(result?.errors?.join(', ') || 'Unknown sync error')
      }
    } catch (err) {
      if (!isMountedRef.current) return

      const errorMessage = err instanceof Error ? err.message : 'Failed to push to cloud'
      setSyncStatus('error')
      setSyncError(errorMessage)
    } finally {
      if (isMountedRef.current) {
        setIsSyncing(false)
      }
    }
  }, [storageManager, syncEnabled])

  /**
   * Perform full bi-directional sync
   */
  const syncNow = useCallback(async () => {
    if (!storageManager || !syncEnabled) return

    setSyncError(null)

    try {
      // First pull to get latest from cloud
      await pullFromCloud()

      // Then push any local changes
      await pushToCloud()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sync failed'
      setSyncError(errorMessage)
    }
  }, [storageManager, syncEnabled, pullFromCloud, pushToCloud])

  /**
   * Enable cloud sync
   */
  const enableSync = useCallback(() => {
    setSyncEnabled(true)
    setSyncStatus('idle')
  }, [])

  /**
   * Disable cloud sync
   */
  const disableSync = useCallback(() => {
    setSyncEnabled(false)
    setSyncStatus('idle')

    // Clear sync timer
    if (syncTimerRef.current) {
      clearInterval(syncTimerRef.current)
      syncTimerRef.current = null
    }

  }, [])

  /**
   * Start background sync timer
   */
  const startBackgroundSync = useCallback(() => {
    // Clear existing timer
    if (syncTimerRef.current) {
      clearInterval(syncTimerRef.current)
    }

    // Set up new timer
    syncTimerRef.current = setInterval(() => {
      if (syncEnabled && storageManager?.isSyncEnabled()) {
        syncNow()
      }
    }, autoSyncInterval)
  }, [syncEnabled, storageManager, autoSyncInterval, syncNow])

  /**
   * Get last sync time from storage on mount
   */
  useEffect(() => {
    if (storageManager && syncEnabled) {
      storageManager.getLastSyncTime().then(time => {
        if (isMountedRef.current && time) {
          setLastSyncTime(time)
        }
      })
    }
  }, [storageManager, syncEnabled])

  /**
   * Pull from cloud on mount if sync is enabled
   */
  useEffect(() => {
    if (storageManager && syncEnabled && storageManager.isSyncEnabled()) {
      pullFromCloud()
    }
  }, []) // Only run on mount

  /**
   * Start/stop background sync based on sync enabled state
   */
  useEffect(() => {
    if (syncEnabled && storageManager?.isSyncEnabled()) {
      startBackgroundSync()
    } else {
      // Clean up timer when sync is disabled
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current)
        syncTimerRef.current = null
      }
    }

    // Cleanup on unmount
    return () => {
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current)
      }
    }
  }, [syncEnabled, storageManager, startBackgroundSync])

  /**
   * Track component mounted state
   */
  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
    }
  }, [])

  return {
    syncStatus,
    lastSyncTime,
    isSyncing,
    syncError,
    syncNow,
    pullFromCloud,
    pushToCloud,
    enableSync,
    disableSync
  }
}
