/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import copy from 'copy-to-clipboard'
import { ChatMessage, assistantAvatar, assitantAvatarLight } from '../lib/types'
import React, { useState, useEffect } from 'react'
import { CustomTooltip } from '@remix-ui/helper'
import {
  sampleConversationStarters,
  type ConversationStarter
} from '../lib/conversationStarters'
import { normalizeMarkdown } from 'libs/remix-ui/helper/src/lib/components/remix-md-renderer'
import { getToolExecutionMessage } from '../lib/toolDescriptions'
import { QueryParams } from '@remix-project/remix-lib'
import { AiChatButtons } from './aichatButtons'

// ChatHistory component
export interface ChatHistoryComponentProps {
  messages: ChatMessage[]
  isStreaming: boolean
  sendPrompt: (prompt: string) => void
  recordFeedback: (msgId: string, next: 'like' | 'dislike' | 'none') => void
  historyRef: React.RefObject<HTMLDivElement>
  theme: any
  plugin?: any
  handleGenerateWorkspace: () => void
  allowedMcps: string[]
}

interface AiChatIntroProps {
  sendPrompt: (prompt: string) => void
  theme: string
  plugin?: any
  handleGenerateWorkspace: () => void
  allowedMcps: string[]
}

const AiChatIntro: React.FC<AiChatIntroProps> = ({ sendPrompt, theme, plugin, handleGenerateWorkspace, allowedMcps }) => {
  const [conversationStarters, setConversationStarters] = useState<ConversationStarter[]>([])

  useEffect(() => {
    // Sample new conversation starters when component mounts
    // Use MCP starters only if experimental flag is set
    const starters = sampleConversationStarters(true)
    setConversationStarters(starters)
  }, [])

  return (
    <div className="assistant-landing d-flex flex-column mx-1 align-items-center justify-content-center text-center h-100 w-100" data-id="ai-assistant-landing">
      <div className="d-flex align-items-center justify-content-center rounded-circle border mb-3" style={{ width: '120px', height: '120px', borderWidth: '2px', borderColor: 'var(--bs-border-color)' }}>
        <img src={theme && theme.toLowerCase() === 'dark' ? assistantAvatar : assitantAvatarLight} alt="RemixAI logo" style={{ width: '60px', height: '60px' }} className="container-img" />
      </div>
      <p className="mb-4" style={{ fontSize: '0.9rem' }}>
        What do you want to build today?
      </p>
      <AiChatButtons theme={theme} plugin={plugin} sendPrompt={sendPrompt} handleGenerateWorkspace={handleGenerateWorkspace} allowedMcps={allowedMcps} />
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
  allowedMcps
}) => {
  return (
    <div
      ref={historyRef}
      className="d-flex flex-column overflow-y-auto border-box-sizing preserve-wrap overflow-x-hidden"
    >
      {messages.length === 0 ? (
        <AiChatIntro sendPrompt={sendPrompt} theme={theme} plugin={plugin} handleGenerateWorkspace={handleGenerateWorkspace} allowedMcps={allowedMcps} />
      ) : (
        messages.map(msg => {
          const bubbleClass =
            msg.role === 'user' ? 'bubble-user' : 'bubble-assistant'

          return (
            <div key={msg.id} className={`chat-row d-flex mb-2 ${msg.role === 'user' ? 'justify-content-end' : ''}`} style={{ minWidth: '90%' }}>
              {/* Avatar for assistant */}
              {msg.role === 'assistant' && (
                <img
                  src={theme && theme.toLowerCase() === 'dark' ? assistantAvatar : assitantAvatarLight}
                  alt="AI"
                  className="assistant-avatar me-2 flex-shrink-0 me-1"
                />
              )}

              {/* Bubble */}
              <div data-id="ai-response-chat-bubble-section" className={`overflow-y-scroll ${msg.role === 'assistant' ? 'me-3' : ''}`} style={{
                width: '90%'
              }}>
                {/* Only render bubble if there's content OR not currently executing tools */}
                {(msg.content || !msg.isExecutingTools) && (
                  <div
                    className={`chat-bubble p-2 rounded ${bubbleClass}`}
                    data-id="ai-user-chat-bubble"
                  >
                    {msg.role === 'user' && (
                      <small className="text-uppercase fw-bold text-secondary d-block mb-1">
                        You
                      </small>
                    )}

                    <div className={`aiMarkup lh-base text-wrap ${msg.isIntermediateContent ? 'text-muted' : ''}`}>
                      {msg.role === 'assistant' ? (
                        RemixMarkdownViewer(theme, msg.content ?? '')
                      ) : (
                        <div className="ai-paragraph pb-0">
                          {msg.content}
                        </div>
                      )}
                    </div>

                    {/* Copy button for user messages */}
                    {msg.role === 'user' && (
                      <div className="user-message-actions text-end mt-2">
                        <CustomTooltip tooltipText="Copy message" placement="top">
                          <span
                            role="button"
                            aria-label="copy message"
                            className="message-copy-btn"
                            onClick={() => copy(msg.content)}
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
                      {msg.executingToolName
                        ? getToolExecutionMessage({
                          toolName: msg.executingToolName,
                          arguments: msg.executingToolArgs
                        })
                        : 'Executing tools...'}
                    </span>
                  </div>
                )}

                {/* Subagent Activity Indicator */}
                {msg.role === 'assistant' && msg.activeSubagent && (
                  <div className="subagent-indicator text-info small mb-2">
                    <i className="fa fa-robot fa-spin me-2"></i>
                    <span><strong>{msg.activeSubagent}</strong>: {msg.subagentTask}</span>
                  </div>
                )}

                {/* Task Activity Indicator */}
                {msg.role === 'assistant' && msg.currentTask && msg.taskStatus === 'running' && (
                  <div className="task-indicator text-secondary small mb-2">
                    <i className="fa fa-tasks fa-pulse me-2"></i>
                    <span>{msg.currentTask}</span>
                  </div>
                )}

                {/* Feedback buttons */}
                {msg.role === 'assistant' && (
                  <div className="feedback text-end mt-2 me-1">
                    <CustomTooltip tooltipText="Copy message" placement="top">
                      <span
                        role="button"
                        aria-label="copy message"
                        className="message-copy-btn me-3"
                        onClick={() => copy(msg.content)}
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

function RemixMarkdownViewer(theme: string, markDownContent: string): React.ReactNode {
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
                  className="btn btn-sm btn-outline-info border border-info"
                  onClick={() => copy(text)}
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
        <h1 className="ai-heading ai-h1 fs-5 mb-1" {...props} />
      ),
      h2: ({ node, ...props }) => (
        <h2 className="ai-heading ai-h2 fs-5 mb-1" {...props} />
      ),
      h3: ({ node, ...props }) => (
        <h3 className="ai-heading ai-h3 fs-5 mb-1" {...props} />
      ),
      h4: ({ node, ...props }) => (
        <h4 className="ai-heading ai-h4 fs-6 mb-1" {...props} />
      ),
      h5: ({ node, ...props }) => (
        <h5 className="ai-heading ai-h5 fs-6 mb-1" {...props} />
      ),
      h6: ({ node, ...props }) => (
        <h6 className="ai-heading ai-h6 fs-6 mb-1" {...props} />
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

