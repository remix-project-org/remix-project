/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import copy from 'copy-to-clipboard'
import { ChatMessage, assistantAvatar, assitantAvatarLight } from '../lib/types'
import React, { useState } from 'react'
import { CustomTooltip } from '@remix-ui/helper'
import { DAppUpdateReviewCard } from './DAppUpdateReviewCard'
import { GenerativeUIRenderer, describeUIAnswer } from './GenerativeUIRenderer'
import type { ChatPromptMetadata } from '@remix-api'
import { FileChangeGroup, splitAnswerAtChanges } from './fileChangeLines'
import { AIFileChangeRecord } from '@remix/remix-ai-core'
import { AiMarkdown } from './aiMarkdown'

/** Content with the streaming turn separators (`---`) and whitespace removed. */
const stripTurnSeparators = (content: string): string =>
  content.replace(/^[ \t]*-{3,}[ \t]*$/gm, '').trim()

const normalizeTurnSeparators = (content: string): string =>
  content
    .replace(/(?:^[ \t]*-{3,}[ \t]*\n\s*)+/, '')
    .replace(/(?:\n\s*[ \t]*-{3,}[ \t]*)+$/, '')
    .replace(/(?:\n\s*-{3,}[ \t]*){2,}\n/g, '\n\n---\n')

/**
 * Opens an attachment image in a new tab.
 * Browsers block top-level navigation to `data:` URLs (the tab just stays
 * blank), so the data URL is turned into a same-origin blob URL first.
 */
const openImageAttachment = (dataUrl?: string) => {
  if (!dataUrl) return
  if (!dataUrl.startsWith('data:')) {
    window.open(dataUrl, '_blank', 'noopener,noreferrer')
    return
  }
  try {
    const [header, base64] = dataUrl.split(',')
    const mime = /data:([^;,]+)/.exec(header)?.[1] || 'image/png'
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
    const win = window.open(url, '_blank', 'noopener,noreferrer')
    // Revoking immediately would cancel the load in the new tab; give it time.
    setTimeout(() => URL.revokeObjectURL(url), 60000)
    if (!win) URL.revokeObjectURL(url)
  } catch (e) {
    console.error('[RemixAI] could not open attachment', e)
  }
}

// ChatHistory component
export interface ChatHistoryComponentProps {
  messages: ChatMessage[]
  isStreaming: boolean
  sendPrompt: (prompt: string, isEditorCodeAnalysis?: boolean, metadata?: ChatPromptMetadata) => void
  recordFeedback: (msgId: string, next: 'like' | 'dislike' | 'none') => void
  historyRef: React.RefObject<HTMLDivElement>
  theme: any
  plugin?: any
  handleGenerateWorkspace: () => void
  handleLoadSkills: () => void
  allowedMcps: string[]
  /** Marks a rendered component as answered so it stops accepting clicks. */
  onUiComponentAnswered?: (msgId: string) => void
  /** DApp update review handlers */
  onDappReviewAcceptAll?: (msgId: string) => void
  onDappReviewRevertAll?: (msgId: string) => void
  onDappReviewViewDiff?: (filePath: string, newContent: string, oldContent: string) => void
  /** File changes the agent made, per assistant message, in order */
  fileChangesByMessage?: Record<string, AIFileChangeRecord[]>
  onOpenFileChange?: (change: AIFileChangeRecord) => void
  /** The thinking indicator, held for a minimum dwell by the parent. */
  showThinking?: boolean
  /** Tool calls waiting for the user's decision: the answer waits instead of thinking */
  pendingApprovalCount?: number
}

interface AiChatIntroProps {
  theme: string
}

const AiChatIntro: React.FC<AiChatIntroProps> = ({ theme }) => {
  return (
    <div className="assistant-landing d-flex flex-column gap-1 mx-1 align-items-center text-center h-100 w-100" data-id="ai-assistant-landing">
      <div className="d-flex align-items-center justify-content-center" style={{ width: '80px', height: '80px' }}>
        <img src={theme && theme.toLowerCase() === 'dark' ? assistantAvatar : assitantAvatarLight} alt="RemixAI logo" style={{ width: '48px', height: '48px' }} className="container-img" />
      </div>
      <p className="mb-4" style={{ fontSize: '0.875rem' }}>
        What do you want to build today?
      </p>
    </div>
  )
}

