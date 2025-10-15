import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import copy from 'copy-to-clipboard'
import { ChatMessage, assistantAvatar } from '../lib/types'
import React, { useState, useEffect } from 'react'
import { CustomTooltip } from '@remix-ui/helper'
import {
  sampleConversationStarters,
  type ConversationStarter
} from '../lib/conversationStarters'

// ChatHistory component
export interface ChatHistoryComponentProps {
  messages: ChatMessage[]
  isStreaming: boolean
  sendPrompt: (prompt: string) => void
  recordFeedback: (msgId: string, next: 'like' | 'dislike' | 'none') => void
  historyRef: React.RefObject<HTMLDivElement>
  theme: string
}

interface AiChatIntroProps {
  sendPrompt: (prompt: string) => void
}

export function normalizeMarkdown(input: string): string {
  return input
    .trim()
    .replace(/\n{2,}/g, "\n\n")
    .replace(/[ \t]+$/gm, "");
}

const AiChatIntro: React.FC<AiChatIntroProps> = ({ sendPrompt }) => {
  const [conversationStarters, setConversationStarters] = useState<ConversationStarter[]>([])

  useEffect(() => {
    // Sample new conversation starters when component mounts
    const starters = sampleConversationStarters()
    setConversationStarters(starters)
  }, [])

  const refreshStarters = () => {
    const newStarters = sampleConversationStarters()
    setConversationStarters(newStarters)
  }

  return (
    <div className="assistant-landing d-flex flex-column mx-1 align-items-center justify-content-center text-center h-100 w-100">
      <img src={assistantAvatar} alt="RemixAI logo" style={{ width: '120px' }} className="mb-3 container-img" />
      <h5 className="mb-2">RemixAI</h5>
      <p className="mb-4" style={{ fontSize: '0.9rem' }}>
        RemixAI provides you personalized guidance as you build. It can break down concepts,
        answer questions about blockchain technology and assist you with your smart contracts.
      </p>
      {/* Dynamic Conversation Starters */}
      <div className="d-flex flex-column mt-3" style={{ maxWidth: '400px' }}>
        {conversationStarters.map((starter, index) => (
          <button
            key={`${starter.level}-${index}`}
            data-id={`remix-ai-assistant-starter-${starter.level}-${index}`}
            className="btn btn-secondary mb-2 w-100 text-start"
            onClick={() => sendPrompt(starter.question)}
          >
            {starter.question}
          </button>
        ))}
      </div>
    </div>
  )
}

const content = []

export const ChatHistoryComponent: React.FC<ChatHistoryComponentProps> = ({
  messages,
  isStreaming,
  sendPrompt,
  recordFeedback,
  historyRef,
  theme
}) => {
  return (
    <div
      ref={historyRef}
      className="d-flex flex-column overflow-y-auto border-box-sizing preserve-wrap overflow-x-hidden"
    >
      {messages.length === 0 ? (
        <AiChatIntro sendPrompt={sendPrompt} />
      ) : (
        messages.map(msg => {
          const bubbleClass =
            msg.role === 'user' ? 'bubble-user bg-light' : 'bubble-assistant bg-light'

          return (
            <div key={msg.id} className="chat-row d-flex mb-2" style={{ minWidth: '90%' }}>
              {/* Avatar for assistant */}
              {msg.role === 'assistant' && (
                <img
                  src={assistantAvatar}
                  alt="AI"
                  className="assistant-avatar me-2 flex-shrink-0 me-1"
                />
              )}

              {/* Bubble */}
              <div data-id="ai-response-chat-bubble-section" className="overflow-y-scroll" style={{ width: '90%' }}>
                <div className={`chat-bubble p-2 rounded ${bubbleClass}`} data-id="ai-user-chat-bubble">
                  {msg.role === 'user' && (
                    <small className="text-uppercase fw-bold text-secondary d-block mb-1">
                      You
                    </small>
                  )}

                  <div className="aiMarkup lh-base text-wrap">
                    {msg.role === 'assistant' ? (
                      <ReactMarkdown
                        remarkPlugins={[[remarkGfm, { }]]}
                        remarkRehypeOptions={{
                        }}
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
                                      title="Copy code"
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
                                    title="Copy code"
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
                          li: ({ node, ...props }) => (
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
                        {normalizeMarkdown(msg.content)}
                      </ReactMarkdown>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>

                {/* Feedback buttons */}
                {msg.role === 'assistant' && (
                  <div className="feedback text-end mt-2 me-1">
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

