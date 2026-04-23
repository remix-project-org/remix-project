/**
 * ToolCallCard — Renders a single tool call as a rich card.
 *
 * States:
 *  - pending:   spinner + tool name + args preview
 *  - completed: icon + tool name + collapsible result + elapsed time
 *  - error:     error styling + tool name
 *
 * Design: LangChain frontend docs "Tool calling" pattern adapted for Remix EventEmitter arch.
 */
import React, { useState, useEffect, useRef } from 'react'
import { ToolCallRecord } from '@remix/remix-ai-core'
import { getToolExecutionMessage } from '../lib/toolDescriptions'

// Tool category → icon mapping
const TOOL_ICONS: Record<string, string> = {
  // File operations
  file_read: 'fa-file-alt',
  file_write: 'fa-file-pen',
  file_create: 'fa-file-circle-plus',
  file_delete: 'fa-file-circle-xmark',
  file_move: 'fa-file-export',
  file_copy: 'fa-copy',
  file_exists: 'fa-file-circle-question',
  file_search: 'fa-search',
  directory_list: 'fa-folder-open',
  // Compilation
  solidity_compile: 'fa-gears',
  hardhat_compile: 'fa-gears',
  foundry_compile: 'fa-gears',
  compile_with_hardhat: 'fa-gears',
  compile_with_foundry: 'fa-gears',
  get_compilation_result: 'fa-clipboard-check',
  set_compiler_config: 'fa-sliders',
  get_compiler_config: 'fa-sliders',
  // Deployment
  deploy_contract: 'fa-rocket',
  call_contract: 'fa-phone',
  send_transaction: 'fa-paper-plane',
  run_script: 'fa-terminal',
  // Analysis
  solidity_scan: 'fa-shield-halved',
  solidity_answer: 'fa-magnifying-glass-chart',
  // Web
  web_search: 'fa-globe',
}

function getToolIcon(toolName: string): string {
  return TOOL_ICONS[toolName] || 'fa-wrench'
}

function formatElapsed(startTime: number, endTime?: number): string {
  const elapsed = (endTime || Date.now()) - startTime
  if (elapsed < 1000) return `${elapsed}ms`
  return `${(elapsed / 1000).toFixed(1)}s`
}

function truncateOutput(output: string, maxLen = 200): string {
  if (!output) return ''
  if (output.length <= maxLen) return output
  return output.substring(0, maxLen) + '…'
}

interface ToolCallCardProps {
  toolCall: ToolCallRecord
  autoCollapseDelay?: number // ms after completed to auto-collapse (0 = never)
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({ toolCall, autoCollapseDelay = 5000 }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isVisible, setIsVisible] = useState(true)
  const autoCollapseTimerRef = useRef<NodeJS.Timeout | null>(null)

  const { id, toolName, toolArgs, toolOutput, status, startTime, endTime } = toolCall

  // Friendly display message
  const displayMessage = getToolExecutionMessage({ toolName, arguments: toolArgs })
  const icon = getToolIcon(toolName)
  const elapsed = formatElapsed(startTime, endTime)

  // Auto-collapse completed cards after delay
  useEffect(() => {
    if (status === 'completed' && autoCollapseDelay > 0 && isVisible) {
      autoCollapseTimerRef.current = setTimeout(() => {
        setIsVisible(false)
        console.log(`[ToolCallCard] Auto-collapsed: ${toolName} (${id})`)
      }, autoCollapseDelay)
    }
    return () => {
      if (autoCollapseTimerRef.current) {
        clearTimeout(autoCollapseTimerRef.current)
      }
    }
  }, [status, autoCollapseDelay, toolName, id])

  // Log state transitions for debugging
  useEffect(() => {
    console.log(`[ToolCallCard] Render: ${toolName} status=${status} id=${id}`)
  }, [status, toolName, id])

  // Collapsed completed card — just a small summary line
  if (status === 'completed' && !isVisible) {
    return (
      <div
        className="tool-call-card tool-call-card--collapsed"
        data-tool-id={id}
        data-tool-status="completed"
        onClick={() => { setIsVisible(true); setIsExpanded(true) }}
        role="button"
        title="Click to expand"
      >
        <i className={`fas ${icon} tool-call-card__icon--small`} />
        <span className="tool-call-card__name--small">{toolName.replace(/_/g, ' ')}</span>
        <span className="tool-call-card__elapsed--small">{elapsed}</span>
        <i className="fas fa-check tool-call-card__check" />
      </div>
    )
  }

  return (
    <div
      className={`tool-call-card tool-call-card--${status}`}
      data-tool-id={id}
      data-tool-status={status}
    >
      {/* Header — always visible */}
      <div
        className="tool-call-card__header"
        onClick={() => status !== 'pending' && setIsExpanded(!isExpanded)}
        role={status !== 'pending' ? 'button' : undefined}
      >
        {/* Status icon */}
        <span className="tool-call-card__status-icon">
          {status === 'pending' && <i className="fa fa-spinner fa-spin" />}
          {status === 'completed' && <i className="fas fa-check-circle text-success" />}
          {status === 'error' && <i className="fas fa-exclamation-circle text-danger" />}
        </span>

        {/* Tool icon + name */}
        <i className={`fas ${icon} tool-call-card__icon`} />
        <span className="tool-call-card__name">{displayMessage}</span>

        {/* Right side: elapsed time + chevron */}
        <span className="tool-call-card__right">
          <span className="tool-call-card__elapsed">{elapsed}</span>
          {status !== 'pending' && (
            <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'} tool-call-card__chevron`} />
          )}
        </span>
      </div>

      {/* Expanded body */}
      {isExpanded && (
        <div className="tool-call-card__body">
          {/* Arguments */}
          {toolArgs && Object.keys(toolArgs).length > 0 && (
            <div className="tool-call-card__section">
              <span className="tool-call-card__label">Arguments</span>
              <pre className="tool-call-card__json">{JSON.stringify(toolArgs, null, 2)}</pre>
            </div>
          )}

          {/* Output (completed only) */}
          {status === 'completed' && toolOutput && (
            <div className="tool-call-card__section">
              <span className="tool-call-card__label">Result</span>
              <pre className="tool-call-card__json">{truncateOutput(toolOutput, 500)}</pre>
            </div>
          )}

          {/* Error state message */}
          {status === 'error' && (
            <div className="tool-call-card__section tool-call-card__error-msg">
              <i className="fas fa-exclamation-triangle me-1" />
              Tool execution was interrupted
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * ToolCallList — Renders all tool calls for a message.
 * Groups pending on top, completed below.
 */
interface ToolCallListProps {
  toolCalls: ToolCallRecord[]
}

export const ToolCallList: React.FC<ToolCallListProps> = ({ toolCalls }) => {
  if (!toolCalls || toolCalls.length === 0) return null

  const pending = toolCalls.filter(tc => tc.status === 'pending')
  const completed = toolCalls.filter(tc => tc.status === 'completed')
  const errored = toolCalls.filter(tc => tc.status === 'error')

  return (
    <div className="tool-call-list" data-testid="tool-call-list">
      {pending.map(tc => (
        <ToolCallCard key={tc.id} toolCall={tc} />
      ))}
      {completed.map(tc => (
        <ToolCallCard key={tc.id} toolCall={tc} />
      ))}
      {errored.map(tc => (
        <ToolCallCard key={tc.id} toolCall={tc} autoCollapseDelay={0} />
      ))}
    </div>
  )
}
