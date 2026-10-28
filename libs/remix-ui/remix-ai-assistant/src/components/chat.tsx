/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import copy from 'copy-to-clipboard'
import { ChatMessage, assistantAvatar, assitantAvatarLight } from '../lib/types'
import React, { useState, SetStateAction, Dispatch } from 'react'
import { CustomTooltip } from '@remix-ui/helper'
import { normalizeMarkdown } from 'libs/remix-ui/helper/src/lib/components/remix-md-renderer'
import { QueryParams } from '@remix-project/remix-lib'
import { DAppUpdateReviewCard } from './DAppUpdateReviewCard'
import { GenerativeUIRenderer, describeUIAnswer } from './GenerativeUIRenderer'
import type { ChatPromptMetadata } from '@remix-api'
import { FileChangeGroup, splitAnswerAtChanges } from './fileChangeLines'
import { AIFileChangeRecord } from '@remix/remix-ai-core'

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
}

interface AiChatIntroProps {
  theme: string
}

const AiChatIntro: React.FC<AiChatIntroProps> = ({ theme }) => {
  return (
    <div className="assistant-landing d-flex flex-column gap-1 mx-1 align-items-center justify-content-center text-center h-100 w-100" data-id="ai-assistant-landing">
      <div className="d-flex align-items-center justify-content-center" style={{ width: '80px', height: '80px' }}>
        <img src={theme && theme.toLowerCase() === 'dark' ? assistantAvatar : assitantAvatarLight} alt="RemixAI logo" style={{ width: '48px', height: '48px' }} className="container-img" />
      </div>
      <p className="mb-4" style={{ fontSize: '0.875rem' }}>
        What do you want to build today?
      </p>
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
  handleLoadSkills
}) => {
  const [btnColor, setBtnColor] = useState('')
  const [expandedPromptIds, setExpandedPromptIds] = useState<Set<string>>(new Set())

  const togglePromptDetails = (messageId: string) => {
    setExpandedPromptIds(current => {
      const next = new Set(current)
      next.has(messageId) ? next.delete(messageId) : next.add(messageId)
      return next
    })
  }

  // The thinking indicator is not rendered in the transcript: it lives in a
  // fixed banner above the auto-accept banner (remix-ui-remix-ai-assistant),
  // so it stays in one place instead of moving with the last message.
  return (
    <div
      ref={historyRef}
      className="h-100 d-flex flex-column gap-4 overflow-y-auto border-box-sizing preserve-wrap overflow-x-hidden"
    >
      {messages.length === 0 ? (
        <AiChatIntro theme={theme} />
      ) : (
        messages.map(msg => {
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
          const hasAssistantActivity = !!(
            msg.isExecutingTools ||
            msg.activeSubagent ||
            msg.isSubagentStreaming ||
            (msg.currentTask && msg.taskStatus === 'running') ||
            (msg.todos && msg.todos.length > 0) ||
            msg.dappUpdateReview?.status === 'pending' ||
            // the thinking box lives in this bubble now, so it keeps it alive
            msg.uiComponent
          )

          if (msg.role === 'assistant' && !hasContent && !hasAssistantActivity) return null

          return (
            <div key={msg.id} className={`chat-row d-flex mb-2 gap-2 ${msg.role === 'user' ? 'justify-content-end' : ''}`} style={{ minWidth: '90%' }}>
              {/* Avatar for assistant */}
              {msg.role === 'assistant' && (

                <img
                  src={theme && theme.toLowerCase() === 'dark' ? assistantAvatar : assitantAvatarLight}
                  alt="AI"
                  className="assistant-avatar flex-shrink-0"
                />
              )}

              {/* Bubble */}
              <div data-id="ai-response-chat-bubble-section" className="overflow-y-scroll" style={{
                width: msg.role === 'assistant' ? '100%' : '90%'
              }}>
                {(msg.role === 'user' || hasContent) && (
                  <div
                    className={msg.role === 'user' ? 'chat-bubble bubble-user' : ''}
                    data-id="ai-user-chat-bubble"
                  >
                    {msg.role === 'user' && (
                      <small className="text-uppercase fw-bold text-secondary d-block mb-1">
                        You
                      </small>
                    )}

                    <div className={`aiMarkup lh-base text-wrap d-flex flex-column gap-2 ${msg.isIntermediateContent ? 'text-muted' : ''} ${msg.streamingSubagentName ? 'subagent-content' : ''}`}
                      style={msg.streamingSubagentName ? {
                        borderLeft: '3px solid rgba(23, 162, 184, 0.5)',
                        paddingLeft: '8px',
                        marginLeft: '4px'
                      } : undefined}
                    >
                      {msg.attachments?.length > 0 && (
                        // Rendered as real elements rather than through the
                        // markdown viewer: rehypeSanitize strips data: URLs.
                        // Assistant-side entries are screenshots the AI took
                        // of the IDE — shown so the user can see what was sent.
                        <div
                          className="d-flex flex-row flex-wrap gap-2 align-items-center"
                          data-id={msg.role === 'user' ? 'ai-user-attachments' : 'ai-capture-attachments'}
                        >
                          {msg.attachments.map(att => att.kind === 'image' ? (
                            <img
                              key={att.id}
                              src={att.thumbnailDataUrl || att.dataUrl}
                              alt={att.name}
                              title={att.source === 'ai-capture' ? `${att.name} — sent to the model` : att.name}
                              className="rounded"
                              data-id={att.source === 'ai-capture' ? 'ai-capture-thumbnail' : undefined}
                              style={{ maxWidth: 120, maxHeight: 120, objectFit: 'cover', border: '1px solid var(--bs-border-color)', cursor: 'pointer' }}
                              onClick={() => openImageAttachment(att.dataUrl || att.thumbnailDataUrl)}
                            />
                          ) : (
                            <span
                              key={att.id}
                              className="d-flex align-items-center gap-2 rounded px-2 py-1 small"
                              style={{ border: '1px solid var(--bs-border-color)', maxWidth: 220 }}
                              title={att.name}
                            >
                              <i className={`fas ${att.kind === 'document' ? 'fa-file-pdf' : 'fa-file-lines'} text-secondary`} style={{ fontSize: '0.8rem' }} />
                              <span className="text-truncate">{att.name}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      {msg.role !== 'user' && msg.attachments?.some(att => att.source === 'ai-capture') && (
                        <div className="text-muted small d-flex align-items-center gap-2" data-id="ai-capture-caption">
                          <i className="fas fa-camera" style={{ fontSize: '0.7rem' }} />
                          <span>Screenshot of your IDE sent to the model</span>
                        </div>
                      )}
                      {fileChanges?.length ? (
                        // The answer with lines where the agent changed files
                        splitAnswerAtChanges(displayContent, fileChanges).map((segment, index) => segment.kind === 'text'
                          ? <React.Fragment key={index}>{RemixMarkdownViewer(theme, normalizeTurnSeparators(segment.text), btnColor, setBtnColor)}</React.Fragment>
                          : <FileChangeGroup key={index} changes={segment.changes} onOpen={(change) => onOpenFileChange?.(change)} />
                        )
                      ) : msg.role === 'assistant' || msg.role === 'editor_code_analysis' ? (
                        RemixMarkdownViewer(theme, normalizeTurnSeparators(displayContent), btnColor, setBtnColor)
                      ) : (
                        <div className="ai-paragraph pb-0" style={hasCollapsiblePrompt ? { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } : undefined}>
                          {visibleUserContent}
                        </div>
                      )}
                    </div>

                    {hasCollapsiblePrompt && (
                      <button
                        type="button"
                        className="btn btn-link btn-sm p-0 mt-2 text-secondary text-decoration-none"
                        aria-expanded={isPromptExpanded}
                        onClick={() => togglePromptDetails(msg.id)}
                      >
                        <i className={`fas fa-chevron-${isPromptExpanded ? 'up' : 'down'} me-1`}></i>
                        {isPromptExpanded ? 'Hide request details' : 'Show request details'}
                      </button>
                    )}

                    {/* Copy button for user messages */}
                    {msg.role === 'user' && (
                      <div className="user-message-actions text-end mt-2">
                        <CustomTooltip tooltipText="Copy message" placement="top">
                          <span
                            role="button"
                            aria-label="copy message"
                            className="message-copy-btn"
                            onClick={() => copy(visibleUserContent)}
                            onMouseDown={(e) => e.preventDefault()}
                          >
                            <i className="far fa-copy"></i>
                          </span>
                        </CustomTooltip>
                      </div>
                    )}
                  </div>
                )}
                {msg.role === 'assistant' && msg.isExecutingTools && (
                  <div className="tool-execution-indicator text-muted">
                    <i className="fa fa-spinner fa-spin me-2"></i>
                    <span>
                      {msg.executingToolUIString || msg.executingToolName || 'Executing tools...'}
                    </span>
                  </div>
                )}

                {/* Subagent Activity Indicator - shows when subagent is active or completed */}
                {msg.role === 'assistant' && (msg.activeSubagent || msg.isSubagentStreaming || msg.streamingSubagentName) && (
                  <div className="subagent-indicator mb-2 p-2 rounded"
                  >
                    <div className="d-flex align-items-center">
                      <i className={`fa fa-robot me-2 text-ai ${msg.isSubagentStreaming ? 'fa-beat' : ''}`}></i>
                      <span className="text-ai">
                        <strong>{msg.streamingSubagentName || msg.activeSubagent || 'Subagent'}</strong>
                        {msg.isSubagentStreaming ? ' is responding...' : ''}
                      </span>
                    </div>
                  </div>
                )}

                {/* Task Activity Indicator */}
                {msg.role === 'assistant' && msg.currentTask && msg.taskStatus === 'running' && (
                  <div className="task-indicator text-secondary mb-2">
                    <i className="fa fa-tasks fa-pulse me-2"></i>
                    <span>{msg.currentTask}</span>
                  </div>
                )}

                {/* Todo List Display */}
                {msg.role === 'assistant' && msg.todos && msg.todos.length > 0 && (
                  <div className="todo-list-container mt-2 mb-2 p-2 rounded" style={{
                    backgroundColor: theme?.toLowerCase() === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                    border: '1px solid var(--bs-border-color)'
                  }}>
                    <div className="todo-list-header gap-1 d-flex align-items-center mb-2">
                      <i className="fa fa-list-check me-2 text-ai"></i>
                      <strong className="">Task Plan</strong>
                      <span className="badge bg-secondary">
                        {msg.todos.filter(t => t.status === 'completed').length}/{msg.todos.length}
                      </span>
                    </div>
                    <ul className="todo-list list-unstyled mb-0">
                      {msg.todos.map((todo, idx) => {
                        const isCurrentTodo = msg.currentTodoIndex === idx
                        return (
                          <li key={todo.id || idx} className={`todo-item d-flex align-items-start mb-1 ${isCurrentTodo ? 'fw-bold' : ''}`}>
                            <span className="todo-status me-2" style={{ width: '16px' }}>
                              {todo.status === 'completed' && <i className="fa fa-check-circle text-secondary"></i>}
                              {todo.status === 'in_progress' && <i className="fa fa-spinner fa-spin text-ai"></i>}
                              {todo.status === 'pending' && <i className="fa fa-circle text-muted" style={{ opacity: 0.4 }}></i>}
                              {todo.status === 'failed' && <i className="fa fa-times-circle text-danger"></i>}
                              {todo.status === 'stopped' && <i className="fa fa-stop-circle text-warning"></i>}
                            </span>
                            <span className={`todo-task ${todo.status === 'completed' ? 'text-secondary' : ''} ${isCurrentTodo && todo.status !== 'completed' ? 'text-ai' : ''}`}>
                              {todo.content || todo.task}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}

                {/* DApp Update Review Card */}
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

                {/* Generative UI component */}
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

                {/* Feedback buttons */}
                {msg.role === 'assistant' && hasContent && (
                  <div className="feedback text-end mt-2 me-1">
                    <CustomTooltip tooltipText="Copy message" placement="top">
                      <span
                        role="button"
                        aria-label="copy message"
                        className="message-copy-btn me-3"
                        onClick={() => copy(displayContent)}
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        <i className="far fa-copy"></i>
                      </span>
                    </CustomTooltip>

                    <CustomTooltip tooltipText="Good Response" placement="top">
                      <span
                        role="button"
                        aria-label="thumbs up"
                        className={`feedback-btn me-3 ${msg.sentiment === 'like' ? 'fas fa-thumbs-up' : 'far fa-thumbs-up'
                        }`}
                        onClick={() =>
                          recordFeedback(
                            msg.id,
                            msg.sentiment === 'like' ? 'none' : 'like'
                          )
                        }
                      ></span>
                    </CustomTooltip>
                    <CustomTooltip tooltipText="Bad Response" placement="top">
                      <span
                        role="button"
                        aria-label="thumbs down"
                        className={`feedback-btn ms-2 ${msg.sentiment === 'dislike'
                          ? 'fas fa-thumbs-down'
                          : 'far fa-thumbs-down'
                        }`}
                        onClick={() =>
                          recordFeedback(
                            msg.id,
                            msg.sentiment === 'dislike' ? 'none' : 'dislike'
                          )
                        }
                      ></span>
                    </CustomTooltip>
                  </div>
                )}
              </div>
            </div>
          )
        }) //end of messages renderconsole.log(content)
      )}
      {isStreaming && (
        <div className="text-center my-2">
          <i className="fa fa-spinner fa-spin fa-lg text-muted"></i>
        </div>
      )}
    </div>
  )
}

function RemixMarkdownViewer(theme: string, markDownContent: string, btnColor: string, setBtnColor: Dispatch<SetStateAction<string>>): React.ReactNode {
  return <ReactMarkdown
    remarkPlugins={[[remarkGfm, {}]]}
    remarkRehypeOptions={{}}
    rehypePlugins={[rehypeRaw, rehypeSanitize]}
    linkTarget="_blank"
    components={{
      // Code blocks and inline code
      code({ node, inline, className, children, ...props }) {
        const text = String(children).replace(/\n$/, '')
        const match = /language-(\w+)/.exec(className || '')
        const language = match ? match[1] : ''
        if (inline) {
          return (
            <code className="ai-inline-code" {...props}>
              {text}
            </code>
          )
        }
        return (
          <div className="ai-code-block-wrapper">
            {language && (
              <div className={`ai-code-header ${theme === 'Dark' ? 'text-white' : 'text-dark'}`}>
                <span className="ai-code-language">{language}</span>
                <button
                  type="button"
                  className={`btn btn-sm ${btnColor.length > 0 ? 'btn-outline-success border border-success' : 'btn-outline-info border border-info'}`}
                  onClick={() => {
                    setBtnColor('successfulCopy')
                    copy(text)
                    setTimeout(() => setBtnColor(''), 2000)
                  }}
                >
                  <i className="fa-regular fa-copy"></i>
                </button>
              </div>
            )}
            {!language && (
              <button
                type="button"
                className="ai-copy-btn ai-copy-btn-absolute"
                onClick={() => copy(text)}
              >
                <i className="fa-regular fa-copy"></i>
              </button>
            )}
            <pre className="ai-code-pre">
              <code className={className}>{text}</code>
            </pre>
          </div>
        )
      },
      // Paragraphs
      p: ({ node, ...props }) => (
        <p className="ai-paragraph" {...props} />
      ),
      // Headings
      h1: ({ node, ...props }) => (
        <h1 className="ai-heading ai-h1 mb-1" {...props} />
      ),
      h2: ({ node, ...props }) => (
        <h2 className="ai-heading ai-h2 mb-1" {...props} />
      ),
      h3: ({ node, ...props }) => (
        <h3 className="ai-heading ai-h3 mb-1" {...props} />
      ),
      h4: ({ node, ...props }) => (
        <h4 className="ai-heading ai-h4 mb-1" {...props} />
      ),
      h5: ({ node, ...props }) => (
        <h5 className="ai-heading ai-h5  mb-1" {...props} />
      ),
      h6: ({ node, ...props }) => (
        <h6 className="ai-heading ai-h6  mb-1" {...props} />
      ),
      // Lists
      ul: ({ node, ...props }) => (
        <ul className="ai-list ai-list-unordered" {...props} />
      ),
      ol: ({ node, ...props }) => (
        <ol className="ai-list ai-list-ordered" {...props} />
      ),
      li: ({ node, ordered, ...props }) => (
        <li className="ai-list-item" {...props} />
      ),
      // Links
      a: ({ node, ...props }) => (
        <a className="ai-link" target="_blank" rel="noopener noreferrer" {...props} />
      ),
      // Blockquotes
      blockquote: ({ node, ...props }) => (
        <blockquote className="ai-blockquote" {...props} />
      ),
      // Tables
      table: ({ node, ...props }) => (
        <div className="ai-table-wrapper">
          <table className="ai-table" {...props} />
        </div>
      ),
      thead: ({ node, ...props }) => (
        <thead className="ai-table-head" {...props} />
      ),
      tbody: ({ node, ...props }) => (
        <tbody className="ai-table-body" {...props} />
      ),
      tr: ({ node, ...props }) => (
        <tr className="ai-table-row" {...props} />
      ),
      th: ({ node, ...props }) => (
        <th className="ai-table-header-cell" {...props} />
      ),
      td: ({ node, ...props }) => (
        <td className="ai-table-cell" {...props} />
      ),
      // Horizontal rule
      hr: ({ node, ...props }) => (
        <hr className="ai-divider" {...props} />
      ),
      // Strong and emphasis
      strong: ({ node, ...props }) => (
        <strong className="ai-strong" {...props} />
      ),
      em: ({ node, ...props }) => (
        <em className="ai-emphasis" {...props} />
      )
    }}
  >
    {normalizeMarkdown(markDownContent)}
  </ReactMarkdown>
}
