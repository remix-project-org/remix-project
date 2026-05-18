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
  autoModeEnabled?: boolean
  handleLoadSkills?: () => void
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
  modelSelectorBtnRef,
  autoModeEnabled,
  handleLoadSkills
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
        className="prompt-area d-flex flex-column mx-2 p-1 rounded-3 border border-text"
        style={{ backgroundColor: themeTracker && themeTracker?.name.toLowerCase() === 'light' ? '#d9dee8' : '#222336' }}
        data-id="remix-ai-prompt-area"
      >
        <div className="ai-chat-input d-flex flex-column">
          <div
            className="d-flex flex-column rounded-3"
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
                fontSize: '0.9rem',
                color: 'inherit',
                backgroundColor: themeTracker && themeTracker?.name.toLowerCase() === 'light' ? '#d9dee8' : '#222336',
                boxShadow: 'none',
                paddingRight: isStreaming ? '50px' : '10px',
                overflowY: 'auto',
                minHeight: '2rem',
                maxHeight: '12rem'
              }}
              className="form-control border-0"
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
            <div className="d-flex flex-row align-items-center">
              {/* <div className="d-flex flex-row align-items-center"> */}
              <button
                onClick={handleSetModel}
                className="btn btn-text btn-sm small font-weight-light text-secondary align-self-end border-0 rounded"
                data-assist-btn="assistant-selector-btn"
                ref={modelBtnRef}
              >
                <div className="d-flex flex-row flex-nowrap align-items-center justify-content-center">
                  <span className="text-nowrap">
                    {autoModeEnabled ? 'Auto Mode' : (selectedModel?.name || 'Select Model')}
                  </span>
                  <span className={showModelSelector ? "fa fa-caret-up ms-1" : "fa fa-caret-down ms-1"}></span>
                </div>
              </button>
              {selectedModel?.provider === 'ollama' && ollamaModels.length > 0 && (
                <button
                  onClick={() => setShowOllamaModelSelector(prev => !prev)}
                  className="btn btn-text btn-sm small font-weight-light text-secondary align-self-end border border-text rounded ms-2"
                  ref={modelSelectorBtnRef}
                  data-id="ollama-model-selector"
                  data-assist-btn="assistant-selector-btn"
                >
                  <div className="d-flex flex-row flex-nowrap align-items-center justify-content-center">
                    <span>{selectedModel?.name || 'Select Model'}</span>
                    <span className={showOllamaModelSelector ? "fa fa-caret-up ms-1" : "fa fa-caret-down ms-1"}></span>
                  </div>
                </button>
              )}
              {/* </div> */}
              { !isRecording ? <PromptDefault
                handleRecording={handleRecord}
                isRecording={isRecording}
                isStreaming={isStreaming}
                handleSend={handleSend}
                themeTracker={themeTracker}
                handleCancel={stopRequest}
              /> : <PromptActiveButtons
                handleRecordingStoppage={handleRecord}
                isStreaming={isStreaming}
                handleSend={handleSend}
                isRecording={isRecording}
                themeTracker={themeTracker}
                handleCancel={stopRequest}
              /> }
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

