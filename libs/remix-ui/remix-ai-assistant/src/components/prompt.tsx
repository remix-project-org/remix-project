import { ActivityType } from "../lib/types"
import React, { MutableRefObject, Ref, useContext, useEffect, useRef, useState } from 'react'
import { AiAssistantType } from '../types/componentTypes'
import { AIEvent, MatomoEvent } from '@remix-api'
import { TrackingContext } from '@remix-ide/tracking'
import { CustomTooltip } from '@remix-ui/helper'
import { PromptDefault } from './promptDefault'
import { PromptActiveButtons } from './promptActiveButtons'
import GroupListMenu from "./contextOptMenu"
import { AiContextType, groupListType } from '../types/componentTypes'
import { AIEvent, MatomoEvent } from '@remix-api';
import { TrackingContext } from '@remix-ide/tracking'
import { CustomTooltip } from '@remix-ui/helper'
import { AIModel } from '@remix/remix-ai-core'
import { ModelAccess } from '../hooks/useModelAccess'

// PromptArea component
export interface PromptAreaProps {
  input: string
  setInput: React.Dispatch<React.SetStateAction<string>>
  isStreaming: boolean
  handleSend: () => void
  handleStop: () => void
  showContextOptions: boolean
  setShowContextOptions: React.Dispatch<React.SetStateAction<boolean>>
  showAssistantOptions: boolean
  setShowAssistantOptions: React.Dispatch<React.SetStateAction<boolean>>
  showModelOptions: boolean
  setShowModelOptions: React.Dispatch<React.SetStateAction<boolean>>
  assistantChoice: AiAssistantType
  setAssistantChoice: React.Dispatch<React.SetStateAction<AiAssistantType>>
  availableModels: string[]
  selectedModel: string | null
  handleSetAssistant: () => void
  showModelSelector: boolean
  setShowModelSelector: React.Dispatch<React.SetStateAction<boolean>>
  showOllamaModelSelector: boolean
  setShowOllamaModelSelector: React.Dispatch<React.SetStateAction<boolean>>
  contextChoice: AiContextType
  setContextChoice: React.Dispatch<React.SetStateAction<AiContextType>>
  selectedModel: AIModel
  ollamaModels: string[]
  selectedOllamaModel: string | null
  contextFiles: string[]
  clearContext: () => void
  handleAddContext: () => void
  handleSetModel: () => void
  handleModelSelection: (modelId: string) => void
  handleOllamaModelSelection: (modelName: string) => void
  handleGenerateWorkspace: () => void
  handleRecord: () => void
  isRecording: boolean
  dispatchActivity: (type: ActivityType, payload?: any) => void
  modelBtnRef: React.RefObject<HTMLButtonElement>
  modelSelectorBtnRef: React.RefObject<HTMLButtonElement>
  aiContextGroupList: groupListType[]
  textareaRef?: React.RefObject<HTMLTextAreaElement>
  maximizePanel: () => Promise<void>
  isMaximized: boolean
  themeTracker: any
  setIsMaximized: React.Dispatch<React.SetStateAction<boolean>>
  modelAccess: ModelAccess
}

