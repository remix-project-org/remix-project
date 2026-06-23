import { ActivityType } from "../lib/types"
import React, { MutableRefObject, Ref, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react'
import GroupListMenu from "./contextOptMenu"
import { AiAssistantType, AiContextType, groupListType } from '../types/componentTypes'
import { MatomoEvent } from '@remix-api';
import { Features } from '@remix-api';
import { useAuth } from '@remix-ui/app'
import { TrackingContext } from '@remix-ide/tracking'
import { CustomTooltip } from '@remix-ui/helper'
import { AIModel } from '@remix/remix-ai-core'
import { PromptDefault } from "./promptDefault";
import { AutocompletePanel, Command } from './AutocompletePanel'

const getSlashWord = (text: string): string | null => {
  // Only detect slash commands at the beginning or after a space
  const lastSpaceSlash = text.lastIndexOf(' /')
  const slashStart = lastSpaceSlash !== -1 ? lastSpaceSlash + 1 : text.startsWith('/') ? 0 : -1
  if (slashStart === -1) return null

  const afterSlash = text.slice(slashStart)

  // If there's already a colon, the command is complete
  if (afterSlash.includes(':')) return null

  // Extract the word after the slash (until space or end)
  const nextSpace = afterSlash.indexOf(' ')
  const word = nextSpace === -1 ? afterSlash : afterSlash.slice(0, nextSpace)

  // Return the word to show autocomplete
  return word
}

// A shortcut prompt is either a plain prompt string (always available) or an
// object that additionally lists the features required to use it. Gated
// prompts behave like the permission-locked slash commands (e.g. Load Skills):
// when the user lacks a required feature they see a lock + upsell/sign-in badge
// and clicking routes to the plan manager instead of filling the composer.
type ShortcutPrompt = string | { text: string; requiredFeatures?: string[] }

interface ShortcutCategory {
  id: string
  label: string
  prompts: ShortcutPrompt[]
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    id: 'code',
    label: 'Code',
    prompts: [
      { text: 'Write a Solidity ERC20 token with mint and burn functions', requiredFeatures: [Features.AI_SOLCODER] },
      { text: 'Add an ownable access control to a contract', requiredFeatures: [Features.AI_SOLCODER] },
      { text: '/compile: fix any errors in the active file', requiredFeatures: [Features.AI_SOLCODER] },
    ],
  },
  {
    id: 'explain',
    label: 'Explain',
    prompts: [
      { text: 'Explain what this contract does line by line', requiredFeatures: [Features.AI_SOLCODER] },
      { text: 'What are the security risks in this code?', requiredFeatures: [Features.AI_SOLCODER] },
      { text: 'What does this function return and when does it revert?', requiredFeatures: [Features.AI_SOLCODER] },
    ],
  },
  {
    id: 'learn',
    label: 'Learn',
    prompts: [
      { text: 'What is a smart contract?', requiredFeatures: [Features.AI_SOLCODER] },
      { text: 'How does gas work in Ethereum?', requiredFeatures: [Features.AI_SOLCODER] },
      { text: 'What is the difference between memory and storage in Solidity?', requiredFeatures: [Features.AI_SOLCODER] },
    ],
  },
  {
    id: 'deploy',
    label: 'Deploy',
    prompts: [
      { text: '/deploy: deploy this contract to Sepolia testnet', requiredFeatures: [Features.AI_SOLCODER] },
      { text: 'How do I verify my contract on Etherscan?', requiredFeatures: [Features.AI_SOLCODER] },
      { text: 'What network should I use for testing?', requiredFeatures: [Features.AI_SOLCODER] },
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
  // Called when the user picks a slash command they are not entitled to.
  // Receives the command name and the first missing feature key so the
  // host can open the plan manager with the right upgrade context.
  onUpgradeRequired?: (commandName: string, missingFeature: string) => void
  // Resolves a missing feature to the cheapest plan that grants it (e.g.
  // "Pro") so locked commands can label their badge with the target tier.
  getRequiredPlanName?: (feature: string) => string | null
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
  selectedOllamaModel,
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
  hasSkillsPermission = false,
  onUpgradeRequired,
  getRequiredPlanName
}) => {
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = MatomoEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }
  const { features } = useAuth()
  // Single source of truth for "does the signed-in user have feature X".
  // Mirrors the permissions shape used across the assistant (Record or
  // array of feature entries). Used to gate slash commands behind the
  // plan manager.
  const hasFeature = useCallback((feature: string): boolean => {
    if (!features) return false
    if (Array.isArray(features)) return features.some((f: any) => f?.feature_name === feature && f?.is_enabled !== false)
    const entry = (features as Record<string, any>)[feature]
    if (entry == null) return false
    if (typeof entry === 'boolean') return entry
    return entry?.is_enabled !== false && entry?.allowed !== false
  }, [features])

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
    // Don't show autocomplete if input ends with ": " (completed command)
    const endsWithCommandColon = input.trimEnd().endsWith(':')
    const hasSlashWord = !!getSlashWord(input)
    const shouldShow = hasSlashWord && !isStreaming && !endsWithCommandColon

    setShowAutocomplete(shouldShow)
    // Reset selected index when hiding or showing the panel
    if (!shouldShow || (shouldShow && !showAutocomplete)) {
      setSelectedCommandIndex(0)
    }
    if (input.length > 0) setActiveShortcut(null)
  }, [input, isStreaming, showAutocomplete])

  const actionCommands: Command[] = useMemo(() => {
    const cmds: Command[] = [
      { name: 'model', description: 'Switch AI model', category: 'Settings', action: handleSetModel, requiredFeatures: [] },
    ]
    if (handleOpenSettings) cmds.push({ name: 'settings', description: 'Open RemixAI settings', category: 'Settings', action: handleOpenSettings, requiredFeatures: [] })
    if (handleLoadSkills) {
      cmds.push({
        name: 'Load Skills',
        description: 'Load skills',
        category: 'Tools',
        action: handleLoadSkills,
        disabled: false,
        requiredFeatures: [Features.SKILLS_BASIC]
      })
    }
    if (handleLoadAuditChecklist) {
      cmds.push({
        name: 'Load Security Audit checklist',
        description: 'Load audit checklist',
        category: 'Tools',
        action: handleLoadAuditChecklist,
        requiredFeatures: [Features.AI_AUDITOR]
      })
    }
    if (handleGasOptimisationAudit) cmds.push({ name: 'Start Gas Optimisation Audit', description: 'Gas optimisation audit', category: 'Tools', action: handleGasOptimisationAudit, requiredFeatures: [Features.AI_AUDITOR] })
    return cmds
  }, [handleSetModel, handleOpenSettings, handleLoadSkills, handleLoadAuditChecklist, handleGasOptimisationAudit])

  // Returns the first required feature the user is missing for a command,
  // or null when the command is fully unlocked.
  const getMissingFeature = useCallback((command: Command): string | null => {
    if (!command.requiredFeatures?.length) return null
    return command.requiredFeatures.find((f) => !hasFeature(f)) ?? null
  }, [hasFeature])

  // Handle command selection
  const handleCommandSelect = useCallback((command: Command) => {
    setShowAutocomplete(false)

    // Gate: if the user lacks any required feature, route to the plan
    // manager instead of running the command.
    const missingFeature = getMissingFeature(command)
    if (missingFeature) {
      trackMatomoEvent({
        category: 'ai',
        action: 'remixAI',
        value: `command_upgrade_required_${command.name}`,
        isClick: true
      })
      onUpgradeRequired?.(command.name, missingFeature)
      setInput('')
      textareaRef?.current?.focus()
      return
    }

    // Track command selection with Matomo
    trackMatomoEvent({
      category: 'ai',
      action: 'remixAI',
      value: `command_selected_${command.name}`,
      isClick: true
    })

    if (command.action) {
      setInput('')
      setTimeout(() => command.action!(), 0)
    } else {
      const lastSpaceSlash = input.lastIndexOf(' /')
      const slashStart = lastSpaceSlash !== -1 ? lastSpaceSlash + 1 : input.startsWith('/') ? 0 : input.length
      setInput(input.slice(0, slashStart) + '/' + command.name + ': ')
    }
    textareaRef?.current?.focus()
  }, [input, setInput, setShowAutocomplete, getMissingFeature, onUpgradeRequired])

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
        // Tab key selects the highlighted command from autocomplete
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
    if (e.key === 'Enter' && !e.shiftKey && !isStreaming && aiRouteReady && isAuthenticated) {
      e.preventDefault()

      // If autocomplete panel is visible, select the highlighted command
      if (showAutocomplete) {
        const buttons = document.querySelectorAll('[data-id^="autocomplete-item-"]')
        if (buttons.length > 0 && buttons[selectedCommandIndex]) {
          // Click the selected command button
          (buttons[selectedCommandIndex] as HTMLButtonElement).click()
          // The click handler will hide the panel and update the input
          return
        }
        // If no commands in panel (shouldn't happen), hide panel and send
        setShowAutocomplete(false)
        handleSend()
      } else {
        // No autocomplete panel visible, just send the message
        handleSend()
      }
    }
  }, [showAutocomplete, selectedCommandIndex, isStreaming, aiRouteReady, isAuthenticated, handleSend, setInput, setShowAutocomplete])

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

  useEffect(() => {
    if (!showAutocomplete) return
    const handleOutsideClick = (e: MouseEvent) => {
      if (promptAreaRef.current && !promptAreaRef.current.contains(e.target as Node)) {
        setShowAutocomplete(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [showAutocomplete])

  // The composer has three resting states:
  //   1. ready              → normal send/stop affordance
  //   2. !ready & authed    → disabled send (agents still booting)
  //   3. !ready & anonymous → sign-in CTA (no amount of waiting fixes it)
  // We split state 3 out so the user doesn't sit there waiting on a
  // route that can never become ready until they authenticate.
  const activeCategory = activeShortcut ? (SHORTCUT_CATEGORIES.find(c => c.id === activeShortcut) ?? null) : null

  const toolCommands = actionCommands.filter(cmd => cmd.category === 'Tools')

  // Logout doesn't reliably flip `aiRouteReady` (the route was already ready),
  // so authentication is the source of truth for whether the composer is
  // usable. Folding it in here disables the input + send button and surfaces
  // the sign-in CTA the instant the user logs out.
  const composerReady = aiRouteReady && isAuthenticated
  const needsSignIn = !isAuthenticated && !!onSignIn
  const placeholderText = needsSignIn
    ? 'Sign in to chat with RemixAI…'
    : aiRouteReady
      ? 'Type "/" for more options or ask me anything...'
      : 'Initialising agents…'

  return (
    <>
      {isNewChat && <div ref={shortcutsRef} className="position-relative mx-2 mb-1">
        <div className="d-flex flex-row" style={{ gap: '4px' }}>
          {[...SHORTCUT_CATEGORIES, ...(toolCommands.length > 0 ? [{ id: 'tools', label: 'Tools' }] : [])].map(cat => (
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
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--custom-onsurface-layer-1)' }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = activeShortcut === cat.id ? 'var(--custom-onsurface-layer-1)' : 'var(--bs-body-bg)' }}
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
            {activeCategory.prompts.map((prompt, i) => {
              // Normalise the string|object prompt shape and resolve whether
              // the user is missing any required feature (same gating model as
              // the Tools commands / Load Skills).
              const promptText = typeof prompt === 'string' ? prompt : prompt.text
              const requiredFeatures = typeof prompt === 'string' ? undefined : prompt.requiredFeatures
              const missingFeature = requiredFeatures?.find((f) => !hasFeature(f)) ?? null
              const isLocked = missingFeature !== null
              return (
                <button
                  key={i}
                  onClick={() => {
                    // Locked prompt → route to the plan manager (or sign-in
                    // when anonymous) instead of dropping it into the composer.
                    if (isLocked) {
                      setActiveShortcut(null)
                      onUpgradeRequired?.(promptText, missingFeature as string)
                      return
                    }
                    handleShortcutSelect(promptText)
                  }}
                  className="d-flex align-items-center justify-content-between w-100 text-start px-3 py-2 border-0"
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
                  <span>
                    {promptText.startsWith('/') ? (
                      <span>
                        <span style={{ color: 'var(--custom-ai-color)', fontWeight: 600 }}>
                          {promptText.substring(0, promptText.indexOf(':') + 1)}
                        </span>
                        {promptText.substring(promptText.indexOf(':') + 1)}
                      </span>
                    ) : promptText}
                  </span>
                  {isLocked && (
                    <span
                      className="badge rounded-pill ms-2"
                      style={{
                        backgroundColor: 'var(--custom-ai-color)',
                        color: 'var(--bs-body-bg)',
                        fontSize: '0.6rem',
                        padding: '2px 6px',
                        fontWeight: 'normal',
                        whiteSpace: 'nowrap'
                      }}
                      data-id={`shortcut-prompt-upgrade-${i}`}
                    >
                      {!isAuthenticated ? 'Sign in' : (getRequiredPlanName?.(missingFeature as string) ?? 'Upgrade')}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
        {activeShortcut === 'tools' && (
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
            data-id="shortcut-popover-tools"
          >
            {toolCommands.map((cmd, i) => {
              const missingFeature = getMissingFeature(cmd)
              const isLocked = missingFeature !== null
              return (
                <button
                  key={cmd.name}
                  onClick={() => {
                    setActiveShortcut(null)
                    if (isLocked) {
                      onUpgradeRequired?.(cmd.name, missingFeature as string)
                      return
                    }
                    cmd.action?.()
                  }}
                  className="d-block w-100 text-start px-3 py-2 border-0"
                  style={{
                    backgroundColor: 'transparent',
                    color: 'var(--bs-body-color)',
                    fontSize: '0.8rem',
                    borderBottom: i < toolCommands.length - 1 ? '1px solid var(--bs-border-color)' : 'none',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--custom-onsurface-layer-1)' }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                  data-id={`shortcut-tool-${cmd.name}`}
                >
                  <span style={{ color: 'var(--custom-ai-color)', fontWeight: 600 }}>/{cmd.name}</span>
                  <span className="ms-2" style={{ color: 'var(--bs-secondary-color)', fontSize: '0.75rem' }}>{cmd.description}</span>
                  {isLocked && (
                    <span
                      className="badge rounded-pill ms-2"
                      style={{
                        backgroundColor: 'var(--custom-ai-color)',
                        color: 'var(--bs-body-bg)',
                        fontSize: '0.6rem',
                        padding: '2px 6px',
                        fontWeight: 'normal'
                      }}
                      data-id={`shortcut-tool-upgrade-${cmd.name}`}
                    >
                      {!isAuthenticated ? 'Sign in' : (getRequiredPlanName?.(missingFeature as string) ?? 'Upgrade')}
                    </span>
                  )}
                </button>
              )
            })}
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
            searchTerm={getSlashWord(input) ?? '/'}
            onSelect={handleCommandSelect}
            position={undefined}
            themeTracker={themeTracker}
            selectedIndex={selectedCommandIndex}
            onSelectedIndexChange={setSelectedCommandIndex}
            extraCommands={actionCommands}
            hasFeature={hasFeature}
            isAuthenticated={isAuthenticated}
            onUpgradeRequired={(cmd, missingFeature) => onUpgradeRequired?.(cmd.name, missingFeature)}
            getRequiredPlanName={getRequiredPlanName}
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
              disabled={isStreaming || !composerReady}
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
                  style={{ whiteSpace: 'nowrap', minWidth: 'fit-content' }}
                  ref={modelSelectorBtnRef}
                  data-id="ollama-model-selector"
                  data-assist-btn="assistant-selector-btn"
                >
                  <div className="d-flex flex-row flex-nowrap align-items-center justify-content-center">
                    <span style={{ whiteSpace: 'nowrap' }}>{selectedOllamaModel || 'Select Ollama Model'}</span>
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
                disabled={!composerReady}
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

