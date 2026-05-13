import React, { useState } from 'react'

/**
 * DAppUpdateReviewCard — Post-update file diff review.
 * Files are already written; Accept keeps them, Revert restores backups.
 */

interface DAppUpdateReviewCardProps {
  workspaceName: string
  files: Record<string, string>
  backups: Record<string, string>
  status: 'pending' | 'accepted' | 'reverted'
  onAcceptAll: () => void
  onRevertAll: () => void
  onViewDiff: (filePath: string, newContent: string, oldContent: string) => void
}

export const DAppUpdateReviewCard: React.FC<DAppUpdateReviewCardProps> = ({
  workspaceName,
  files,
  backups,
  status,
  onAcceptAll,
  onRevertAll,
  onViewDiff,
}) => {
  const [isExpanded, setIsExpanded] = useState(true)
  const fileList = Object.keys(files)

  // Hide card completely after accept/revert
  if (status === 'accepted' || status === 'reverted') return null

  const getStatusLabel = (filePath: string) => {
    const backup = backups[filePath]
    if (backup === '' || backup === undefined) return 'new file'
    return 'modified'
  }

  const getBaseName = (path: string) => {
    return path.startsWith('/') ? path.substring(1) : path
  }

  return (
    <div style={{
      background: 'var(--secondary, #2d2d2d)',
      border: '1px solid var(--bs-border-color, #444)',
      borderRadius: '8px',
      padding: '12px',
      marginTop: '8px',
      marginBottom: '8px',
    }}>
      {/* Header */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          marginBottom: isExpanded ? '8px' : 0,
          userSelect: 'none',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '13px' }}>
          {fileList.length} file{fileList.length !== 1 ? 's' : ''} updated
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted, #999)' }}>
          {isExpanded ? '▲' : '▼'}
        </span>
      </div>

      {/* File List */}
      {isExpanded && (
        <>
          {fileList.map(filePath => {
            const label = getStatusLabel(filePath)
            const isNew = label === 'new file'
            return (
              <div
                key={filePath}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 0',
                  fontSize: '12px',
                  borderBottom: '1px solid var(--bs-border-color, #333)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                  <code style={{
                    fontSize: '12px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: 'var(--text, #ccc)',
                  }}>
                    {getBaseName(filePath)}
                  </code>
                  <span style={{
                    fontSize: '11px',
                    color: isNew ? '#27ae60' : 'var(--text-muted, #aaa)',
                    flexShrink: 0,
                  }}>
                    ({label})
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onViewDiff(filePath, files[filePath], backups[filePath] || '')
                  }}
                  style={{
                    padding: '3px 10px',
                    borderRadius: '4px',
                    border: 'none',
                    background: '#3498db',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 500,
                    flexShrink: 0,
                  }}
                >
                  Review
                </button>
              </div>
            )
          })}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px' }}>
            <button
              onClick={onRevertAll}
              style={{
                padding: '5px 14px', borderRadius: '4px', border: 'none',
                background: '#e74c3c', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 500
              }}
            >
              Revert All
            </button>
            <button
              onClick={onAcceptAll}
              style={{
                padding: '5px 14px', borderRadius: '4px', border: 'none',
                background: '#27ae60', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 500
              }}
            >
              Accept All
            </button>
          </div>
        </>
      )}
    </div>
  )
}
