import React, { useMemo } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import { CustomTooltip } from '@remix-ui/helper'
import { AIFileChangeRecord, ToolApprovalRequest } from '@remix/remix-ai-core'
import { useResizableWidth } from '../hooks/useResizableWidth'
import { AIPanelEmpty, AIPanelHeader, AIPanelItem, AIPanelSection } from './aiPanel'

/** A file the agent changed in the current conversation: the content before its first change and after its latest one */
export interface AIChangedFile {
  /** Workspace and path: the same path can be changed in two workspaces */
  key: string
  path: string
  workspace?: string
  existed: boolean
  baseContent: string
  latestContent: string
  lastChanged: number
  additions: number
  deletions: number
  deleted?: boolean
  movedFrom?: string
}

export type AIChangesSelection = { kind: 'pending', requestId: string } | { kind: 'file', key: string } | null

interface AIChangesPanelProps {
  pendingApprovals: ToolApprovalRequest[]
  changedFiles: AIChangedFile[]
  selection: AIChangesSelection
  currentWorkspace?: string
  /** Keys of files whose content on disk is no longer what the agent wrote */
  staleKeys: Set<string>
  onSelect: (selection: AIChangesSelection) => void
  onAccept: (approval: ToolApprovalRequest) => void
  onReject: (approval: ToolApprovalRequest) => void
  onOpenInEditor: (path: string) => void
  onClose: () => void
  /** Code mode: the list fills the chat and a row opens its diff in the editor (onSelect), not in the panel */
  docked?: boolean
  theme?: string
}

/** Approvals the panel can show as a diff (file writes); the others stay in the chat */
export const isReviewableApproval = (approval: ToolApprovalRequest) => !!approval.filePath && typeof approval.proposedContent === 'string'

const normalizePath = (path: string) => path.replace(/^\/+/, '')

export const changeKey = (workspace: string | undefined, path: string) => `${workspace || ''}::${normalizePath(path)}`

/**
 * Add a change to a list of changes (newest first), keeping one entry per file:
 * the content before its first change and after its last one.
 */
export const mergeFileChange = (records: AIFileChangeRecord[], change: AIFileChangeRecord): AIFileChangeRecord[] => {
  const path = normalizePath(change.path)
  const movedFrom = change.movedFrom ? normalizePath(change.movedFrom) : undefined
  const sameWorkspace = (record: AIFileChangeRecord) => (record.workspace || '') === (change.workspace || '')
  // A moved file keeps the history it had under its previous path
  const existing = records.find((record) => sameWorkspace(record) && record.path === (movedFrom || path))
  const others = records.filter((record) => !(sameWorkspace(record) && (record.path === path || record.path === movedFrom)))
  const existed = existing ? existing.existed : change.existed
  // Created then deleted: nothing left to show
  if (change.deleted && !existed) return others
  return [{
    ...change,
    path,
    existed,
    oldContent: existing ? existing.oldContent : change.oldContent,
    deleted: !!change.deleted,
    movedFrom: existing?.movedFrom || movedFrom,
    gitHead: existing?.gitHead ?? change.gitHead
  }, ...others]
}

/** The changed files of a conversation, from the changes recorded on its messages (all in chronological order) */
export const foldFileChanges = (recordLists: AIFileChangeRecord[][]): AIChangedFile[] => {
  let merged: AIFileChangeRecord[] = []
  for (const records of recordLists) {
    for (const record of records) {
      if (record.status !== 'rejected') merged = mergeFileChange(merged, record)
    }
  }
  return merged.map((record) => ({
    key: changeKey(record.workspace, record.path),
    path: record.path,
    workspace: record.workspace,
    existed: record.existed,
    baseContent: record.oldContent,
    latestContent: record.newContent,
    lastChanged: record.timestamp,
    deleted: record.deleted,
    movedFrom: record.movedFrom,
    ...countLineChanges(record.oldContent, record.newContent)
  }))
}

const PANEL_WIDTH_KEY = 'remix-ai-changes-panel-width'
const PANEL_MIN_WIDTH = 320
const PANEL_DEFAULT_WIDTH = 420

const splitLines = (text: string) => (text ? text.split('\n') : [])

/** Number of added and removed lines between two versions of a file */
export const countLineChanges = (oldText: string, newText: string): { additions: number, deletions: number } => {
  const a = splitLines(oldText)
  const b = splitLines(newText)
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB-- }
  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)
  if (midA.length === 0 || midB.length === 0) return { additions: midB.length, deletions: midA.length }
  if (midA.length * midB.length > 4000000) {
    // too big for an exact diff: compare line counts per content instead
    const counts = new Map<string, number>()
    midA.forEach((line) => counts.set(line, (counts.get(line) || 0) + 1))
    let common = 0
    midB.forEach((line) => {
      const count = counts.get(line) || 0
      if (count > 0) { common++; counts.set(line, count - 1) }
    })
    return { additions: midB.length - common, deletions: midA.length - common }
  }
  // longest common subsequence, one row at a time
  let prev = new Array(midB.length + 1).fill(0)
  for (let i = 1; i <= midA.length; i++) {
    const row = new Array(midB.length + 1).fill(0)
    for (let j = 1; j <= midB.length; j++) {
      row[j] = midA[i - 1] === midB[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], row[j - 1])
    }
    prev = row
  }
  const common = prev[midB.length]
  return { additions: midB.length - common, deletions: midA.length - common }
}

