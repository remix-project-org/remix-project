import { ActivityType } from "../lib/types"
import React, { MutableRefObject, Ref, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react'
import GroupListMenu from "./contextOptMenu"
import { AiAssistantType, AiContextType, groupListType } from '../types/componentTypes'
import { MatomoEvent } from '@remix-api';
import { TrackingContext } from '@remix-ide/tracking'
import { CustomTooltip } from '@remix-ui/helper'
import { AIModel } from '@remix/remix-ai-core'
import { PromptDefault } from "./promptDefault";
import { AutocompletePanel, Command } from './AutocompletePanel'

const SHORTCUT_CATEGORIES = [
  {
    id: 'code',
    label: 'Code',
    prompts: [
      'Write a Solidity ERC20 token with mint and burn functions',
      'Add an ownable access control to this contract',
      '/compile: fix any errors in the active file',
    ],
  },
  {
    id: 'explain',
    label: 'Explain',
    prompts: [
      'Explain what this contract does line by line',
      'What are the security risks in this code?',
      'What does this function return and when does it revert?',
    ],
  },
  {
    id: 'learn',
    label: 'Learn',
    prompts: [
      'What is a smart contract?',
      'How does gas work in Ethereum?',
      'What is the difference between memory and storage in Solidity?',
    ],
  },
  {
    id: 'deploy',
    label: 'Deploy',
    prompts: [
      '/deploy: deploy this contract to Sepolia testnet',
      'How do I verify my contract on Etherscan?',
      'What network should I use for testing?',
    ],
  },
]

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
  selectedModel: AIModel | null
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
  usingOwnApiKey?: boolean
  aiRoute?: 'initializing' | 'agent' | 'tools' | 'chat'
  aiRouteReady?: boolean
  // When false the composer renders an explicit "Sign in" CTA in place
  // of the disabled send button. Without this hint the user just sees a
  // greyed-out paper plane and an "Initialising agents…" placeholder —
  // both technically accurate but confusing because the route will
  // never become ready until they authenticate.
  isAuthenticated?: boolean
  onSignIn?: () => void
  isNewChat?: boolean
  handleOpenSettings?: () => void
  handleLoadAuditChecklist?: () => void
  handleGasOptimisationAudit?: () => void
  hasAuditorPermission?: boolean
  hasSkillsPermission?: boolean
}

