/**
 * AgentStatusBar — Shows current DeepAgent activity above the chat input.
 *
 * Derives its status from existing component state (no new state needed):
 *  - isStreaming + no tools    → "Thinking..."
 *  - isExecutingTools          → "Using {toolName}..."
 *  - pendingApprovals > 0      → "Waiting for approval..."
 *  - activeSubagent            → "Running {subagentName}..."
 *  - !isStreaming              → hidden (not rendered)
 *
 * This component is purely presentational — it reads props and renders.
 * No side-effects, no event subscriptions, no state management.
 * All colors are handled via CSS classes — no inline color styles.
 */
import React, { useEffect, useState, useRef } from 'react'

export type AgentStatus =
  | 'idle'
  | 'thinking'
  | 'using_tools'
  | 'waiting_approval'
  | 'spawning_subagent'
  | 'planning'
  | 'complete'

interface AgentStatusBarProps {
  isStreaming: boolean
  isExecutingTools: boolean
  executingToolName?: string
  pendingApprovalCount: number
  activeSubagent?: string
  subagentTask?: string
  currentTask?: string
  taskStatus?: 'running' | 'completed'
}

// Status → display config (no color — handled by CSS class `.agent-status-bar--{status}`)
const STATUS_CONFIG: Record<AgentStatus, { icon: string; iconClass: string; label: string }> = {
  idle:               { icon: '', iconClass: '', label: '' },
  thinking:           { icon: 'fa-brain', iconClass: 'fa-beat-fade', label: 'Thinking...' },
  using_tools:        { icon: 'fa-wrench', iconClass: 'fa-spin', label: 'Using tool' },
  waiting_approval:   { icon: 'fa-shield-halved', iconClass: 'fa-beat', label: 'Waiting for approval' },
  spawning_subagent:  { icon: 'fa-robot', iconClass: 'fa-bounce', label: 'Running subagent' },
  planning:           { icon: 'fa-list-check', iconClass: 'fa-beat-fade', label: 'Planning' },
  complete:           { icon: 'fa-check-circle', iconClass: '', label: 'Complete' }
}

function deriveStatus(props: AgentStatusBarProps): AgentStatus {
  if (!props.isStreaming) return 'idle'
  if (props.pendingApprovalCount > 0) return 'waiting_approval'
  if (props.activeSubagent) return 'spawning_subagent'
  if (props.isExecutingTools) return 'using_tools'
  if (props.currentTask && props.taskStatus === 'running') return 'planning'
  return 'thinking'
}

function getStatusDetail(status: AgentStatus, props: AgentStatusBarProps): string {
  switch (status) {
  case 'using_tools':
    return props.executingToolName
      ? `${STATUS_CONFIG.using_tools.label}: ${props.executingToolName.replace(/_/g, ' ')}`
      : STATUS_CONFIG.using_tools.label
  case 'waiting_approval':
    return props.pendingApprovalCount > 1
      ? `${STATUS_CONFIG.waiting_approval.label} (${props.pendingApprovalCount} changes)`
      : STATUS_CONFIG.waiting_approval.label
  case 'spawning_subagent':
    return props.activeSubagent
      ? `${STATUS_CONFIG.spawning_subagent.label}: ${props.activeSubagent}`
      : STATUS_CONFIG.spawning_subagent.label
  case 'planning':
    return props.currentTask
      ? `${STATUS_CONFIG.planning.label}: ${props.currentTask}`
      : STATUS_CONFIG.planning.label
  default:
    return STATUS_CONFIG[status]?.label || ''
  }
}

export const AgentStatusBar: React.FC<AgentStatusBarProps> = (props) => {
  const status = deriveStatus(props)
  const [showComplete, setShowComplete] = useState(false)
  const prevStreamingRef = useRef(props.isStreaming)
  const completeTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Detect streaming → not streaming transition to show "Complete" briefly
  useEffect(() => {
    if (prevStreamingRef.current && !props.isStreaming) {
      // Was streaming, now stopped → show Complete for 2s
      setShowComplete(true)
      console.log('[AgentStatusBar] Status → complete (streaming ended)')
      completeTimerRef.current = setTimeout(() => {
        setShowComplete(false)
        console.log('[AgentStatusBar] Complete indicator hidden')
      }, 2000)
    }
    prevStreamingRef.current = props.isStreaming
    return () => {
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current)
    }
  }, [props.isStreaming])

  // Debug log on status changes
  useEffect(() => {
    if (status !== 'idle') {
      console.log(`[AgentStatusBar] Status: ${status}`, {
        isStreaming: props.isStreaming,
        isExecutingTools: props.isExecutingTools,
        executingToolName: props.executingToolName,
        pendingApprovalCount: props.pendingApprovalCount,
        activeSubagent: props.activeSubagent
      })
    }
  }, [status, props.executingToolName, props.activeSubagent])

  // Show "Complete" briefly after streaming ends
  if (showComplete) {
    const config = STATUS_CONFIG.complete
    return (
      <div className="agent-status-bar agent-status-bar--complete" data-testid="agent-status-bar">
        <div className="agent-status-bar__content">
          <i className={`fas ${config.icon} agent-status-bar__icon`} />
          <span className="agent-status-bar__label">{config.label}</span>
        </div>
      </div>
    )
  }

  // Don't render when idle
  if (status === 'idle') return null

  const config = STATUS_CONFIG[status]
  const detail = getStatusDetail(status, props)

  return (
    <div className={`agent-status-bar agent-status-bar--${status}`} data-testid="agent-status-bar">
      <div className="agent-status-bar__content">
        <i className={`fas ${config.icon} ${config.iconClass} agent-status-bar__icon`} />
        <span className="agent-status-bar__label">{detail}</span>
        {/* Animated dots for active states */}
        {status !== 'complete' && (
          <span className="agent-status-bar__dots">
            <span className="agent-status-bar__dot" />
            <span className="agent-status-bar__dot" />
            <span className="agent-status-bar__dot" />
          </span>
        )}
      </div>
    </div>
  )
}
