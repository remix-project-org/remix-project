/**
 * ThinkingBubble — Displays agent's reasoning/thinking content in a collapsible bubble.
 *
 * Purely presentational — reads thinkingContent from props and renders.
 * - While streaming: shows as expandable "Thinking..." indicator
 * - After streaming: collapses into a small toggleable pill
 * - Click to expand/collapse the full reasoning text
 *
 */
import React, { useState, useRef, useEffect } from 'react'

interface ThinkingBubbleProps {
  /** The accumulated thinking/reasoning text */
  thinkingContent: string
  /** Whether the response is still streaming */
  isStreaming: boolean
}

export const ThinkingBubble: React.FC<ThinkingBubbleProps> = ({ thinkingContent, isStreaming }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  // Auto-collapse when streaming ends
  useEffect(() => {
    if (!isStreaming && isExpanded) {
      setIsExpanded(false)
    }
  }, [isStreaming])

  if (!thinkingContent) return null

  const previewText = thinkingContent.length > 120
    ? thinkingContent.substring(0, 120) + '...'
    : thinkingContent

  return (
    <div className="thinking-bubble" data-testid="thinking-bubble">
      {/* Collapsed pill — always visible */}
      <button
        className={`thinking-bubble__toggle ${isExpanded ? 'thinking-bubble__toggle--expanded' : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
        type="button"
      >
        <i className={`fas fa-brain thinking-bubble__icon ${isStreaming ? 'fa-beat-fade' : ''}`} />
        <span className="thinking-bubble__label">
          {isStreaming ? 'Thinking...' : 'View reasoning'}
        </span>
        {!isStreaming && (
          <span className="thinking-bubble__length">
            ({Math.ceil(thinkingContent.length / 100)} blocks)
          </span>
        )}
        <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'} thinking-bubble__chevron`} />
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="thinking-bubble__content" ref={contentRef}>
          <pre className="thinking-bubble__text">{thinkingContent}</pre>
        </div>
      )}

      {/* Preview when collapsed and not streaming */}
      {!isExpanded && !isStreaming && thinkingContent.length > 0 && (
        <div
          className="thinking-bubble__preview"
          onClick={() => setIsExpanded(true)}
        >
          {previewText}
        </div>
      )}
    </div>
  )
}
