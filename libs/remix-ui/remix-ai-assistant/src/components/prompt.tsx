import { ActivityType } from "../lib/types"
import React, { MutableRefObject, Ref, useContext, useEffect, useRef, useState } from 'react'
import { AiAssistantType } from '../types/componentTypes'
import { AIEvent, MatomoEvent } from '@remix-api';
import { TrackingContext } from '@remix-ide/tracking'
import { CustomTooltip } from '@remix-ui/helper'

// PromptArea component
export interface PromptAreaProps {
  input: string
  setInput: React.Dispatch<React.SetStateAction<string>>
  isStreaming: boolean
  handleSend: () => void
  showAssistantOptions: boolean
  setShowAssistantOptions: React.Dispatch<React.SetStateAction<boolean>>
  showModelOptions: boolean
  setShowModelOptions: React.Dispatch<React.SetStateAction<boolean>>
  assistantChoice: AiAssistantType
  setAssistantChoice: React.Dispatch<React.SetStateAction<AiAssistantType>>
  availableModels: string[]
  selectedModel: string | null
  handleSetAssistant: () => void
  handleSetModel: () => void
  handleModelSelection: (modelName: string) => void
  handleGenerateWorkspace: () => void
  handleRecord: () => void
  isRecording: boolean
  dispatchActivity: (type: ActivityType, payload?: any) => void
  modelBtnRef: React.RefObject<HTMLButtonElement>
  modelSelectorBtnRef: React.RefObject<HTMLButtonElement>
  textareaRef?: React.RefObject<HTMLTextAreaElement>
  maximizePanel: () => Promise<void>
  isMaximized: boolean
  setIsMaximized: React.Dispatch<React.SetStateAction<boolean>>
}

export const PromptArea: React.FC<PromptAreaProps> = ({
  input,
  setInput,
  isStreaming,
  handleSend,
  showAssistantOptions,
  setShowAssistantOptions,
  showModelOptions,
  setShowModelOptions,
  assistantChoice,
  setAssistantChoice,
  availableModels,
  selectedModel,
  handleSetAssistant,
  handleSetModel,
  handleModelSelection,
  handleGenerateWorkspace,
  handleRecord,
  isRecording,
  dispatchActivity,
  modelBtnRef,
  modelSelectorBtnRef,
  textareaRef,
  maximizePanel,
  isMaximized,
  setIsMaximized
}) => {
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = AIEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }

  return (
    <>
      <div
        className="prompt-area d-flex flex-column mx-1 p-2 border border-text bg-light"
      >
        <div className="d-flex justify-content-end mb-3 border border-end-0 border-start-0 border-top-0 border-bottom pb-1">
          <span
            className="badge align-self-center text-bg-info fw-light rounded"
          >
            AI Beta
          </span>
        </div>
        <div className="ai-chat-input d-flex flex-column">
          <textarea
            ref={textareaRef}
            style={{ flexGrow: 1 }}
            rows={2}
            className="form-control bg-light"
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

          <div className="d-flex justify-content-between">

            <div className="d-flex">
              <button
                onClick={handleSetAssistant}
                className="btn btn-text btn-sm small font-weight-light text-secondary mt-2 align-self-end border border-text rounded"
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
              {assistantChoice === 'ollama' && availableModels.length > 0 && (
                <button
                  onClick={handleSetModel}
                  className="btn btn-sm small font-weight-light text-secondary mt-2 align-self-end border border-text rounded ms-2"
                  ref={modelSelectorBtnRef}
                  data-id="ollama-model-selector"
                >
                  {selectedModel || 'Select Model'}
                  {'  '}
                  <span className={showModelOptions ? "fa fa-caret-up" : "fa fa-caret-down"}></span>
                </button>
              )}
            </div>
            <CustomTooltip
              placement="bottom"
              tooltipText={isRecording ? 'Stop recording' : 'Voice input'}
              tooltipId="audioPromptTooltip"
            >
              <button
                data-id="remix-ai-record-audio"
                className={`btn btn-sm rounded-circle align-items-center justify-content-center d-flex small fw-light mt-2  border border-text rounded ${isRecording ? 'btn-danger text-white' : 'text-secondary'}`}
                onClick={handleRecord}
              >
                <i className={`fa ${isRecording ? 'fa-stop' : 'fa-microphone'} me-1`}></i>
                {/* {isRecording ? 'Stop' : 'Audio Prompt'} */}
              </button>
            </CustomTooltip>
            <button
              data-id="remix-ai-workspace-generate"
              className="btn btn-text btn-sm small fw-light text-secondary mt-2 align-self-end border border-text rounded"
              onClick={handleGenerateWorkspace}
            >
              {'Create new workspace with AI'}
            </button>
            {/* <button
              className={input.length > 0 ? 'btn bg-ai border-text border btn-sm fw-light text-secondary mt-2 align-self-end' : 'btn btn-text border-text border btn-sm fw-light text-secondary mt-2 align-self-end disabled'}
              style={{ backgroundColor: input.length > 0 ? '#2de7f3' : 'transparent' }}
              onClick={handleSend}
            >
              <span className="fa fa-arrow-up text-light"></span>
            </button> */}
          </div>
        </div>
        {/* {contextChoice !== 'none' && contextFiles.length > 0 && (
          <div className="mt-2 d-flex flex-wrap gap-1 overflow-y-auto" style={{ maxHeight: '110px' }}>
            {contextFiles.slice(0, 6).map(f => {
              const name = f.split('/').pop()
              return (
                <span
                  key={f}
                  className="badge text-bg-info me-1 aiContext-file text-success"
                  style={{ cursor: 'pointer' }}
                  onClick={clearContext}
                >
                  {name}
                  <i className="fa fa-times ms-1 ms-1" style={{ cursor: 'pointer' }}></i>
                </span>
              )
            })}
            {contextFiles.length > 6 && (
              <span
                className="badge text-bg-info"
                style={{ cursor: 'pointer' }}
                onClick={clearContext}
              >
              … {contextFiles.length - 6} more <i className="fa fa-times ms-1" style={{ cursor: 'pointer' }}></i>
              </span>
            )}
          </div>
        )} */}
      </div>
    </>
  )
}