/** Copy icon that turns into a check for a moment once copied. */
const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false)
  return (
    <CustomTooltip tooltipText={copied ? 'Copied' : 'Copy message'} placement="top">
      <button
        type="button"
        className="ai-icon-btn"
        aria-label="copy message"
        data-id="ai-copy-message"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          copy(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        <i className={copied ? 'fas fa-check' : 'far fa-copy'}></i>
      </button>
    </CustomTooltip>
  )
}

const ThinkingDots = () => (
  <div className="ai-thinking" data-id="remix-ai-thinking" aria-label="Thinking">
    <span></span><span></span><span></span>
  </div>
)

const WaitingForApproval: React.FC<{ count: number }> = ({ count }) => (
  <div className="ai-waiting" data-id="ai-waiting-approval">
    <span className="ai-waiting-dot"></span>
    {count > 1 ? `Waiting for your approval on ${count} changes` : 'Waiting for your approval'}
  </div>
)

const AssistantHead: React.FC<{ theme: string }> = ({ theme }) => (
  <div className="ai-turn-head">
    <img src={theme && theme.toLowerCase() === 'dark' ? assistantAvatar : assitantAvatarLight} alt="RemixAI" className="ai-turn-icon" />
  </div>
)

/**
 * What the agent is doing. While the answer streams: one line per tool step,
 * plus the running task and subagent. Once done: a single "Used N tools" line
 * that opens the list.
 */
const AgentActivity: React.FC<{ msg: ChatMessage, live: boolean }> = ({ msg, live }) => {
  const [open, setOpen] = useState(false)
  const allSteps = msg.toolSteps ?? []

  if (live) {
    const steps = allSteps
    const lines: { label: string, state: 'done' | 'failed' | 'live' }[] = steps.map(step => ({
      label: step.label,
      state: step.status === 'running' ? 'live' : step.status
    }))
    // Tool signals that don't come with steps (e.g. the plain chat route)
    if (msg.isExecutingTools && !steps.some(step => step.status === 'running')) {
      lines.push({ label: msg.executingToolUIString || msg.executingToolName || 'Executing tools...', state: 'live' })
    }
    if (msg.currentTask && msg.taskStatus === 'running') lines.push({ label: msg.currentTask, state: 'live' })
    if (msg.activeSubagent || msg.isSubagentStreaming) {
      const name = msg.streamingSubagentName || msg.activeSubagent || 'Subagent'
      lines.push({ label: msg.isSubagentStreaming ? `${name} is responding…` : name, state: 'live' })
    }
    if (lines.length === 0) return null
    return (
      <div className="ai-activity" data-id="ai-activity">
        {lines.map((line, i) => (
          <div key={i} className={`ai-activity-line is-${line.state}`}>
            <i className={line.state === 'live' ? 'fas fa-circle-notch fa-spin' : line.state === 'failed' ? 'fas fa-xmark' : 'fas fa-check'}></i>
            <span>{line.label}</span>
          </div>
        ))}
      </div>
    )
  }

  // The user's decisions stay visible; the tools fold into one line
  const steps = allSteps.filter(step => step.kind !== 'decision')
  const decisions = allSteps.filter(step => step.kind === 'decision')
  if (steps.length === 0 && decisions.length === 0) return null
  return (
    <div className="ai-activity" data-id="ai-activity">
      {steps.length > 0 && (
        <button type="button" className="ai-activity-line ai-activity-toggle" aria-expanded={open} onClick={() => setOpen(!open)} data-id="ai-activity-toggle">
          <i className="fas fa-check"></i>
          <span>Used {steps.length} {steps.length === 1 ? 'tool' : 'tools'}</span>
          <i className={`fas fa-chevron-${open ? 'down' : 'right'} ai-activity-chevron`}></i>
        </button>
      )}
      {open && steps.map((step, i) => (
        <div key={i} className="ai-activity-line ai-activity-sub">
          <span>{step.label}</span>
        </div>
      ))}
      {decisions.map((step, i) => (
        <div key={`decision-${i}`} className="ai-activity-line" data-id="ai-approval-decision">
          <i className={step.status === 'failed' ? 'fas fa-xmark' : 'fas fa-check'}></i>
          <span>{step.label}</span>
        </div>
      ))}
    </div>
  )
}