export const PromptArea: React.FC<PromptAreaProps> = ({
  input,
  setInput,
  isStreaming,
  handleSend,
  selectedModel,
  handleSetModel,
  modelBtnRef,
  textareaRef,
  themeTracker,
  ollamaModels,
  showModelSelector,
  stopRequest,
  setShowOllamaModelSelector,
  showOllamaModelSelector,
  modelSelectorBtnRef,
  autoModeEnabled,
  usingOwnApiKey,
  aiRoute = 'chat',
  aiRouteReady = true,
  isAuthenticated = true,
  onSignIn,
  isNewChat = false,
  handleLoadSkills,
  handleOpenSettings,
  handleLoadAuditChecklist,
  handleGasOptimisationAudit,
  hasAuditorPermission = false,
  hasSkillsPermission = false
}) => {
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = MatomoEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0)
  const promptAreaRef = useRef<HTMLDivElement>(null)
  const shortcutsRef = useRef<HTMLDivElement>(null)
  const [activeShortcut, setActiveShortcut] = useState<string | null>(null)

  useEffect(() => {
    if (textareaRef?.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [input])

  // Handle autocomplete visibility
  useEffect(() => {
    if (input.startsWith('/') && input.length > 0 && !isStreaming) {
      // Check if this is the new format with space after /
      setShowAutocomplete(true)
    } else {
      setShowAutocomplete(false)
    }
    if (input.length > 0) setActiveShortcut(null)
  }, [input, isStreaming])

  const actionCommands: Command[] = useMemo(() => {
    const cmds: Command[] = [
      { name: 'model', description: 'Switch AI model', category: 'Settings', action: handleSetModel },
    ]
    if (handleOpenSettings) cmds.push({ name: 'settings', description: 'Open RemixAI settings', category: 'Settings', action: handleOpenSettings })
    if (handleLoadSkills) {
      cmds.push({
        name: 'Load Skills',
        description: 'Load skills',
        category: 'Tools',
        action: handleLoadSkills,
        disabled: false
      })
    }
    if (handleLoadAuditChecklist) {
      cmds.push({
        name: 'Start Security Audit',
        description: hasAuditorPermission ? 'Load audit checklist' : 'Upgrade to a paid plan',
        category: 'Tools',
        action: hasAuditorPermission ? handleLoadAuditChecklist : undefined,
        disabled: !hasAuditorPermission
      })
    }
    if (handleGasOptimisationAudit) cmds.push({ name: 'Start Gas Optimisation Audit', description: hasAuditorPermission ? 'Gas optimisation audit' : 'Upgrade to a paid plan', category: 'Tools', action: handleGasOptimisationAudit, disabled: !hasAuditorPermission })
    return cmds
  }, [handleSetModel, handleOpenSettings, handleLoadSkills, handleLoadAuditChecklist, handleGasOptimisationAudit, hasAuditorPermission, hasSkillsPermission])

  // Handle command selection
  const handleCommandSelect = useCallback((command: Command) => {
    if (command.action) {
      setShowAutocomplete(false)
      setTimeout(() => command.action!(), 0)
      return
    }

    const formattedCommand = '/' + command.name

    // Track command selection with Matomo
    trackMatomoEvent({
      category: 'ai',
      action: 'remixAI',
      value: `command_selected_${command.name}`,
      isClick: true
    })

    // If user has already typed something after the initial "/", preserve it
    const spaceIndex = input.indexOf(' ')
    const existingArgs = spaceIndex > -1 ? input.substring(spaceIndex).trim() : ''

    setInput(existingArgs ? formattedCommand + existingArgs + ': ': formattedCommand + ': ')
    setShowAutocomplete(false)
    // Focus back on textarea
    textareaRef?.current?.focus()
  }, [input, setInput])

  const handleShortcutSelect = useCallback((prompt: string) => {
    setInput(prompt)
    setActiveShortcut(null)
    textareaRef?.current?.focus()
  }, [setInput])

  // Handle keyboard navigation for autocomplete
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Handle Shift+Enter for new line
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault()
      setInput(prev => prev + '\n')
      return
    }

    // Handle autocomplete navigation if panel is visible
    if (showAutocomplete && e.key !== 'Enter') {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedCommandIndex(prev => prev + 1)
        return
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedCommandIndex(prev => Math.max(0, prev - 1))
        return
      } else if (e.key === 'Tab') {
        e.preventDefault()
        // Find the selected button and click it programmatically
        const buttons = document.querySelectorAll('[data-id^="autocomplete-item-"]')
        if (buttons[selectedCommandIndex]) {
          (buttons[selectedCommandIndex] as HTMLButtonElement).click()
        }
        return
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setShowAutocomplete(false)
        return
      }
    }

    // Handle Enter key
    if (e.key === 'Enter' && !e.shiftKey && !isStreaming && aiRouteReady) {
      // Check if input has content after the slash command format (e.g., "/command: content")
      const hasCommandContent = input.includes(':') && input.split(':')[1]?.trim().length > 0

      if (showAutocomplete && !hasCommandContent) {
        // If autocomplete is showing and no command content yet, select the highlighted command
        e.preventDefault()
        const buttons = document.querySelectorAll('[data-id^="autocomplete-item-"]')
        if (buttons[selectedCommandIndex]) {
          (buttons[selectedCommandIndex] as HTMLButtonElement).click()
        }
      } else {
        // Send the message if:
        // 1. Autocomplete is not showing, OR
        // 2. User has already typed command content after the colon
        e.preventDefault()
        handleSend()
      }
    }
  }, [showAutocomplete, selectedCommandIndex, isStreaming, aiRouteReady, handleSend, setInput])

  useEffect(() => {
    if (!activeShortcut) return
    const handleOutsideClick = (e: MouseEvent) => {
      if (shortcutsRef.current && !shortcutsRef.current.contains(e.target as Node)) {
        setActiveShortcut(null)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [activeShortcut])

  // The composer has three resting states:
  //   1. ready              → normal send/stop affordance
  //   2. !ready & authed    → disabled send (agents still booting)
  //   3. !ready & anonymous → sign-in CTA (no amount of waiting fixes it)
  // We split state 3 out so the user doesn't sit there waiting on a
  // route that can never become ready until they authenticate.
  const activeCategory = activeShortcut ? (SHORTCUT_CATEGORIES.find(c => c.id === activeShortcut) ?? null) : null

  const needsSignIn = !aiRouteReady && !isAuthenticated && !!onSignIn
  const placeholderText = needsSignIn
    ? 'Sign in to chat with RemixAI…'
    : aiRouteReady
      ? 'Type "/" for more options or ask me anything...'
      : 'Initialising agents…'

  return (
    <>
      {isNewChat && <div ref={shortcutsRef} className="position-relative mx-2 mb-1">
        <div className="d-flex flex-row" style={{ gap: '4px' }}>
          {SHORTCUT_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveShortcut(prev => prev === cat.id ? null : cat.id)}
              className="btn btn-sm rounded-pill"
              style={{
                fontSize: '0.72rem',
                padding: '2px 10px',
                border: `1px solid ${activeShortcut === cat.id ? 'var(--custom-ai-color)' : 'var(--bs-border-color)'}`,
                color: activeShortcut === cat.id ? 'var(--custom-ai-color)' : 'var(--bs-secondary-color)',
                backgroundColor: activeShortcut === cat.id ? 'var(--custom-onsurface-layer-1)' : 'var(--bs-body-bg)',
                transition: 'all 0.15s ease',
              }}
              data-id={`shortcut-btn-${cat.id}`}
            >
              {cat.label}
            </button>
          ))}
        </div>
        {activeShortcut && activeCategory && (
          <div
            className="position-absolute rounded-3 shadow-lg overflow-hidden"
            style={{
              bottom: 'calc(100% + 4px)',
              left: 0,
              right: 0,
              backgroundColor: 'var(--bs-body-bg)',
              border: '1px solid var(--bs-border-color)',
              zIndex: 1000,
            }}
            data-id="shortcut-popover"
          >
            {activeCategory.prompts.map((prompt, i) => (
              <button
                key={i}
                onClick={() => handleShortcutSelect(prompt)}
                className="d-block w-100 text-start px-3 py-2 border-0"
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--bs-body-color)',
                  fontSize: '0.8rem',
                  borderBottom: i < activeCategory.prompts.length - 1 ? '1px solid var(--bs-border-color)' : 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--custom-onsurface-layer-1)' }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                data-id={`shortcut-prompt-${i}`}
              >
                {prompt.startsWith('/') ? (
                  <span>
                    <span style={{ color: 'var(--custom-ai-color)', fontWeight: 600 }}>
                      {prompt.substring(0, prompt.indexOf(':') + 1)}
                    </span>
                    {prompt.substring(prompt.indexOf(':') + 1)}
                  </span>
                ) : prompt}
              </button>
            ))}
          </div>
        )}
      </div>}
      <div
        ref={promptAreaRef}
        className="prompt-area d-flex flex-column mx-2 p-1 rounded-3 border border-text position-relative"
        style={{ backgroundColor: themeTracker && themeTracker?.name.toLowerCase() === 'light' ? '#d9dee8' : '#222336' }}
        data-id="remix-ai-prompt-area"
      >
        {showAutocomplete && (
          <AutocompletePanel
            isVisible={showAutocomplete}
            searchTerm={input}
            onSelect={handleCommandSelect}
            position={undefined}
            themeTracker={themeTracker}
            selectedIndex={selectedCommandIndex}
            onSelectedIndexChange={setSelectedCommandIndex}
            extraCommands={actionCommands}
          />
        )}
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
                fontSize: '0.875rem',
                color: '#A2A3BD',
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
              disabled={isStreaming || !aiRouteReady}
              onChange={e => {
                setInput(e.target.value)
              }}
              onKeyDown={handleKeyDown}
              placeholder={placeholderText}
            />
            <div className="d-flex flex-row align-items-center">
              {/* <div className="d-flex flex-row align-items-center"> */}
              <button
                onClick={handleSetModel}
                className="btn btn-text btn-sm small font-weight-light text-dark align-self-end border-0 rounded"
                data-assist-btn="assistant-selector-btn"
                data-id="ai-model-selector-btn"
                ref={modelBtnRef}
              >
                <div className="d-flex flex-row flex-nowrap align-items-center justify-content-center">
                  <span className="text-nowrap">
                    {autoModeEnabled ? 'Auto Mode' : (selectedModel?.displayName || 'Select Model')}
                  </span>
                  {usingOwnApiKey && (
                    <CustomTooltip tooltipText="Using your own API key">
                      <span
                        className="badge bg-success ms-2"
                        style={{ fontSize: '0.6rem', padding: '2px 4px', color: themeTracker && themeTracker?.name.toLowerCase() === 'light' ? '' :'#000' }}
                        data-id="own-api-key-badge"
                      >
                        <i className="fas fa-key me-1" style={{ fontSize: '0.5rem' }}></i>
                        Own Key
                      </span>
                    </CustomTooltip>
                  )}
                  <CustomTooltip
                    tooltipText={
                      aiRoute === 'agent'
                        ? 'DeepAgent ready — subagents + tools available'
                        : aiRoute === 'tools'
                          ? 'MCP tools ready (no subagents)'
                          : aiRoute === 'chat'
                            ? 'Plain chat — no tools or subagents'
                            : 'Initialising agents — please wait'
                    }
                  >
                    <span
                      className={`badge ms-2 ${
                        aiRoute === 'agent'
                          ? 'bg-success'
                          : aiRoute === 'tools'
                            ? 'bg-info'
                            : aiRoute === 'chat'
                              ? 'bg-secondary'
                              : 'bg-warning'
                      }`}
                      style={{ fontSize: '0.6rem', padding: '2px 4px', visibility: selectedModel ? 'visible' : 'hidden', color: themeTracker && themeTracker?.name.toLowerCase() === 'light' ? '' :'#000' }}
                      data-id="ai-route-status"
                      data-route={aiRoute}
                    >
                      {aiRoute === 'agent'
                        ? 'Agent'
                        : aiRoute === 'tools'
                          ? 'Tools'
                          : aiRoute === 'chat'
                            ? 'Chat'
                            : 'Initialising…'}
                    </span>
                  </CustomTooltip>
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
                    <span>{selectedModel?.displayName || 'Select Model'}</span>
                    <span className={showOllamaModelSelector ? "fa fa-caret-up ms-1" : "fa fa-caret-down ms-1"}></span>
                  </div>
                </button>
              )}
              <PromptDefault
                // Only render the cancel/stop affordance for an actual
                // in-flight inference. When the route is merely "not
                // ready yet" (e.g. anonymous user, agents still booting)
                // we must show the disabled send button instead — a
                // stop button that cancels nothing is broken UX and
                // confused users into thinking the assistant was stuck.
                isStreaming={isStreaming}
                disabled={!aiRouteReady}
                handleSend={handleSend}
                themeTracker={themeTracker}
                handleCancel={stopRequest}
                showSignIn={needsSignIn}
                onSignIn={onSignIn}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

