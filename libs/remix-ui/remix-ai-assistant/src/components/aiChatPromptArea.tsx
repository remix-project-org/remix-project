import React, { Dispatch, useMemo } from 'react'
import GroupListMenu from './contextOptMenu'
import { PromptArea } from './prompt'
import { AiAssistantType, groupListType } from '../types/componentTypes'
import { ChatMessage } from '@remix/remix-ai-core'

interface AiChatPromptAreaProps {
    selectedModelId: unknown
    handleOllamaModelSelection: Dispatch<any>
    selectedOllamaModel: unknown
    ollamaModels: any
    themeTracker: any
    showHistorySidebar: boolean
    isMaximized: boolean
    modelOpt: { top: number, left: number }
    menuRef: React.RefObject<HTMLDivElement>
    assistantChoice: any
    setAssistantChoice: React.Dispatch<React.SetStateAction<any>>
    mcpEnabled: boolean
    mcpEnhanced: boolean
    setMcpEnhanced: React.Dispatch<React.SetStateAction<boolean>>
    availableModels: any[]
    selectedModel: any
    handleModelSelection: (modelName: string) => void
    onLockedModelClick?: (modelId: string, modelName: string) => void
    input: string
    setInput: React.Dispatch<React.SetStateAction<string>>
    isStreaming: boolean
    handleSend: () => void
    stopRequest: () => void
    showModelOptions: boolean
    setShowModelOptions: React.Dispatch<React.SetStateAction<boolean>>
    handleSetModel: () => void
    handleGenerateWorkspace: () => void
    handleRecord: () => void
    isRecording: boolean
    dispatchActivity: (type: string, payload?: any) => void
    modelBtnRef: React.RefObject<HTMLButtonElement>
    modelSelectorBtnRef: React.RefObject<HTMLButtonElement>
    textareaRef?: React.RefObject<HTMLTextAreaElement>
    maximizePanel: () => Promise<void>
    setShowOllamaModelSelector: React.Dispatch<React.SetStateAction<boolean>>
    showOllamaModelSelector: boolean
    showModelSelector: boolean
    modelAccess: any
    setShowModelSelector: React.Dispatch<React.SetStateAction<boolean>>
    messages: ChatMessage[]
    handleLoadSkills?: () => void
}

export default function AiChatPromptArea(props: AiChatPromptAreaProps) {
  const modelList = useMemo(() => {
    return props.availableModels.map(model => {
      const hasAccess = props.modelAccess.checkAccess(model.id)
      return {
        label: model.name,
        bodyText: model.description,
        icon: 'fa-solid fa-check' as const,
        stateValue: model.id,
        dataId: `ai-model-${model.id.replace(/[^a-zA-Z0-9]/g, '-')}`,
        isLocked: !hasAccess
      }
    })
  }, [props.availableModels, props.modelAccess.allowedModels])

  const handleLockedItemClick = (item: groupListType) => {
    props.onLockedModelClick?.(item.stateValue, item.label)
  }

  {/* Prompt area - fixed at bottom */}
  return (
    <section
      id="remix-ai-prompt-area"
      className="ai-assistant-prompt-bg"
      style={{ flexShrink: 0, minHeight: '110px', backgroundColor: props.messages.length > 0 && (props.themeTracker?.name.toLowerCase() === 'dark' ? '#222336' : '#eff1f5') as any }}
      data-theme={props.themeTracker && props.themeTracker?.name.toLowerCase()}
    >
      {props.showModelSelector && (
        <div
          className="pt-2 mb-2 z-3 bg-light border border-text position-fixed"
          style={{ borderRadius: '8px', top: props.modelOpt.top, left: props.modelOpt.left + 16, zIndex: 2000, minWidth: '300px', maxWidth: '400px' }}
          ref={props.menuRef}
        >
          <div className="text-uppercase ms-2 mb-2 small">AI Model</div>
          <GroupListMenu
            setChoice={props.handleModelSelection}
            setShowOptions={props.setShowModelSelector}
            choice={props.selectedModelId}
            groupList={modelList}
            onLockedItemClick={handleLockedItemClick}
          />
          {props.mcpEnabled && (
            <div className="border-top mt-2 pt-2">
              <div className="text-uppercase ms-2 mb-2 small">MCP Enhancement</div>
              <div className="form-check ms-2 mb-2">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="mcpEnhancementToggle"
                  checked={props.mcpEnhanced}
                  onChange={(e) => props.setMcpEnhanced(e.target.checked)}
                />
                <label className="form-check-label small" htmlFor="mcpEnhancementToggle">
                        Enable MCP context enhancement
                </label>
              </div>
              <div className="small text-muted ms-2">
                      Adds relevant context from the connected MCP servers
              </div>
            </div>
          )}
        </div>
      )}
      {props.showOllamaModelSelector && props.selectedModel?.provider === 'ollama' && (
        <div
          className="pt-2 mb-2 z-3 bg-light border border-text w-75 position-absolute"
          style={{ borderRadius: '8px' }}
        >
          <div className="text-uppercase ml-2 mb-2 small">Ollama Model</div>
          <GroupListMenu
            setChoice={props.handleOllamaModelSelection}
            setShowOptions={props.setShowOllamaModelSelector}
            choice={props.selectedOllamaModel}
            groupList={props.ollamaModels.map((model: any) => ({
              label: model,
              bodyText: `Use ${model} model`,
              icon: 'fa-solid fa-check',
              stateValue: model,
              dataId: `ollama-model-${model.replace(/[^a-zA-Z0-9]/g, '-')}`
            }))}
          />
        </div>
      )}
      <PromptArea
        input={props.input}
        setInput={props.setInput}
        isStreaming={props.isStreaming}
        handleSend={props.handleSend}
        handleSetModel={props.handleSetModel}
        handleModelSelection={props.handleModelSelection}
        handleGenerateWorkspace={props.handleGenerateWorkspace}
        handleRecord={props.handleRecord}
        isRecording={props.isRecording}
        dispatchActivity={props.dispatchActivity}
        modelBtnRef={props.modelBtnRef}
        textareaRef={props.textareaRef}
        assistantChoice={props.assistantChoice}
        themeTracker={props.themeTracker}
        setShowOllamaModelSelector={props.setShowOllamaModelSelector}
        showOllamaModelSelector={props.showOllamaModelSelector}
        showModelSelector={props.showModelSelector}
        setShowModelSelector={props.setShowModelSelector}
        selectedModel={props.selectedModel}
        handleOllamaModelSelection={props.handleOllamaModelSelection}
        ollamaModels={props.ollamaModels}
        selectedOllamaModel={props.selectedOllamaModel}
        modelSelectorBtnRef={props.modelSelectorBtnRef}
        stopRequest={props.stopRequest}
        handleLoadSkills={props.handleLoadSkills}
      />
      <span className="mb-2 mx-4 small w-100 text-dark">RemixAI can make mistakes. Always check important info.</span>
    </section>
  )
}
