import { WorkspaceSummary, StorageFile } from '@remix-api'

// Per-workspace backup data structure
export interface WorkspaceBackupData {
  backups: StorageFile[]
  autosave: StorageFile | null
  loading: boolean
  error: string | null
  loaded: boolean
}

export interface CloudWorkspacesProps {
  plugin: any
  workspaces: WorkspaceSummary[]
  selectedWorkspace: string | null
  workspaceBackups: Record<string, WorkspaceBackupData>
  loading: boolean
  error: string | null
  isAuthenticated: boolean
  onSelectWorkspace: (workspaceId: string) => void
  onRestoreBackup: (folder: string, filename: string) => void
  onDeleteBackup: (folder: string, filename: string) => void
  onRefresh: () => void
}

export interface BackupItemProps {
  backup: StorageFile
  onRestore: (folder: string, filename: string) => void
  onDelete: (folder: string, filename: string) => void
  onDownload: (folder: string, filename: string) => void
}

export interface AutosaveItemProps {
  autosave: StorageFile
  onRestore: (folder: string, filename: string) => void
  onDownload: (folder: string, filename: string) => void
}

export interface WorkspaceItemProps {
  workspace: WorkspaceSummary
  isExpanded: boolean
  isSelected: boolean
  backups: StorageFile[]
  autosave: StorageFile | null
  loading: boolean
  onToggleExpand: (workspaceId: string) => void
  onRestore: (folder: string, filename: string) => void
  onDelete: (folder: string, filename: string) => void
  onDownload: (folder: string, filename: string) => void
}

export interface DeleteConfirmModalProps {
  filename: string
  onConfirm: () => void
  onCancel: () => void
}

// Utility functions
export const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * Format a date as relative time ("just now", "5 min ago", "2 hours ago", "yesterday", etc.)
 */
export const formatRelativeDate = (dateStr: string | null): string => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr = Math.floor(diffMin / 60)
  const diffDays = Math.floor(diffHr / 24)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin} min ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7)
    return `${weeks}w ago`
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30)
    return `${months}mo ago`
  }
  return formatDate(dateStr)
}

/**
 * Get a day label for grouping: "Today", "Yesterday", or "Mon, Jan 6"
 */
export const getDayLabel = (dateStr: string | null): string => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.floor((today.getTime() - dateDay.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}
