import { ActivityType } from "../lib/types"
import React, { MutableRefObject, Ref, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { AiAssistantType } from '../types/componentTypes'
import { MatomoEvent } from '@remix-api';
import { Features } from '@remix-api';
import { useAuth } from '@remix-ui/app'
import { TrackingContext } from '@remix-ide/tracking'
import { CustomTooltip } from '@remix-ui/helper'
import { AIModel } from '@remix/remix-ai-core'
import { PromptDefault } from "./promptDefault";
import { AutocompletePanel, AVAILABLE_COMMANDS, Command } from './AutocompletePanel'
import { ComposerMenu, ComposerActionGroup } from './composerMenu'
import { AttachmentStrip } from './attachmentStrip'
import { ACCEPTED_FILE_ACCEPT_ATTR, AttachmentError, filesFromClipboard } from '../hooks/useAttachments'
import type { ChatAttachment, ChatMessage } from '@remix/remix-ai-core'
import { commandOf, pickTip } from '../lib/commandTips'

const getActiveCommandName = (text: string): string | null => {
  const lastSpaceSlash = text.lastIndexOf(' /')
  const slashStart = lastSpaceSlash !== -1 ? lastSpaceSlash + 1 : text.startsWith('/') ? 0 : -1
  if (slashStart === -1) return null
  const afterSlash = text.slice(slashStart + 1)
  const spaceIdx = afterSlash.indexOf(' ')
  if (spaceIdx === -1) return null
  return afterSlash.slice(0, spaceIdx).trim() || null
}

const getSlashWord = (text: string): string | null => {
  // Only detect slash commands at the beginning or after a space
  const lastSpaceSlash = text.lastIndexOf(' /')
  const slashStart = lastSpaceSlash !== -1 ? lastSpaceSlash + 1 : text.startsWith('/') ? 0 : -1
  if (slashStart === -1) return null

  const afterSlash = text.slice(slashStart)
  if (/\s/.test(afterSlash)) return null

  return afterSlash
}

// PromptArea component
export interface PromptAreaProps {
  input: any
  setInput: React.Dispatch<React.SetStateAction<string>>
  isStreaming: boolean
  handleSend: () => void
  assistantChoice: AiAssistantType
  selectedOllamaModel: any
  handleSetModel: () => void
  handleModelSelection: (modelId: string) => void
  handleGenerateWorkspace: () => void
  selectedModel: AIModel | null
  dispatchActivity: (type: ActivityType, payload?: any) => void
  modelBtnRef: React.RefObject<HTMLButtonElement>
  textareaRef?: React.RefObject<HTMLTextAreaElement>
  showModelSelector: boolean
  setShowModelSelector: React.Dispatch<React.SetStateAction<boolean>>
  themeTracker: any
  stopRequest: () => void
  handleLoadSkills?: () => void
  usingOwnApiKey?: boolean
  aiRoute?: 'initializing' | 'agent' | 'tools' | 'chat'
  aiRouteReady?: boolean
  /** Set while the selected model is running well below its usual speed or size. */
  modelDegradedDetail?: string
  // When false the composer renders an explicit "Sign in" CTA in place
  // of the disabled send button. Without this hint the user just sees a
  // greyed-out paper plane and an "Initialising agents…" placeholder —
  // both technically accurate but confusing because the route will
  // never become ready until they authenticate.
  isAuthenticated?: boolean
  onSignIn?: () => void
  isNewChat?: boolean
  messages?: ChatMessage[]
  usedCommands?: string[]
  onCommandUsed?: (command: string) => void
  tipDismissed?: boolean
  onDismissTip?: () => void
  handleOpenSettings?: () => void
  handleLoadAuditChecklist?: (mode?: 'audit' | 'checklist') => void
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
  // --- Image attachments ---
  attachments?: ChatAttachment[]
  attachmentErrors?: AttachmentError[]
  onAddFiles?: (files: FileList | File[] | null) => void
  onRemoveAttachment?: (id: string) => void
  onDismissAttachmentErrors?: () => void
  onCaptureScreenshot?: () => void
  // False when the selected model cannot read images: the attach affordances
  // are disabled rather than hidden, so the reason stays discoverable.
  supportsVision?: boolean
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
  showModelSelector,
  stopRequest,
  selectedOllamaModel,
  usingOwnApiKey,
  aiRoute = 'chat',
  aiRouteReady = true,
  modelDegradedDetail,
  isAuthenticated = true,
  onSignIn,
  handleLoadSkills,
  handleOpenSettings,
  handleLoadAuditChecklist,
  handleGasOptimisationAudit,
  hasAuditorPermission = false,
  hasSkillsPermission = false,
  onUpgradeRequired,
  getRequiredPlanName,
  attachments = [],
  attachmentErrors = [],
  onAddFiles,
  onRemoveAttachment,
  onDismissAttachmentErrors,
  onCaptureScreenshot,
  supportsVision = true,
  messages = [],
  usedCommands = [],
  onCommandUsed,
  tipDismissed = false,
  onDismissTip
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
  const composerRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Text and source files are sent as plain text, so they work on any model.
  // Only images and PDFs need a vision-capable one — the button stays enabled
  // either way and the send path reports what could not be included.
  // An anonymous user cannot send, so attaching would only stage files that can't go anywhere.
  const attachHint = !isAuthenticated
    ? 'Sign in to attach files'
    : supportsVision
      ? 'Attach a file — image, PDF, or source/text file'
      : `Attach a text or source file. ${selectedModel?.displayName || 'This model'} cannot read images or PDFs.`
  const canAttach = Boolean(onAddFiles) && !isStreaming && isAuthenticated

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (!canAttach) return
    const files = filesFromClipboard(e)
    if (files.length === 0) return
    // Only swallow the paste when it really carried files; a mixed
    // text+file clipboard should still deliver its text.
    e.preventDefault()
    onAddFiles?.(files)
  }, [canAttach, onAddFiles])

  const handleDrop = useCallback((e: React.DragEvent) => {
    setIsDragging(false)
    if (!canAttach) return
    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return
    e.preventDefault()
    onAddFiles?.(files)
  }, [canAttach, onAddFiles])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!canAttach) return
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return
    e.preventDefault()
    setIsDragging(true)
  }, [canAttach])
  // Auto-size the textarea to its content. Skipped while it isn't rendered
  // (e.g. mounted inside a still-hidden panel on a mode switch): a hidden
  // textarea measures 0 and would stay collapsed at min-height until typing.
  const resizeTextarea = useCallback(() => {
    const el = textareaRef?.current
    if (!el || el.offsetWidth === 0) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [textareaRef])

  useEffect(() => {
    resizeTextarea()
  }, [input, resizeTextarea])

  // Re-size when the width changes: hidden → visible, docked ↔ AI mode, panel
  // resizes (text wraps differently). Height-only changes are ignored, as they
  // come from resizeTextarea itself.
  useEffect(() => {
    const el = textareaRef?.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let lastWidth = el.offsetWidth
    const observer = new ResizeObserver(() => {
      if (el.offsetWidth === lastWidth) return
      lastWidth = el.offsetWidth
      resizeTextarea()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [textareaRef, resizeTextarea])

  // Handle autocomplete visibility
  useEffect(() => {
    const hasSlashWord = !!getSlashWord(input)
    const shouldShow = hasSlashWord && !isStreaming

    setShowAutocomplete(shouldShow)
    // Reset selected index when hiding or showing the panel
    if (!shouldShow || (shouldShow && !showAutocomplete)) {
      setSelectedCommandIndex(0)
    }
  }, [input, isStreaming, showAutocomplete])

  const actionCommands: Command[] = useMemo(() => {
    const cmds: Command[] = [
      { name: 'model', description: 'Switch AI model', category: 'Settings', action: handleSetModel, requiredFeatures: []},
    ]
    if (handleOpenSettings) cmds.push({ name: 'settings', description: 'Open RemixAI settings', category: 'Settings', action: handleOpenSettings, requiredFeatures: []})
    if (handleLoadSkills) {
      cmds.push({
        name: 'load-skills',
        description: 'Load skills',
        category: 'Audit',
        action: handleLoadSkills,
        disabled: false,
        requiredFeatures: [Features.SKILLS_BASIC]
      })
    }
    if (handleLoadAuditChecklist) {
      cmds.push({
        name: 'audit',
        description: 'Audit a contract',
        requiredFeatures: [Features.AI_AUDITOR],
        category: 'Audit',
        action: () => {
          handleLoadAuditChecklist('audit')
        },
        disabled: !hasAuditorPermission
      })
      cmds.push({
        name: 'load-audit-checklist',
        description: 'Load audit checklist',
        category: 'Audit',
        // Checklist mode: write the files and stop, no audit run.
        action: () => handleLoadAuditChecklist('checklist'),
        requiredFeatures: [Features.AI_AUDITOR],
        disabled: !hasAuditorPermission
      })
    }
    if (handleGasOptimisationAudit) cmds.push({ name: 'gas-audit', description: 'Gas optimisation audit', category: 'Audit', action: handleGasOptimisationAudit, requiredFeatures: [Features.AI_AUDITOR]})
    if (handleLoadSkills) {
      cmds.push({
        name: 'load-skills',
        description: 'Skills',
        category: 'Skills',
        action: handleLoadSkills,
        disabled: false,
        requiredFeatures: [Features.SKILLS_BASIC]
      })
    }
    return cmds
  }, [handleSetModel, handleOpenSettings, handleLoadSkills, handleLoadAuditChecklist, handleGasOptimisationAudit, hasAuditorPermission, hasSkillsPermission, setInput])

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
      onCommandUsed?.(command.name)
      setInput('')
      setTimeout(() => command.action!(), 0)
    } else {
      const lastSpaceSlash = input.lastIndexOf(' /')
      const slashStart = lastSpaceSlash !== -1 ? lastSpaceSlash + 1 : input.startsWith('/') ? 0 : input.length
      setInput(input.slice(0, slashStart) + '/' + command.name + ' ')
    }
    textareaRef?.current?.focus()
  }, [input, setInput, setShowAutocomplete, getMissingFeature, onUpgradeRequired, onCommandUsed, handleLoadAuditChecklist, hasAuditorPermission])

  const handleShortcutSelect = useCallback((prompt: string) => {
    setInput(prompt)
    textareaRef?.current?.focus()
  }, [setInput])

  // Sending "/cmd …" counts as using the command, so its tip stops showing.
  const send = useCallback(() => {
    const command = commandOf(input)
    if (command) onCommandUsed?.(command)
    handleSend()
  }, [input, handleSend, onCommandUsed])

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
        send()
      } else {
        // No autocomplete panel visible, just send the message
        send()
      }
    }
  }, [showAutocomplete, selectedCommandIndex, isStreaming, aiRouteReady, isAuthenticated, send, setInput, setShowAutocomplete])

  // The "+" menu closes on a click outside the composer and on Escape.
  useEffect(() => {
    if (!menuOpen) return
    const handleOutsideClick = (e: MouseEvent) => {
      if (composerRef.current && !composerRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [menuOpen])

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

  const actionGroups: ComposerActionGroup[] = useMemo(() => {
    const byCategory: Record<string, Command[]> = {}
    for (const cmd of actionCommands) {
      const cat = cmd.category ?? 'Other'
      if (cat === 'Settings') continue
      if (!byCategory[cat]) byCategory[cat] = []
      byCategory[cat].push(cmd)
    }
    return Object.keys(byCategory).map(cat => ({ id: cat.toLowerCase(), label: cat, commands: byCategory[cat] }))
  }, [actionCommands])

  // Contextual hint for a just-inserted command (e.g. "/compile ") so the user
  const activeCommandHint = useMemo(() => {
    const name = getActiveCommandName(input)
    if (!name) return null
    const cmd = AVAILABLE_COMMANDS.find(c => c.name.toLowerCase() === name.toLowerCase())
    return cmd?.hint ?? null
  }, [input])

  // The composer has three resting states:
  //   1. ready              → normal send/stop affordance
  //   2. !ready & authed    → disabled send (agents still booting)
  //   3. !ready & anonymous → sign-in CTA (no amount of waiting fixes it)
  // Logout doesn't reliably flip `aiRouteReady` (the route was already ready),
  // so authentication is the source of truth for whether the composer is
  // usable. Folding it in here disables the input + send button and surfaces
  // the sign-in CTA the instant the user logs out. The CTA therefore must not
  // depend on `aiRouteReady` either — after a logout the route stays ready.
  const composerReady = aiRouteReady && isAuthenticated
  const needsSignIn = !isAuthenticated && !!onSignIn
  const hasContent = input.trim().length > 0 || attachments.length > 0
  const placeholderText = needsSignIn
    ? 'Sign in to chat with RemixAI…'
    : aiRouteReady
      ? 'Ask anything, or type / for commands'
      : 'Initialising agents…'

  // One dot on the model button stands for the route and the degraded state;
  // its tooltip spells them out, with the BYOK key.
  const routeDot = !aiRouteReady || aiRoute === 'initializing' || modelDegradedDetail ? 'warn' : aiRoute
  const modelTooltip = !selectedModel ? 'Select a model' : [
    aiRoute === 'agent'
      ? 'Agent ready: tools and subagents available'
      : aiRoute === 'tools'
        ? 'MCP tools ready (no subagents)'
        : aiRoute === 'chat'
          ? 'Plain chat: no tools or subagents'
          : 'Initialising agents, please wait',
    usingOwnApiKey ? 'Using your own API key' : null,
    modelDegradedDetail ? `This model is underperforming: ${modelDegradedDetail}. Consider switching models.` : null
  ].filter(Boolean).join('. ')
  // A tip teaches one /command that fits the conversation; only commands the
  // user can run and hasn't used yet.
  const tip = useMemo(() => {
    const canUse = (name: string) => {
      const cmd = [...AVAILABLE_COMMANDS, ...actionCommands].find(c => c.name === name)
      return !!cmd && !getMissingFeature(cmd)
    }
    return pickTip(messages, usedCommands, canUse)
  }, [messages, usedCommands, actionCommands, getMissingFeature])
  const showTip = !!tip && !tipDismissed && isAuthenticated && !input

  const modelName = selectedModel?.provider === 'ollama' && selectedOllamaModel
    ? selectedOllamaModel
    : selectedModel?.displayName || 'Select Model'

  return (
    <div ref={composerRef} className="ai-composer">
      {menuOpen && (
        <ComposerMenu
          actionGroups={actionGroups}
          hasFeature={hasFeature}
          isAuthenticated={isAuthenticated}
          getRequiredPlanName={getRequiredPlanName}
          onUpgradeRequired={onUpgradeRequired}
          onPickPrompt={(text, categoryId, i) => {
            // Track which canned prompt was picked by category + index —
            // never the prompt text (kept short and content-free).
            trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'shortcut_selected', value: `${categoryId}:${i}`, isClick: true })
            handleShortcutSelect(text)
          }}
          onRunCommand={(cmd) => {
            trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'tool_selected', value: cmd.name, isClick: true })
            onCommandUsed?.(cmd.name)
            cmd.action?.()
          }}
          onOpenGroup={(id) => trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'command_category_open', value: id, isClick: true })}
          onClose={() => setMenuOpen(false)}
          attach={onAddFiles ? {
            enabled: canAttach,
            hint: attachHint,
            onClick: () => {
              trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'attachFile', isClick: true })
              fileInputRef.current?.click()
            }
          } : undefined}
          screenshot={onCaptureScreenshot ? {
            enabled: canAttach && supportsVision,
            hint: !isAuthenticated
              ? 'Sign in to attach a screenshot'
              : supportsVision
                ? 'Attach a screenshot of the IDE'
                : `${selectedModel?.displayName || 'This model'} cannot read images. Pick a vision-capable model.`,
            onClick: () => {
              trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'captureScreenshot', isClick: true })
              onCaptureScreenshot()
            }
          } : undefined}
        />
      )}
      {showTip && (
        <div className="ai-tip" data-id="remix-ai-tip">
          <i className="far fa-lightbulb ai-tip-icon"></i>
          <span className="ai-tip-text">
            <button
              type="button"
              className="ai-tip-cmd"
              data-id="remix-ai-tip-command"
              onClick={() => {
                trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'tip_used', value: tip.command, isClick: true })
                setInput(`/${tip.command} `)
                textareaRef?.current?.focus()
              }}
            >
              /{tip.command}
            </button> {tip.text}
          </span>
          <button
            type="button"
            className="ai-tip-close"
            data-id="remix-ai-tip-close"
            aria-label="Hide tips"
            title="Hide tips for this conversation"
            onClick={() => {
              trackMatomoEvent({ category: 'ai', action: 'remixAI', name: 'tip_dismissed', value: tip.command, isClick: true })
              onDismissTip?.()
            }}
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
      )}
      <div
        ref={promptAreaRef}
        className={`ai-composer-box ${isDragging ? 'is-dragging' : ''}`}
        data-id="remix-ai-prompt-area"
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
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
        <AttachmentStrip
          attachments={attachments}
          errors={attachmentErrors}
          onRemove={id => onRemoveAttachment?.(id)}
          onDismissErrors={onDismissAttachmentErrors}
        />
        <textarea
          ref={textareaRef}
          rows={1}
          className="ai-composer-input"
          id="remix-ai-prompt-input"
          data-id="remix-ai-prompt-input"
          value={input}
          disabled={isStreaming || !composerReady}
          onChange={e => {
            setInput(e.target.value)
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholderText}
        />
        {activeCommandHint && (
          <div className="ai-composer-hint" data-id="command-hint">
            <i className="fa-regular fa-circle-question me-1"></i>
            {activeCommandHint}
          </div>
        )}
        <div className="ai-composer-bar">
          <div className="ai-composer-bar-left">
            {onAddFiles && (
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FILE_ACCEPT_ATTR}
                multiple
                className="d-none"
                data-id="remix-ai-attach-input"
                onChange={e => {
                  onAddFiles(e.target.files)
                  // Reset so picking the same file twice still fires onChange.
                  e.target.value = ''
                }}
              />
            )}
            <button
              type="button"
              className={`ai-composer-plus ${menuOpen ? 'on' : ''}`}
              data-id="remix-ai-composer-plus"
              aria-label="Attach, prompts and commands"
              aria-expanded={menuOpen}
              title="Attach, prompts and commands"
              onClick={() => setMenuOpen(open => !open)}
            >
              <i className="fas fa-plus"></i>
            </button>
          </div>
          <div className="ai-composer-bar-right">
            {/* No `hide` toggle here: swapping the wrapper remounts the button
                mid-click and the menu's click-outside handler closes it again. */}
            <CustomTooltip placement="top" tooltipText={modelTooltip}>
              <span className="ai-model-btn-wrap">
                <button
                  type="button"
                  onClick={handleSetModel}
                  className={`ai-model-btn ${showModelSelector ? 'on' : ''}`}
                  data-assist-btn="assistant-selector-btn"
                  data-id="ai-model-selector-btn"
                  ref={modelBtnRef}
                >
                  {selectedModel && (
                    <span
                      className={`ai-route-dot ai-route-dot-${routeDot}`}
                      data-id="ai-route-status"
                      data-route={aiRoute}
                      data-degraded={modelDegradedDetail ? 'true' : undefined}
                    ></span>
                  )}
                  <span className="ai-model-name">{modelName}</span>
                  {usingOwnApiKey && <i className="fas fa-key ai-model-key" data-id="own-api-key-badge"></i>}
                  <i className={`fas fa-chevron-${showModelSelector ? 'down' : 'up'} ai-model-chevron`}></i>
                </button>
              </span>
            </CustomTooltip>
            <PromptDefault
              isStreaming={isStreaming}
              hasContent={hasContent}
              disabled={!composerReady}
              handleSend={send}
              handleCancel={stopRequest}
              showSignIn={needsSignIn}
              onSignIn={onSignIn}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

