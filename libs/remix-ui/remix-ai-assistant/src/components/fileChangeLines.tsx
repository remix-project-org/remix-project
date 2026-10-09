import React, { useState } from 'react'
import { AIFileChangeRecord } from '@remix/remix-ai-core'
import { countLineChanges } from './aiChangesPanel'

export type AnswerSegment = { kind: 'text', text: string } | { kind: 'changes', changes: AIFileChangeRecord[] }

const isInsideCodeFence = (content: string, position: number) => (content.slice(0, position).match(/^[ \t]*```/gm) || []).length % 2 === 1

/** Where a change recorded after `anchor` goes in the answer: never inside a code block or mid-paragraph */
const placeChange = (content: string, anchor: string, from: number): number => {
  if (!anchor) return from
  const found = content.indexOf(anchor, Math.max(0, from - anchor.length))
  // The text it followed is gone (the answer was rewritten): show it at the end
  if (found === -1) return content.length
  let position = Math.max(from, found + anchor.length)
  if (isInsideCodeFence(content, position)) {
    const fenceEnd = content.slice(position).search(/^[ \t]*```[^\n]*$/m)
    if (fenceEnd === -1) return content.length
    position += fenceEnd
    const lineEnd = content.indexOf('\n', position)
    return lineEnd === -1 ? content.length : lineEnd + 1
  }
  const atBoundary = position === 0 || position === content.length || content[position - 1] === '\n' || content[position] === '\n'
  if (atBoundary) return position
  const paragraphEnd = content.indexOf('\n\n', position)
  return paragraphEnd === -1 ? content.length : paragraphEnd
}

/** The answer text cut where its file changes happened; changes in a row are grouped */
export const splitAnswerAtChanges = (content: string, changes: AIFileChangeRecord[]): AnswerSegment[] => {
  const segments: AnswerSegment[] = []
  let textStart = 0
  let lastPosition = 0
  for (const change of changes) {
    const position = placeChange(content, change.anchor || '', lastPosition)
    const text = content.slice(textStart, position)
    const previous = segments[segments.length - 1]
    if (text.trim() === '' && previous?.kind === 'changes') {
      previous.changes.push(change)
    } else {
      if (text.trim() !== '') segments.push({ kind: 'text', text })
      segments.push({ kind: 'changes', changes: [change]})
    }
    textStart = position
    lastPosition = position
  }
  const rest = content.slice(textStart)
  if (rest.trim() !== '') segments.push({ kind: 'text', text: rest })
  return segments
}

const normalizePath = (path: string) => path.replace(/^\/+/, '')

const changeVerb = (change: AIFileChangeRecord) => change.deleted ? 'Deleted' : change.movedFrom ? 'Moved' : change.existed ? 'Edited' : 'Created'

const ChangeStat = ({ change }: { change: AIFileChangeRecord }) => {
  const { additions, deletions } = countLineChanges(change.oldContent, change.newContent)
  return (
    <span className="ai-change-line-stat text-nowrap">
      <span className="text-success">+{additions}</span> <span className="text-danger">−{deletions}</span>
    </span>
  )
}

const RejectedLine = ({ change }: { change: AIFileChangeRecord }) => (
  <div className="ai-change-line ai-change-line-rejected" data-id="ai-change-line-rejected" data-path={normalizePath(change.path)}>
    <i className="fas fa-ban"></i>
    <span className="text-truncate">Rejected {change.deleted ? 'deletion of' : change.movedFrom ? 'move of' : change.existed ? 'edit to' : 'creation of'} {normalizePath(change.path)}</span>
  </div>
)

const AppliedLine = ({ change, onOpen, nested }: { change: AIFileChangeRecord, onOpen: (change: AIFileChangeRecord) => void, nested?: boolean }) => (
  <button
    type="button"
    className={`ai-change-line ${nested ? 'ai-change-line-nested' : ''}`}
    onClick={() => onOpen(change)}
    data-id="ai-change-line"
    data-path={normalizePath(change.path)}
  >
    {!nested && <i className="fas fa-pen"></i>}
    <span className="text-truncate">{nested ? normalizePath(change.path) : `${changeVerb(change)} ${normalizePath(change.path)}`}</span>
    {nested && <span className="ai-change-line-kind">{changeVerb(change).toLowerCase()}</span>}
    <ChangeStat change={change} />
    <i className="fas fa-chevron-right ai-change-line-open"></i>
  </button>
)

/** File changes made at one point of an answer: one line, or one expandable line for several files */
export const FileChangeGroup = ({ changes, onOpen }: { changes: AIFileChangeRecord[], onOpen: (change: AIFileChangeRecord) => void }) => {
  const [expanded, setExpanded] = useState(false)
  const applied = changes.filter((change) => change.status !== 'rejected')
  const rejected = changes.filter((change) => change.status === 'rejected')
  const totals = applied.reduce((sum, change) => {
    const { additions, deletions } = countLineChanges(change.oldContent, change.newContent)
    return { additions: sum.additions + additions, deletions: sum.deletions + deletions }
  }, { additions: 0, deletions: 0 })

  return (
    <div className="ai-change-group d-flex flex-column" data-id="ai-change-group">
      {applied.length === 1 && <AppliedLine change={applied[0]} onOpen={onOpen} />}
      {applied.length > 1 && (
        <>
          <button type="button" className="ai-change-line" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} data-id="ai-change-group-toggle">
            <i className="fas fa-pen"></i>
            <span className="text-truncate">Edited {applied.length} files</span>
            <span className="ai-change-line-stat text-nowrap">
              <span className="text-success">+{totals.additions}</span> <span className="text-danger">−{totals.deletions}</span>
            </span>
            <i className={`fas ${expanded ? 'fa-chevron-down' : 'fa-chevron-right'} ai-change-line-open`}></i>
          </button>
          {expanded && applied.map((change, index) => <AppliedLine key={`${change.path}-${index}`} change={change} onOpen={onOpen} nested />)}
        </>
      )}
      {rejected.map((change, index) => <RejectedLine key={`${change.path}-rejected-${index}`} change={change} />)}
    </div>
  )
}
