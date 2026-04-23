/**
 * SubagentPanel — Displays subagent execution history for a message.
 *
 * Purely presentational — reads subagentHistory from props.
 * Each subagent entry shows: name, task, status, duration.
 *
 * Running subagents show a spinner; completed ones show elapsed time.
 * The panel replaces the legacy inline subagent-indicator when data is available.
 *
 * No side-effects, no event subscriptions.
 */
import React, { useState } from 'react'

interface SubagentRecord {
  id: string
  name: string
  task: string
  status: 'running' | 'completed' | 'failed'
  startTime: number
  endTime?: number
  duration?: number
}

interface SubagentPanelProps {
  subagentHistory: SubagentRecord[]
  /** Whether the parent message is still streaming */
  isStreaming: boolean
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/**
 * Renders a single subagent entry
 */
const SubagentEntry: React.FC<{ entry: SubagentRecord }> = ({ entry }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const isRunning = entry.status === 'running'
  const isFailed = entry.status === 'failed'
  const elapsed = entry.duration || (entry.endTime && entry.startTime ? entry.endTime - entry.startTime : null)

  return (
    <div className={`subagent-entry subagent-entry--${entry.status}`}>
      <div
        className="subagent-entry__header"
        onClick={() => !isRunning && setIsExpanded(!isExpanded)}
      >
        {/* Status icon */}
        <span className="subagent-entry__status-icon">
          {isRunning && <i className="fas fa-spinner fa-spin" />}
          {entry.status === 'completed' && <i className="fas fa-check-circle text-success" />}
          {isFailed && <i className="fas fa-exclamation-triangle text-danger" />}
        </span>

        {/* Robot icon + name */}
        <i className="fas fa-robot subagent-entry__icon" />
        <span className="subagent-entry__name">{entry.name}</span>

        {/* Right side: duration + chevron */}
        <span className="subagent-entry__right">
          {elapsed != null && (
            <span className="subagent-entry__duration">{formatDuration(elapsed)}</span>
          )}
          {!isRunning && (
            <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'} subagent-entry__chevron`} />
          )}
        </span>
      </div>

      {/* Task detail — shown when expanded or when running */}
      {(isExpanded || isRunning) && entry.task && (
        <div className="subagent-entry__body">
          <span className="subagent-entry__label">Task</span>
          <div className="subagent-entry__task">{entry.task}</div>
        </div>
      )}
    </div>
  )
}

/**
 * SubagentPanel — renders the full list of subagent entries
 */
export const SubagentPanel: React.FC<SubagentPanelProps> = ({ subagentHistory }) => {
  if (!subagentHistory || subagentHistory.length === 0) return null

  return (
    <div className="subagent-panel" data-testid="subagent-panel">
      {subagentHistory.map(entry => (
        <SubagentEntry key={entry.id} entry={entry} />
      ))}
    </div>
  )
}
