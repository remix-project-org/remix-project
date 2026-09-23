/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { useCallback, useEffect, useState } from 'react'
import { CustomTooltip } from '@remix-ui/helper'
// Deep import bypassing the `@remix-ui/remix-ai-assistant` barrel on purpose:
// that barrel's index re-exports the full chat component, which itself
// imports `@remix-ui/app` — going through it here would create a circular
// lib dependency (this file lives inside @remix-ui/app). ChatHistorySidebar
// itself has no such back-reference, so importing it directly is safe.
import { ChatHistorySidebar } from '../../../../../../remix-ai-assistant/src/components/chatHistorySidebar'

interface AIChatHistoryPanelProps {
  plugin: any
  theme?: string
}

interface HistoryState {
  conversations: any[]
  currentConversationId: string | null
}

/**
 * Hosts the conversation-history list in the right panel's slot while the AI
 * chat is maximized (replacing the old `position: fixed` FloatingChatHistory
 * overlay). Subscribes via `plugin.setHistoryDispatch`, a second, independent
 * push channel on RemixAIAssistant — the main chat body (portaled into the
 * center panel) keeps using the plugin's primary `dispatch`, so both views
 * stay in sync without fighting over the single-subscriber `dispatch` field.
 */
export const AIChatHistoryPanel: React.FC<AIChatHistoryPanelProps> = ({ plugin, theme }) => {
  const [state, setState] = useState<HistoryState>({
    conversations: plugin?.conversations || [],
    currentConversationId: plugin?.currentConversationId || null
  })
  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => {
    if (plugin?.setHistoryDispatch) {
      plugin.setHistoryDispatch(setState)
    }
  }, [plugin])

  const handleLoadConversation = useCallback(async (id: string) => {
    await plugin.loadConversation(id)
  }, [plugin])

  const handleArchiveConversation = useCallback(async (id: string) => {
    await plugin.archiveConversation(id)
  }, [plugin])

  const handleDeleteConversation = useCallback(async (id: string) => {
    await plugin.deleteConversation(id)
  }, [plugin])

  const handleSearch = useCallback(async (query: string) => {
    if (plugin?.searchConversations) {
      return await plugin.searchConversations(query)
    }
    return []
  }, [plugin])

  return (
    <div className="d-flex flex-column h-100 w-100">
      <div className="swapitHeader p-2 d-flex flex-row justify-content-between align-items-center">
        <h6 className="pt-0 m-0" data-id="aiChatHistoryPanelTitle">RemixAI Assistant</h6>
        <CustomTooltip placement="bottom-end" tooltipText="Restore">
          <div
            className="codicon-screen-icon ms-2"
            onClick={() => plugin.call('rightSidePanel', 'maximizePanel')}
            data-id="restoreAiChatPanel"
          >
            {'' /* codicon-screen-normal, see panel-header.tsx */}
          </div>
        </CustomTooltip>
      </div>
      <div className="flex-grow-1" style={{ minHeight: 0 }}>
        <ChatHistorySidebar
          conversations={state.conversations}
          currentConversationId={state.currentConversationId}
          showArchived={showArchived}
          onNewConversation={() => plugin.newConversation()}
          onLoadConversation={handleLoadConversation}
          onArchiveConversation={handleArchiveConversation}
          onDeleteConversation={handleDeleteConversation}
          onDeleteAllConversations={() => plugin.deleteAllConversations()}
          onToggleArchived={() => setShowArchived((prev) => !prev)}
          onClose={() => {}}
          onSearch={handleSearch}
          isFloating={false}
          isMaximized={false}
          theme={theme}
        />
      </div>
    </div>
  )
}

export default AIChatHistoryPanel