const LANGUAGES: Record<string, string> = {
  sol: 'remix-solidity', js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  json: 'json', css: 'css', html: 'html', md: 'markdown', circom: 'remix-circom', nr: 'remix-noir',
  toml: 'remix-toml', sql: 'remix-sql', yml: 'yaml', yaml: 'yaml'
}

const getLanguage = (path: string) => LANGUAGES[(path.split('.').pop() || '').toLowerCase()] || 'plaintext'

const splitPath = (path: string) => {
  const clean = normalizePath(path)
  const index = clean.lastIndexOf('/')
  return index === -1 ? { name: clean, folder: '' } : { name: clean.slice(index + 1), folder: clean.slice(0, index) }
}

const STALE_TOOLTIP = 'This file has changed since RemixAI wrote it'

const DiffStat = ({ additions, deletions }: { additions: number, deletions: number }) => (
  <span className="ai-changes-stat text-nowrap" data-id="ai-changes-stat">
    <span className="text-success">+{additions}</span> <span className="text-danger">−{deletions}</span>
  </span>
)

const fileBadge = (file: AIChangedFile) => file.deleted ? 'deleted' : file.movedFrom ? 'moved' : file.existed ? 'edited' : 'new'

const FileRow = (props: { path: string, badge: string, additions: number, deletions: number, dataId: string, detail?: string, stale?: boolean, onClick: () => void }) => {
  const { name, folder } = splitPath(props.path)
  return (
    <AIPanelItem
      icon="far fa-file-code"
      title={name}
      titleTooltip={normalizePath(props.path)}
      subtitle={props.detail || folder}
      onClick={props.onClick}
      dataId={props.dataId}
      dataAttributes={{ 'data-path': props.path }}
      trailing={
        <>
          {props.stale && <span className="ai-changes-badge ai-changes-badge-warning badge flex-shrink-0" title={STALE_TOOLTIP} data-id="ai-changes-stale-badge">changed since</span>}
          <span className="ai-changes-badge badge flex-shrink-0">{props.badge}</span>
          <DiffStat additions={props.additions} deletions={props.deletions} />
        </>
      }
    />
  )
}

