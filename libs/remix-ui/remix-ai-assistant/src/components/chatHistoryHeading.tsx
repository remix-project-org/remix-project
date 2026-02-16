import { CustomTooltip } from '@remix-ui/helper'
import React, { useEffect, useState } from 'react'

interface ChatHistoryHeadingProps {
  onNewChat: () => void
  onToggleHistory: () => void
  showHistorySidebar: boolean
  archiveChat: (id: string) => void
  currentConversationId?: string | null
  showButton: boolean
  setShowButton: (show: boolean) => void
}

export default function ChatHistoryHeading({
  onNewChat,
  onToggleHistory,
  showHistorySidebar,
  archiveChat,
  currentConversationId,
  showButton
}: ChatHistoryHeadingProps) {

  return (
    <section className="d-flex flex-row justify-content-between align-items-center p-2 border-0 border-bottom">
      <div>
        <CustomTooltip
          tooltipText={'Start a new chat'}
        >
          <button
            className="btn btn-sm btn-link text-decoration-none"
            onClick={onNewChat}
            data-id="new-chat-btn new-conversation-btn"
          >
            <i className="fas fa-plus me-1"></i>
            New chat
          </button>
        </CustomTooltip>
      </div>
      <div></div>
      <div></div>
      <div></div>
      <div className="d-flex flex-row gap-2 justify-content-end align-items-center">
        {showButton && <><CustomTooltip
          tooltipText={showHistorySidebar ? 'Hide chat history' : 'Show chat history'}
        >
          <button
            className={`btn btn-sm ${showHistorySidebar ? 'btn-primary' : 'btn-link'}`}
            onClick={onToggleHistory}
            data-id="toggle-history-btn"
          >
            <i className="fas fa-clock-rotate-left"></i>
          </button>
        </CustomTooltip>
        <CustomTooltip
          tooltipText={'Archive your current chat'}
          placement="bottom-start"
        >
          <button
            className={`btn btn-sm ${showHistorySidebar ? 'btn-primary' : 'btn-link'}`}
            onClick={() => {
              if (currentConversationId) {
                archiveChat(currentConversationId)
              }
            }}
            disabled={!currentConversationId}
            data-id="archive-chat-btn"
          >
            <i className="far fa-box-archive"></i>
          </button>
        </CustomTooltip></>}
      </div>
    </section>
  )
}
