import { ActivityType } from "../lib/types"
import React, { MutableRefObject, Ref, useContext, useEffect, useRef, useState } from 'react'
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
  contextBtnRef: React.RefObject<HTMLButtonElement>
  modelBtnRef: React.RefObject<HTMLButtonElement>
  modelSelectorBtnRef: React.RefObject<HTMLButtonElement>
  aiContextGroupList: groupListType[]
  textareaRef?: React.RefObject<HTMLTextAreaElement>
  maximizePanel: () => Promise<void>
  aiMode: 'ask' | 'edit'
  setAiMode: React.Dispatch<React.SetStateAction<'ask' | 'edit'>>
  isMaximized: boolean
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
  dispatchActivity,
  contextBtnRef,
  modelBtnRef,
  modelSelectorBtnRef,
  aiContextGroupList,
  textareaRef,
  maximizePanel,
  aiMode,
  setAiMode,
  isMaximized,
  setIsMaximized,
  modelAccess
}) => {
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = AIEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }

  return (
    <>
      {showContextOptions && (
        <div
          className="bg-light mb-1 p-2 border border-text w-75"
          style={{ borderRadius: '8px' }}
        >
          <div className="text-uppercase ms-2 mb-2">Context</div>
          <GroupListMenu
            setChoice={setContextChoice}
            setShowOptions={setShowContextOptions}
            choice={contextChoice}
            groupList={aiContextGroupList}
          />
        </div>
      )}

      <div
        className="prompt-area d-flex flex-column mx-1 p-2 border border-text bg-light"
      >
        <div className="d-flex justify-content-between mb-3 border border-end-0 border-start-0 border-top-0 border-bottom pb-1">
          <button
            onClick={handleAddContext}
            data-id="composer-ai-add-context"
            className="btn btn-dim btn-sm text-secondary small fw-light border border-text rounded"
            ref={contextBtnRef}
          >
            <span>{}</span>{contextChoice === 'none' && <span data-id="aiContext-file">{'Select Context'}</span>}
            {contextChoice === 'workspace' && <span data-id="aiContext-workspace">{'Workspace'}</span>}
            {contextChoice === 'opened' && <span data-id="aiContext-opened">{'Open Files'}</span>}
            {contextChoice === 'current' && <span data-id="aiContext-current">{'Current File'}</span>}
          </button>

          <div className="d-flex justify-content-center align-items-center gap-2">
            {/* Ask/Edit Mode Toggle */}
            <div className="btn-group btn-group-sm" role="group">
              <CustomTooltip
                placement="top"
                tooltipText="Ask mode - Chat with AI"
                tooltipId="askModeTooltip"
              >
                <button
                  type="button"
                  className={`btn btn-sm ${aiMode === 'ask' ? 'btn-primary' : 'btn-outline-secondary'} px-2`}
                  onClick={() => {
                    setAiMode('ask')
                    trackMatomoEvent({ category: 'ai', action: 'ModeSwitch', name: 'ask', isClick: true })
                  }}
                >
                  Ask
                </button>
              </CustomTooltip>
              <CustomTooltip
                placement="top"
                tooltipText="Edit mode - Edit workspace code"
                tooltipId="editModeTooltip"
              >
                <button
                  type="button"
                  className={`btn btn-sm ${aiMode === 'edit' ? 'btn-primary' : 'btn-outline-secondary'} px-2`}
                  onClick={() => {
                    setAiMode('edit')
                    trackMatomoEvent({ category: 'ai', action: 'ModeSwitch', name: 'edit', isClick: true })
                  }}
                >
                  Edit
                </button>
              </CustomTooltip>
            </div>
            <span
              className="badge align-self-center text-bg-info fw-light rounded"
            >
              AI Beta
            </span>
          </div>
        </div>
        <div className="ai-chat-input d-flex flex-column position-relative">
          <textarea
            ref={textareaRef}
            style={{
              flexGrow: 1,
              paddingRight: isStreaming ? '50px' : '10px'
            }}
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
            placeholder={
              aiMode === 'ask'
                ? "Select context and ask me anything!"
                : "Edit my codebase, generate new contracts ..."
            }
          />
          {isStreaming && (
            <CustomTooltip
              placement="top"
              tooltipText="Stop"
              tooltipId="stopRequestTooltip"
            >
              <button
                data-id="remix-ai-stop-request"
                className="position-absolute prompt-stop-button"
                onClick={handleStop}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#5a5a5a'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bs-danger)'
                }}
              >
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    backgroundColor: '#ffffff',
                    borderRadius: '2px'
                  }}
                />
              </button>
            </CustomTooltip>
          )}

          <div className="d-flex justify-content-between">

            <div className="d-flex">
              <button
                onClick={handleSetModel}
                className="btn btn-text btn-sm small font-weight-light text-secondary mt-2 align-self-end border border-text rounded"
                ref={modelBtnRef}
              >
                {selectedModel.name}
                {'  '}
                <span className={showModelSelector ? "fa fa-caret-up" : "fa fa-caret-down"}></span>
              </button>
              {selectedModel.provider === 'ollama' && ollamaModels.length > 0 && (
                <button
                  onClick={() => setShowOllamaModelSelector(prev => !prev)}
                  className="btn btn-text btn-sm small font-weight-light text-secondary mt-2 align-self-end border border-text rounded ms-2"
                  ref={modelSelectorBtnRef}
                  data-id="ollama-model-selector"
                >
                  {selectedOllamaModel || 'Select Model'}
                  {'  '}
                  <span className={showOllamaModelSelector ? "fa fa-caret-up" : "fa fa-caret-down"}></span>
                </button>
              )}
            </div>
            <CustomTooltip
              placement="top"
              tooltipText={isRecording ? 'Stop recording' : 'Record audio'}
              tooltipId="audioPromptTooltip"
            >
              <button
                data-id="remix-ai-record-audio"
                className={`btn btn-text btn-sm small fw-light mt-2 align-self-end border border-text rounded ${isRecording ? 'btn-danger text-white' : 'text-secondary'}`}
                onClick={handleRecord}
              >
                <i className={`fa ${isRecording ? 'fa-stop' : 'fa-microphone'} me-1`}></i>
                {isRecording ? 'Stop' : 'Audio Prompt'}
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