export const AIChangesPanel = React.memo((props: AIChangesPanelProps) => {
  const theme = (props.theme || '').toLowerCase()
  const { panelRef, width, startResize, resetWidth } = useResizableWidth({ storageKey: PANEL_WIDTH_KEY, minWidth: PANEL_MIN_WIDTH, defaultWidth: PANEL_DEFAULT_WIDTH })

  const isOtherWorkspace = (file: AIChangedFile) => !!file.workspace && !!props.currentWorkspace && file.workspace !== props.currentWorkspace

  const pending = useMemo(() => props.pendingApprovals.filter(isReviewableApproval).map((approval) => ({
    approval,
    ...countLineChanges(approval.existingContent || '', approval.proposedContent)
  })), [props.pendingApprovals])
  const selection = props.docked ? null : props.selection
  const selectedApproval = selection?.kind === 'pending' ? pending.find(({ approval }) => approval.requestId === selection.requestId)?.approval : undefined
  const selectedFile = selection?.kind === 'file' ? props.changedFiles.find((file) => file.key === selection.key) : undefined

  const diff = useMemo(() => {
    if (selectedApproval) {
      const original = selectedApproval.existingContent || ''
      return { path: selectedApproval.filePath, original, modified: selectedApproval.proposedContent, ...countLineChanges(original, selectedApproval.proposedContent) }
    }
    if (selectedFile) return { path: selectedFile.path, original: selectedFile.baseContent, modified: selectedFile.latestContent, additions: selectedFile.additions, deletions: selectedFile.deletions }
    return null
  }, [selectedApproval, selectedFile])

  const diffNotice = selectedFile
    ? isOtherWorkspace(selectedFile)
      ? `In workspace ${selectedFile.workspace}`
      : props.staleKeys.has(selectedFile.key) ? STALE_TOOLTIP : null
    : null
  const canOpenInEditor = !!selectedFile && !selectedFile.deleted && !isOtherWorkspace(selectedFile)

  return (
    <div
      ref={props.docked ? undefined : panelRef}
      className={`ai-changes-panel chat-history-sidebar border-0 d-flex flex-column h-100 ${props.docked ? 'ai-changes-panel-docked w-100' : 'ai-resizable-panel'}`}
      style={props.docked ? undefined : { width }}
      data-id="ai-changes-panel"
      data-theme={theme}
    >
      {!props.docked && (
        <div
          className="ai-panel-resize-handle"
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize, double-click to reset"
          onPointerDown={startResize}
          onDoubleClick={resetWidth}
          data-id="ai-changes-resize-handle"
        />
      )}
      <AIPanelHeader
        title="Changes"
        count={pending.length + props.changedFiles.length}
        titleDataId="ai-changes-panel-title"
        onClose={props.docked ? undefined : props.onClose}
        closeLabel="Close changes"
        closeDataId="ai-changes-close-btn"
        theme={theme}
      />

      {diff ? (
        <div className="d-flex flex-column flex-grow-1" style={{ minHeight: 0 }} data-id="ai-changes-diff">
          <div className="d-flex align-items-center gap-2 px-2 py-1 border-bottom">
            <CustomTooltip tooltipText="Back to the list">
              <button className="btn btn-sm btn-link p-1" onClick={() => props.onSelect(null)} data-id="ai-changes-back-btn">
                <i className="fas fa-arrow-left"></i>
              </button>
            </CustomTooltip>
            <span className="text-truncate flex-grow-1 small fw-semibold" data-id="ai-changes-diff-path">{normalizePath(diff.path)}</span>
            <DiffStat additions={diff.additions} deletions={diff.deletions} />
          </div>
          {diffNotice && (
            <div className="ai-changes-notice small px-2 py-1 border-bottom" data-id="ai-changes-diff-notice">
              <i className="fas fa-info-circle me-1"></i>{diffNotice}
            </div>
          )}
          <div className="flex-grow-1" style={{ minHeight: 0 }}>
            <DiffEditor
              original={diff.original}
              modified={diff.modified}
              language={getLanguage(diff.path)}
              theme={theme === 'dark' ? 'remix-dark' : 'remix-light'}
              options={{ readOnly: true, renderSideBySide: false, minimap: { enabled: false }, scrollBeyondLastLine: false, automaticLayout: true, fontSize: 12 }}
              height="100%"
            />
          </div>
          <div className="d-flex align-items-center gap-2 p-2 border-top">
            {selectedApproval ? (
              <>
                <button className="tool-approval-card__btn tool-approval-card__btn--approve" onClick={() => props.onAccept(selectedApproval)} data-id="ai-changes-accept-btn">
                  <i className="fas fa-check me-1"></i>Accept
                </button>
                <button className="tool-approval-card__btn ai-changes-btn-secondary" onClick={() => props.onReject(selectedApproval)} data-id="ai-changes-reject-btn">
                  <i className="fas fa-times me-1"></i>Reject
                </button>
              </>
            ) : canOpenInEditor && (
              <button className="tool-approval-card__btn ai-changes-btn-secondary" onClick={() => props.onOpenInEditor(diff.path)} data-id="ai-changes-open-editor-btn">
                <i className="fas fa-code me-1"></i>Open in editor
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="sidebar-body flex-grow-1 overflow-y-auto p-2" data-id="ai-changes-list">
          {pending.length > 0 && (
            <AIPanelSection title="Waiting for your approval">
              {pending.map(({ approval, additions, deletions }) => (
                <FileRow
                  key={approval.requestId}
                  path={approval.filePath}
                  badge={approval.existingContent ? 'edited' : 'new'}
                  additions={additions}
                  deletions={deletions}
                  dataId="ai-changes-pending-row"
                  onClick={() => props.onSelect({ kind: 'pending', requestId: approval.requestId })}
                />
              ))}
            </AIPanelSection>
          )}
          {props.changedFiles.length > 0 && (
            <AIPanelSection title="Changed files">
              {props.changedFiles.map((file) => (
                <FileRow
                  key={file.key}
                  path={file.path}
                  badge={fileBadge(file)}
                  detail={file.movedFrom ? `moved from ${file.movedFrom}` : isOtherWorkspace(file) ? `in workspace ${file.workspace}` : undefined}
                  stale={props.staleKeys.has(file.key)}
                  additions={file.additions}
                  deletions={file.deletions}
                  dataId="ai-changes-file-row"
                  onClick={() => props.onSelect({ kind: 'file', key: file.key })}
                />
              ))}
            </AIPanelSection>
          )}
          {pending.length === 0 && props.changedFiles.length === 0 && (
            <AIPanelEmpty icon="far fa-file-code" message="Files changed by RemixAI in this chat will appear here." dataId="ai-changes-empty" />
          )}
        </div>
      )}
    </div>
  )
})

AIChangesPanel.displayName = 'AIChangesPanel'
