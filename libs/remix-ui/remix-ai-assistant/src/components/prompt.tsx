import { ActivityType } from "../lib/types"
import React, { MutableRefObject, Ref, useContext, useEffect, useRef, useState } from 'react'
import GroupListMenu from "./contextOptMenu"
import { AiContextType, groupListType } from '../types/componentTypes'
import { AiAssistantType } from '../types/componentTypes'
import { AIEvent, MatomoEvent } from '@remix-api';
import { TrackingContext } from '@remix-ide/tracking'

// PromptArea component
export interface PromptAreaProps {
  input: string
  setInput: React.Dispatch<React.SetStateAction<string>>
  isStreaming: boolean
  handleSend: () => void
  showContextOptions: boolean
  setShowContextOptions: React.Dispatch<React.SetStateAction<boolean>>
  showAssistantOptions: boolean
  setShowAssistantOptions: React.Dispatch<React.SetStateAction<boolean>>
  showModelOptions: boolean
  setShowModelOptions: React.Dispatch<React.SetStateAction<boolean>>
  contextChoice: AiContextType
  setContextChoice: React.Dispatch<React.SetStateAction<AiContextType>>
  assistantChoice: AiAssistantType
  setAssistantChoice: React.Dispatch<React.SetStateAction<AiAssistantType>>
  availableModels: string[]
  selectedModel: string | null
  contextFiles: string[]
  clearContext: () => void
  handleAddContext: () => void
  handleSetAssistant: () => void
  handleSetModel: () => void
  handleModelSelection: (modelName: string) => void
  handleGenerateWorkspace: () => void
  handleRecord: () => void
  isRecording: boolean
  dispatchActivity: (type: ActivityType, payload?: any) => void
  contextBtnRef: React.RefObject<HTMLButtonElement>
  modelBtnRef: React.RefObject<HTMLButtonElement>
  modelSelectorBtnRef: React.RefObject<HTMLButtonElement>
  aiContextGroupList: groupListType[]
  aiAssistantGroupList: groupListType[]
  textareaRef?: React.RefObject<HTMLTextAreaElement>
  maximizePanel: () => Promise<void>
  aiMode: 'ask' | 'edit'
  setAiMode: React.Dispatch<React.SetStateAction<'ask' | 'edit'>>
  isMaximized: boolean
  setIsMaximized: React.Dispatch<React.SetStateAction<boolean>>
}

export const PromptArea: React.FC<PromptAreaProps> = ({
  input,
  setInput,
  isStreaming,
  handleSend,
  showContextOptions,
  setShowContextOptions,
  showAssistantOptions,
  setShowAssistantOptions,
  showModelOptions,
  setShowModelOptions,
  contextChoice,
  setContextChoice,
  assistantChoice,
  setAssistantChoice,
  availableModels,
  selectedModel,
  contextFiles,
  clearContext,
  handleAddContext,
  handleSetAssistant,
  handleSetModel,
  handleModelSelection,
  handleGenerateWorkspace,
  handleRecord,
  isRecording,
  dispatchActivity,
  contextBtnRef,
  modelBtnRef,
  modelSelectorBtnRef,
  aiContextGroupList,
  aiAssistantGroupList,
  textareaRef,
  maximizePanel,
  aiMode,
  setAiMode,
  isMaximized,
  setIsMaximized
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
              <button
                type="button"
                className={`btn btn-sm ${aiMode === 'ask' ? 'btn-primary' : 'btn-outline-secondary'} px-2`}
                onClick={() => {
                  setAiMode('ask')
                  trackMatomoEvent({ category: 'ai', action: 'ModeSwitch', name: 'ask', isClick: true })
                }}
                title="Ask mode - Chat with AI"
              >
                Ask
              </button>
              <button
                type="button"
                className={`btn btn-sm ${aiMode === 'edit' ? 'btn-primary' : 'btn-outline-secondary'} px-2`}
                onClick={() => {
                  setAiMode('edit')
                  trackMatomoEvent({ category: 'ai', action: 'ModeSwitch', name: 'edit', isClick: true })
                }}
                title="Edit mode - Edit workspace code"
              >
                Edit
              </button>
            </div>
            <span
              className="badge align-self-center text-bg-info fw-light rounded"
            >
              AI Beta
            </span>
          </div>
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
            placeholder={
              aiMode === 'ask'
                ? "Select context and ask me anything!"
                : "Edit my codebase, generate new contracts ..."
            }
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
                  className="btn btn-text btn-sm small font-weight-light text-secondary mt-2 align-self-end border border-text rounded ms-2"
                  ref={modelSelectorBtnRef}
                  data-id="ollama-model-selector"
                >
                  {selectedModel || 'Select Model'}
                  {'  '}
                  <span className={showModelOptions ? "fa fa-caret-up" : "fa fa-caret-down"}></span>
                </button>
              )}
            </div>
            <button
              data-id="remix-ai-record-audio"
              className={`btn btn-text btn-sm small fw-light mt-2 align-self-end border border-text rounded ${isRecording ? 'btn-danger text-white' : 'text-secondary'}`}
              onClick={handleRecord}
              title={isRecording ? 'Stop recording' : 'Record audio'}
            >
              <i className={`fa ${isRecording ? 'fa-stop' : 'fa-microphone'} me-1`}></i>
              {isRecording ? 'Stop' : 'Audio Prompt'}
            </button>
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