export const PromptArea: React.FC<PromptAreaProps> = ({
  input,
  setInput,
  isStreaming,
  handleSend,
  handleStop,
  showContextOptions,
  setShowContextOptions,
  showAssistantOptions,
  assistantChoice,
  handleSetAssistant,
  showModelSelector,
  setShowModelSelector,
  showOllamaModelSelector,
  setShowOllamaModelSelector,
  contextChoice,
  setContextChoice,
  selectedModel,
  ollamaModels,
  selectedOllamaModel,
  contextFiles,
  clearContext,
  handleAddContext,
  handleSetModel,
  handleModelSelection,
  handleOllamaModelSelection,
  handleGenerateWorkspace,
  handleRecord,
  isRecording,
  modelBtnRef,
  modelSelectorBtnRef,
  aiContextGroupList,
  textareaRef,
  maximizePanel,
  isMaximized,
  setIsMaximized,
  modelAccess
}) => {
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)

  return (
    <>
      <div
        className="prompt-area d-flex flex-column mx-2 p-2 rounded-3 border border-text bg-light"
        style={{ backgroundColor: themeTracker && themeTracker?.name.toLowerCase() === 'light' ? '#d9dee8' : '#2a2c3f' }}
      >
        <div className="d-flex justify-content-between align-items-center mb-3 border border-end-0 border-start-0 border-top-0 border-bottom pb-1">
          <button
            onClick={handleSetAssistant}
            className="btn btn-text btn-sm small font-weight-light text-secondary mt-2 align-self-end border-0 rounded"
            ref={modelBtnRef}
          >
            {assistantChoice === null && 'Default'}
            {assistantChoice === 'openai' && ' OpenAI'}
            {assistantChoice === 'mistralai' && ' MistralAI'}
            {assistantChoice === 'anthropic' && ' Anthropic'}
            {assistantChoice === 'ollama' && ' Ollama'}
            {'  '}
            <span className={showAssistantOptions ? "fa fa-caret-up" : "fa fa-caret-down"}></span>
          </button>
          <span
            className="btn btn-sm small rounded-3 align-self-center fw-light"
            // eslint-disable-next-line no-constant-condition
            style={{ backgroundColor: themeTracker && themeTracker?.name.toLowerCase() === 'dark' ? '#2b3b4d' : '#c6e8f1', color: themeTracker && themeTracker.name.toLowerCase() === 'light' ? '#1ea2aa' : '#2de7f3' }}
          >
            <i className="fa fa-info-circle me-1"></i>
            AI beta
          </span>
        </div>
        <div className="ai-chat-input d-flex flex-column">
          <div
            className="d-flex flex-column rounded-3 p-1"
            style={{
              backgroundColor: themeTracker && themeTracker?.name.toLowerCase() === 'light' ? '#d9dee8' : '#222336',
              outline: 'none',
              boxShadow: 'none',
              border: 'none'
            }}
          >
            <textarea
              ref={textareaRef}
              style={{
                flexGrow: 1,
                outline: 'none',
                resize: 'none',
                font: 'inherit',
                color: 'inherit',
                backgroundColor: themeTracker && themeTracker?.name.toLowerCase() === 'light' ? '#d9dee8' : '#222336',
                boxShadow: 'none',
                paddingRight: isStreaming ? '50px' : '10px'
              }}
              rows={2}
              className="form-control mb-1 border-0"
              id="remix-ai-prompt-input"
              data-id="remix-ai-prompt-input"
              value={input}
              disabled={isStreaming}
              onFocus={() => {
                if (!isMaximized) {
                  maximizePanel()
                }
              }}
              onChange={e => {
                setInput(e.target.value)
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !isStreaming) handleSend()
              }}
              placeholder="Ask me anything about your code or generate new contracts..."
            />
            { !isRecording ? <PromptDefault
              handleRecording={handleRecord}
              isRecording={isRecording}
              isStreaming={isStreaming}
              handleSend={handleSend}
              themeTracker={themeTracker}
            /> : null }
            { isRecording ? <PromptActiveButtons
              handleRecordingStoppage={handleRecord}
              isStreaming={isStreaming}
              handleSend={handleSend}
              isRecording={isRecording}
              themeTracker={themeTracker}
            /> : null }
          </div>

          <div className="d-flex flex-row justify-content-between align-items-center overflow-x-scroll overflow-y-hidden p-2 mt-2 gap-2"
            style={{
              scrollbarWidth: 'none'
            }}
          >

            {/* <div className="d-flex">
              {assistantChoice === 'ollama' && availableModels.length > 0 && (
                <button
                  onClick={handleSetModel}
                  className="btn btn-sm small font-weight-light text-secondary mt-2 align-self-end border border-text rounded ms-2"
                  ref={modelSelectorBtnRef}
                  data-id="ollama-model-selector"
                >
                  {selectedOllamaModel || 'Select Model'}
                  {'  '}
                  <span className={showOllamaModelSelector ? "fa fa-caret-up" : "fa fa-caret-down"}></span>
                </button>
              )}
              test
            </div> */}
            <button className="btn d-flex rounded-4 justify-content-between align-items-center gap-2" style={{ backgroundColor: themeTracker && themeTracker.name.toLowerCase() === 'light' ? '#c7e8f1' :'#2b3b4d', color: themeTracker && themeTracker.name.toLowerCase() === 'light' ? '#1ea2aa' :'#2de7f3' }}>
              <i className="far fa-copy me-1"></i>
              <span>File</span>
            </button>
            {/* <button className={`btn fw-light rounded-4 text-nowrap ${themeTracker && themeTracker.name.toLowerCase() === 'light' ? 'btn-remix-light' : 'btn-remix-dark'}`}>
              <i className="fas fa-brain me-1"></i>
              <span>Learn</span>
            </button>
            <button className={`btn fw-light rounded-4 text-nowrap ${themeTracker && themeTracker.name.toLowerCase() === 'light' ? 'btn-remix-light' : 'btn-remix-dark'}`}>
              <i className="fas fa-list me-1"></i>
              <span className="text-nowrap">Plan a project</span>
            </button> */}
            <button className={`btn fw-light rounded-4 text-nowrap ${themeTracker && themeTracker.name.toLowerCase() === 'light' ? 'btn-light text-light-emphasis' : 'btn-remix-dark'}`}>
              <i className="fas fa-plus me-1"></i>
              <span className="text-nowrap">New workspace</span>
            </button>
            <button
              data-id="remix-ai-workspace-generate"
              className={`btn fw-light rounded-4 text-nowrap ${themeTracker && themeTracker.name.toLowerCase() === 'light' ? 'btn-light text-light-emphasis' : '#ccdd33'}`}
              onClick={handleGenerateWorkspace}
            >
              {'Create new workspace with AI'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