const PLAN_ICONS: Record<string, string> = {
  completed: 'fas fa-check',
  in_progress: 'fas fa-circle-notch fa-spin',
  pending: 'far fa-circle',
  failed: 'fas fa-circle-xmark',
  stopped: 'fas fa-circle-stop'
}

/** The agent's task plan (write_todos). */
const TaskPlan: React.FC<{ todos: NonNullable<ChatMessage['todos']> }> = ({ todos }) => {
  const done = todos.filter(t => t.status === 'completed').length
  return (
    <div className="ai-plan" data-id="ai-plan">
      <div className="ai-plan-head">
        <span>Plan</span>
        <span className="ai-plan-count">{done} of {todos.length} done</span>
      </div>
      {todos.map((todo, idx) => (
        <div key={todo.id || idx} className={`ai-plan-item is-${todo.status}`}>
          <i className={PLAN_ICONS[todo.status]}></i>
          <span>{todo.content || todo.task}</span>
        </div>
      ))}
    </div>
  )
}

export const ChatHistoryComponent: React.FC<ChatHistoryComponentProps> = ({
  messages,
  isStreaming,
  sendPrompt,
  recordFeedback,
  historyRef,
  theme,
  plugin,
  handleGenerateWorkspace,
  allowedMcps,
  onDappReviewAcceptAll,
  onDappReviewRevertAll,
  onDappReviewViewDiff,
  fileChangesByMessage,
  onOpenFileChange,
  onUiComponentAnswered,
  handleLoadSkills,
  showThinking = false,
  pendingApprovalCount = 0
}) => {
  const [expandedPromptIds, setExpandedPromptIds] = useState<Set<string>>(new Set())

  const togglePromptDetails = (messageId: string) => {
    setExpandedPromptIds(current => {
      const next = new Set(current)
      next.has(messageId) ? next.delete(messageId) : next.add(messageId)
      return next
    })
  }

  // The thinking dots sit at the end of the streaming answer. Before that
  // answer exists (the last turn is still the user's) they get a turn of their own.
  const lastMessage = messages[messages.length - 1]
  const waitingForAnswer = (isStreaming || showThinking) && lastMessage?.role === 'user'

  return (
    <div
      ref={historyRef}
      className="ai-transcript h-100 d-flex flex-column overflow-y-auto border-box-sizing overflow-x-hidden"
    >
      {messages.length === 0 ? (
        <AiChatIntro theme={theme} />
      ) : (
        messages.map((msg, index) => {
          const isLast = index === messages.length - 1
          const isCorrupted = msg.role === 'assistant' && (msg.content === null || msg.content === undefined)
          const displayContent = isCorrupted ? '*Unable to load response.*' : (msg.content ?? '')
          const hasCollapsiblePrompt = msg.role === 'user' && !!msg.displayContent && msg.displayContent !== msg.content
          const isPromptExpanded = hasCollapsiblePrompt && expandedPromptIds.has(msg.id)
          const visibleUserContent = hasCollapsiblePrompt && !isPromptExpanded ? msg.displayContent : msg.content
          // A turn that only reasoned and called tools leaves nothing but the
          // `---` turn separators behind; that rendered as a bubble of bare
          // horizontal rules. Separators alone are not content.
          const fileChanges = msg.role === 'assistant' ? fileChangesByMessage?.[msg.id] : undefined
          const hasContent = (typeof displayContent === 'string' && stripTurnSeparators(displayContent).length > 0) || !!fileChanges?.length
          // The answer being written right now (subagent bubbles stream before the last one)
          const isLive = isStreaming && msg.role === 'assistant' && (isLast || !!msg.isExecutingTools || !!msg.isSubagentStreaming)
          const hasAssistantActivity = !!(
            isLive ||
            msg.isExecutingTools ||
            msg.activeSubagent ||
            msg.isSubagentStreaming ||
            (msg.currentTask && msg.taskStatus === 'running') ||
            (msg.todos && msg.todos.length > 0) ||
            msg.dappUpdateReview?.status === 'pending' ||
            msg.uiComponent ||
            msg.error ||
            msg.stopped ||
            msg.toolSteps?.some(step => step.kind === 'decision')
          )

          if (msg.role === 'assistant' && !hasContent && !hasAssistantActivity) return null

          const attachments = msg.attachments?.length > 0 && (
            // Rendered as real elements rather than through the markdown
            // viewer: rehypeSanitize strips data: URLs. Assistant-side entries
            // are screenshots the AI took of the IDE — shown so the user can
            // see what was sent.
            <div
              className="ai-turn-attachments"
              data-id={msg.role === 'user' ? 'ai-user-attachments' : 'ai-capture-attachments'}
            >
              {msg.attachments.map(att => att.kind === 'image' ? (
                <img
                  key={att.id}
                  src={att.thumbnailDataUrl || att.dataUrl}
                  alt={att.name}
                  title={att.source === 'ai-capture' ? `${att.name} — sent to the model` : att.name}
                  className="ai-attachment-thumb"
                  data-id={att.source === 'ai-capture' ? 'ai-capture-thumbnail' : undefined}
                  onClick={() => openImageAttachment(att.dataUrl || att.thumbnailDataUrl)}
                />
              ) : (
                <span key={att.id} className="ai-attachment-file" title={att.name}>
                  <i className={`fas ${att.kind === 'document' ? 'fa-file-pdf' : 'fa-file-lines'}`} />
                  <span className="text-truncate">{att.name}</span>
                </span>
              ))}
            </div>
          )

          if (msg.role === 'user') {
            return (
              <div key={msg.id} className="ai-turn-user" data-id="ai-response-chat-bubble-section">
                {attachments}
                <div className="chat-bubble bubble-user ai-bubble" data-id="ai-user-chat-bubble">
                  {visibleUserContent}
                </div>
                {hasCollapsiblePrompt && (
                  <button
                    type="button"
                    className="ai-request-toggle"
                    aria-expanded={isPromptExpanded}
                    onClick={() => togglePromptDetails(msg.id)}
                  >
                    <i className={`fas fa-chevron-${isPromptExpanded ? 'up' : 'down'} me-1`}></i>
                    {isPromptExpanded ? 'Hide request details' : 'Show request details'}
                  </button>
                )}
                <div className="ai-user-actions">
                  <CopyButton text={visibleUserContent} />
                </div>
              </div>
            )
          }

          return (
            <div key={msg.id} className="ai-turn-ai" data-id="ai-response-chat-bubble-section">
              {msg.role === 'assistant' && <AssistantHead theme={theme} />}
              <div className="ai-turn-body">
                {/* Finished: "Used N tools" above the answer. Live: under it, next to the dots. */}
                {msg.role === 'assistant' && !isLive && <AgentActivity msg={msg} live={false} />}
                {msg.role === 'assistant' && msg.todos && msg.todos.length > 0 && <TaskPlan todos={msg.todos} />}
                {attachments}
                {msg.attachments?.some(att => att.source === 'ai-capture') && (
                  <div className="ai-capture-caption" data-id="ai-capture-caption">
                    <i className="fas fa-camera" />
                    <span>Screenshot of your IDE sent to the model</span>
                  </div>
                )}
                {hasContent && (
                  <div
                    className={`chat-bubble bubble-assistant ai-answer ${msg.isIntermediateContent || msg.streamingSubagentName ? 'is-muted' : ''}`}
                    data-id="ai-user-chat-bubble"
                  >
                    {fileChanges?.length
                      // The answer with lines where the agent changed files
                      ? splitAnswerAtChanges(displayContent, fileChanges).map((segment, i) => segment.kind === 'text'
                        ? <AiMarkdown key={i} content={normalizeTurnSeparators(segment.text)} />
                        : <FileChangeGroup key={i} changes={segment.changes} onOpen={(change) => onOpenFileChange?.(change)} />
                      )
                      : <AiMarkdown content={normalizeTurnSeparators(displayContent)} />}
                  </div>
                )}

                {msg.role === 'assistant' && msg.dappUpdateReview && (
                  <DAppUpdateReviewCard
                    workspaceName={msg.dappUpdateReview.workspaceName}
                    files={msg.dappUpdateReview.files}
                    backups={msg.dappUpdateReview.backups}
                    status={msg.dappUpdateReview.status}
                    onAcceptAll={() => onDappReviewAcceptAll?.(msg.id)}
                    onRevertAll={() => onDappReviewRevertAll?.(msg.id)}
                    onViewDiff={(filePath, newContent, oldContent) =>
                      onDappReviewViewDiff?.(filePath, newContent, oldContent)
                    }
                  />
                )}

                {msg.role === 'assistant' && msg.uiComponent && (
                  // Answered or superseded components stay visible for the
                  // record but stop accepting clicks: re-answering one would
                  // send the model back into an exchange it has finished.
                  <div
                    className={msg.uiComponentStale ? 'generative-ui-spent' : undefined}
                    aria-disabled={msg.uiComponentStale || undefined}
                    data-id={msg.uiComponentStale ? 'ai-ui-component-spent' : 'ai-ui-component'}
                  >
                    <GenerativeUIRenderer
                      payload={msg.uiComponent}
                      onAction={(action, data) => {
                        if (msg.uiComponentStale) return
                        const text = data && Object.keys(data).length > 0
                          ? `[ui:${action}]\n${JSON.stringify(data, null, 2)}`
                          : `[ui:${action}]`
                        onUiComponentAnswered?.(msg.id)
                        // The model needs the raw action; the user sees what they picked
                        sendPrompt(text, false, { source: 'user', displayText: describeUIAnswer(msg.uiComponent, action, data) })
                      }}
                    />
                  </div>
                )}

                {msg.role === 'assistant' && msg.error && (
                  <div className="ai-answer-error" data-id="ai-answer-error">
                    <i className="fas fa-exclamation-circle"></i>
                    <span>{msg.error}</span>
                  </div>
                )}

                {msg.role === 'assistant' && msg.stopped && (
                  <div className="ai-answer-stopped" data-id="ai-answer-stopped">
                    <i className="fas fa-stop"></i>
                    Stopped
                  </div>
                )}

                {msg.role === 'assistant' && isLive && <AgentActivity msg={msg} live />}

                {isLast && (isLive || showThinking) && (pendingApprovalCount > 0 ? <WaitingForApproval count={pendingApprovalCount} /> : <ThinkingDots />)}

                {msg.role === 'assistant' && hasContent && !isLive && (
                  <div className="ai-answer-actions">
                    <CopyButton text={displayContent} />
                    <CustomTooltip tooltipText="Good response" placement="top">
                      <button
                        type="button"
                        aria-label="thumbs up"
                        className={`ai-icon-btn ${msg.sentiment === 'like' ? 'on' : ''}`}
                        onClick={() => recordFeedback(msg.id, msg.sentiment === 'like' ? 'none' : 'like')}
                      >
                        <i className={`${msg.sentiment === 'like' ? 'fas' : 'far'} fa-thumbs-up`}></i>
                      </button>
                    </CustomTooltip>
                    <CustomTooltip tooltipText="Bad response" placement="top">
                      <button
                        type="button"
                        aria-label="thumbs down"
                        className={`ai-icon-btn ${msg.sentiment === 'dislike' ? 'on' : ''}`}
                        onClick={() => recordFeedback(msg.id, msg.sentiment === 'dislike' ? 'none' : 'dislike')}
                      >
                        <i className={`${msg.sentiment === 'dislike' ? 'fas' : 'far'} fa-thumbs-down`}></i>
                      </button>
                    </CustomTooltip>
                  </div>
                )}
              </div>
            </div>
          )
        })
      )}
      {waitingForAnswer && (
        <div className="ai-turn-ai">
          <AssistantHead theme={theme} />
          {pendingApprovalCount > 0 ? <WaitingForApproval count={pendingApprovalCount} /> : <ThinkingDots />}
        </div>
      )}
    </div>
  )
}
