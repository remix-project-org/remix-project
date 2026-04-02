import { ActivityType } from "../lib/types"
import React, { MutableRefObject, Ref, useContext, useEffect, useRef, useState } from 'react'
import GroupListMenu from "./contextOptMenu"
import { AiAssistantType, AiContextType, groupListType } from '../types/componentTypes'
import { AIEvent, MatomoEvent, trackMatomoEvent } from '@remix-api';
import { TrackingContext } from '@remix-ide/tracking'
import { CustomTooltip } from '@remix-ui/helper'
import { AIModel } from '@remix/remix-ai-core'
import { ModelAccess } from '../hooks/useModelAccess'
import { PromptDefault } from "./promptDefault";
import { PromptActiveButtons } from "./promptActiveButtons";

// PromptArea component
export interface PromptAreaProps {
  input: any
  setInput: React.Dispatch<React.SetStateAction<string>>
  isStreaming: boolean
  handleSend: () => void
  assistantChoice: AiAssistantType
  selectedOllamaModel: any
  handleAddContext?: () => void
  handleSetModel: () => void
  handleModelSelection: (modelId: string) => void
  setShowOllamaModelSelector: React.Dispatch<React.SetStateAction<boolean>>
  showOllamaModelSelector: boolean
  handleGenerateWorkspace: () => void
  handleRecord: () => void
  selectedModel: AIModel | null
  isRecording: boolean
  dispatchActivity: (type: ActivityType, payload?: any) => void
  modelBtnRef: React.RefObject<HTMLButtonElement>
  modelSelectorBtnRef: React.RefObject<HTMLButtonElement>
  textareaRef?: React.RefObject<HTMLTextAreaElement>
  showModelSelector: boolean
  setShowModelSelector: React.Dispatch<React.SetStateAction<boolean>>
  handleOllamaModelSelection: (modelId: string) => void
  ollamaModels: any[]
  themeTracker: any
  stopRequest: () => void
}

export const PromptArea: React.FC<PromptAreaProps> = ({
  input,
  setInput,
  isStreaming,
  handleSend,
  selectedModel,
  handleSetModel,
  handleGenerateWorkspace,
  handleRecord,
  isRecording,
  modelBtnRef,
  textareaRef,
  themeTracker,
  ollamaModels,
  showModelSelector,
  stopRequest,
  setShowOllamaModelSelector,
  showOllamaModelSelector,
  selectedOllamaModel,
  modelSelectorBtnRef
}) => {
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)

  useEffect(() => {
    if (textareaRef?.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [input])

  return (
    <>
      <div
        className="prompt-area flex flex-col mx-2 p-2 rounded-lg border border-text bg-light mb-1"
        style={{ backgroundColor: themeTracker && themeTracker?.name.toLowerCase() === 'light' ? '#d9dee8' : '#2a2c3f' }}
      >
        <div className="flex justify-between items-center mb-3 border border-r-0 border-l-0 border-t-0 border-b pb-1">
          <div className="flex">
            <button
              onClick={handleSetModel}
              className="btn btn-text btn-sm small font-weight-light text-secondary mt-2 self-end border-0 rounded"
              data-assist-btn="assistant-selector-btn"
              ref={modelBtnRef}
            >
              {selectedModel?.name || 'Select Model'}
              {'  '}
              <span className={showModelSelector ? "fa fa-caret-up" : "fa fa-caret-down"}></span>
            </button>
            {selectedModel?.provider === 'ollama' && ollamaModels.length > 0 && (
              <button
                onClick={() => setShowOllamaModelSelector(prev => !prev)}
                className="btn btn-text btn-sm small font-weight-light text-secondary mt-2 self-end border border-text rounded ml-2"
                ref={modelSelectorBtnRef}
                data-id="ollama-model-selector"
                data-assist-btn="assistant-selector-btn"
              >
                {selectedOllamaModel || 'Select Model'}
                {'  '}
                <span className={showOllamaModelSelector ? "fa fa-caret-up" : "fa fa-caret-down"}></span>
              </button>
            )}
          </div>
          <span
            className="inline-flex items-center px-3 py-1.5 text-sm rounded-md transition-colors disabled small rounded-lg self-center font-light"
            // eslint-disable-next-line no-constant-condition
            style={{ backgroundColor: themeTracker && themeTracker?.name.toLowerCase() === 'dark' ? '#2b3b4d' : '#c6e8f1', color: themeTracker && themeTracker.name.toLowerCase() === 'light' ? '#1ea2aa' : '#2de7f3', cursor: 'default' }}
          >
          </span>
        </div>
        <div className="ai-chat-input flex flex-col">
          <div
            className="flex flex-col rounded-lg p-1"
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
                fontSize: '0.975rem',
                color: 'inherit',
                backgroundColor: themeTracker && themeTracker?.name.toLowerCase() === 'light' ? '#d9dee8' : '#222336',
                boxShadow: 'none',
                paddingRight: isStreaming ? '50px' : '10px',
                overflowY: 'auto',
                minHeight: '3rem',
                maxHeight: '12rem'
              }}
              className="form-control mb-1 border-0"
              id="remix-ai-prompt-input"
              data-id="remix-ai-prompt-input"
              value={input}
              disabled={isStreaming}
              onChange={e => {
                setInput(e.target.value)
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && e.shiftKey) {
                  e.preventDefault()
                  setInput(prev => prev + '\n')
                } else
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
              handleCancel={stopRequest}
            /> : null }
            { isRecording ? <PromptActiveButtons
              handleRecordingStoppage={handleRecord}
              isStreaming={isStreaming}
              handleSend={handleSend}
              isRecording={isRecording}
              themeTracker={themeTracker}
              handleCancel={stopRequest}
            /> : null }
          </div>

          <div className="flex flex-row justify-between items-center overflow-x-scroll overflow-y-hidden p-2 mt-2 gap-2"
            style={{
              scrollbarWidth: 'none'
            }}
          >
            <button className={`btn font-light rounded-xl whitespace-nowrap ${themeTracker && themeTracker.name.toLowerCase() === 'light' ? 'btn-light text-light-emphasis' : 'btn-remix-dark'}`}
              data-id="remix-ai-workspace-generate"
              onClick={handleGenerateWorkspace}>
              <i className="fas fa-plus mr-1"></i>
              <span className="whitespace-nowrap">New Workspace</span>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

