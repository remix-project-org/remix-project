import React, { Dispatch, useState } from 'react'
import { createPortal } from 'react-dom'
import { CustomTooltip } from '@remix-ui/helper'
import { ToggleSwitch } from '@remix-ui/toggle'
import GroupListMenu from './contextOptMenu'
import ModelSelectorMenu from './modelSelectorMenu'
import { PromptArea } from './prompt'
import { groupListType } from '../types/componentTypes'
import { ChatMessage, AIModel, modelKey, ChatAttachment } from '@remix/remix-ai-core'
import type { AttachmentError } from '../hooks/useAttachments'

interface AiChatPromptAreaProps {
    selectedModelId: unknown
    handleOllamaModelSelection: Dispatch<any>
    selectedOllamaModel: unknown
    ollamaModels: any
    themeTracker: any
    showHistorySidebar: boolean
    isMaximized: boolean
    modelOpt: { top?: number, bottom?: number, right: number, width: number, maxHeight?: number }
    menuRef: React.RefObject<HTMLDivElement>
    assistantChoice: any
    setAssistantChoice: React.Dispatch<React.SetStateAction<any>>
    mcpEnabled: boolean
    mcpEnhanced: boolean
    setMcpEnhanced: React.Dispatch<React.SetStateAction<boolean>>
    availableModels: AIModel[]
    selectedModel: any
    handleModelSelection: (modelName: string) => void
    onLockedModelClick?: (modelId: string, modelName: string) => void
    /** Permission-derived state of the per-model "Upgrade plan" pill. */
    upgradePillState?: 'hidden' | 'coming_soon' | 'available'
    /** Permission-derived state of the per-model "Buy credits" pill. */
    buyCreditsPillState?: 'hidden' | 'coming_soon' | 'available'
    /** Called when the user clicks the "Buy credits" pill on a locked model. */
    onBuyCreditsClick?: (modelId: string, modelName: string) => void
    /** Transport provider → whether the user stored a BYOK key for it. */
    byokKeyPresence?: Record<string, boolean>
    /** Opens the API key settings from a model waiting for a key. */
    onAddApiKeyClick?: () => void
    input: string
    setInput: React.Dispatch<React.SetStateAction<string>>
    isStreaming: boolean
    handleSend: () => void
    stopRequest: () => void
    handleSetModel: () => void
    handleGenerateWorkspace: () => void
    dispatchActivity: (type: string, payload?: any) => void
    modelBtnRef: React.RefObject<HTMLButtonElement>
    textareaRef?: React.RefObject<HTMLTextAreaElement>
    maximizePanel: () => Promise<void>
    showModelSelector: boolean
    setShowModelSelector: React.Dispatch<React.SetStateAction<boolean>>
    messages: ChatMessage[]
    handleLoadSkills?: () => void
    handleOpenSettings?: () => void
    handleLoadAuditChecklist?: (mode?: 'audit' | 'checklist') => void
    handleGasOptimisationAudit?: () => void
    usingOwnApiKey?: boolean
    aiRoute?: 'initializing' | 'agent' | 'tools' | 'chat'
    aiRouteReady?: boolean
    modelDegradedDetail?: string
    isAuthenticated?: boolean
    onSignIn?: () => void
    hasAuditorPermission?: boolean
    hasSkillsPermission?: boolean
    onUpgradeRequired?: (commandName: string, missingFeature: string) => void
    getRequiredPlanName?: (feature: string) => string | null
    // --- Image attachments ---
    attachments?: ChatAttachment[]
    attachmentErrors?: AttachmentError[]
    onAddFiles?: (files: FileList | File[] | null) => void
    onRemoveAttachment?: (id: string) => void
    onDismissAttachmentErrors?: () => void
    onCaptureScreenshot?: () => void
    supportsVision?: boolean
    /** Low-cost model filter, switched from the model menu. */
    cheapModelsOnly?: boolean
    hasCheapModels?: boolean
    onToggleCheapModels?: () => void
    /** Commands already used: their tips no longer show. */
    usedCommands?: string[]
    onCommandUsed?: (command: string) => void
    tipDismissed?: boolean
    onDismissTip?: () => void
}

const INSTALL_REPO = 'remix-project-org/remix-ai-plugin'
const CODE_STEPS = [
  'claude plugin marketplace add remix-project-org/remix-ai-plugin',
  'claude plugin install remix-solidity@remixlabs',
  'claude plugin list',
]

export default function AiChatPromptArea(props: AiChatPromptAreaProps) {
  const [showClaudeModal, setShowClaudeModal] = useState(false)
  const [claudeModalTab, setClaudeModalTab] = useState<'web' | 'code' | 'desktop'>('web')
  const [copiedInstallCmd, setCopiedInstallCmd] = useState<string | null>(null)

  const copyInstallCmd = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedInstallCmd(key)
      setTimeout(() => setCopiedInstallCmd(null), 2000)
    })
  }

  const handleLockedItemClick = (item: groupListType) => {
    props.onLockedModelClick?.(item.stateValue, item.label)
  }

  // Local models sit under the "Local (Ollama)" entry of the model menu.
  const ollamaSection = props.selectedModel?.provider === 'ollama' && props.ollamaModels.length > 0 && (
    <div className="rai-ollama-models" data-id="ollama-model-selector">
      <div className="text-uppercase small rai-selector-heading px-3 pt-1 pb-1">Local model</div>
      <GroupListMenu
        setChoice={props.handleOllamaModelSelection}
        setShowOptions={props.setShowModelSelector}
        choice={props.selectedOllamaModel}
        groupList={props.ollamaModels.map((model: any) => {
          const name = typeof model === 'string' ? model : model.name
          const supported = typeof model === 'string' ? true : model.supported
          return {
            label: name,
            bodyText: '',
            icon: 'fa-solid fa-check',
            stateValue: name,
            dataId: `ollama-model-${name.replace(/[^a-zA-Z0-9]/g, '-')}`,
            disabled: !supported,
            disabledReason: 'No tool support'
          }
        })}
      />
    </div>
  )

  return (
    <section
      id="remix-ai-prompt-area"
      className={props.messages.length === 0 ? 'ai-assistant-prompt-bg' : 'ai-prompt-section'}
      style={{ flexShrink: 0 }}
      data-theme={props.themeTracker && props.themeTracker?.name.toLowerCase()}
    >
      {props.showModelSelector && (
        <div
          className="remix-ai-model-selector position-fixed d-flex flex-column"
          style={{ top: props.modelOpt.top, bottom: props.modelOpt.bottom, right: props.modelOpt.right, width: props.modelOpt.width, zIndex: 2000, maxHeight: props.modelOpt.maxHeight || undefined }}
          ref={props.menuRef}
        >
          <div className="rai-mm-top flex-shrink-0">
            <span className="rai-mm-title">Select a model</span>
            {props.onAddApiKeyClick && (
              <button
                type="button"
                className="rai-api-key-btn"
                data-id="ai-model-selector-api-key-btn"
                title="Use your own provider API keys"
                onClick={() => {
                  // Settings opens in another tab, so the floating picker has
                  // to go with it — otherwise it hangs over the new panel.
                  props.setShowModelSelector(false)
                  props.onAddApiKeyClick?.()
                }}
              >
                <i className="fas fa-key"></i>
                API keys
              </button>
            )}
          </div>
          <ModelSelectorMenu
            availableModels={props.availableModels}
            currentChoice={props.selectedModel ? modelKey(props.selectedModel) : props.selectedModelId as string}
            setChoice={props.handleModelSelection}
            setShowOptions={props.setShowModelSelector}
            onLockedItemClick={handleLockedItemClick}
            upgradePillState={props.upgradePillState}
            buyCreditsPillState={props.buyCreditsPillState}
            byokKeyPresence={props.byokKeyPresence}
            onAddApiKeyClick={props.onAddApiKeyClick ? () => props.onAddApiKeyClick?.() : undefined}
            getRequiredPlanName={props.getRequiredPlanName}
            cheapOnly={props.cheapModelsOnly}
            ollamaSection={ollamaSection || undefined}
          >
            <CustomTooltip
              placement="top"
              tooltipText={
                !props.hasCheapModels
                  ? 'No low-cost model is available on your plan'
                  : 'The cheapest tier across all providers, to make your credits last longer.'
              }
            >
              <div className="rai-cheap-switch flex-shrink-0">
                <ToggleSwitch
                  id="ai-cheap-models-toggle"
                  size="sm"
                  tone="ai"
                  label="Low-cost models only"
                  isOn={!!props.cheapModelsOnly}
                  disabled={!props.hasCheapModels}
                  onClick={() => props.onToggleCheapModels?.()}
                />
              </div>
            </CustomTooltip>
          </ModelSelectorMenu>
          {false && props.mcpEnabled && (
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
      <PromptArea
        input={props.input}
        setInput={props.setInput}
        isStreaming={props.isStreaming}
        handleSend={props.handleSend}
        handleSetModel={props.handleSetModel}
        handleModelSelection={props.handleModelSelection}
        handleGenerateWorkspace={props.handleGenerateWorkspace}
        dispatchActivity={props.dispatchActivity}
        modelBtnRef={props.modelBtnRef}
        textareaRef={props.textareaRef}
        assistantChoice={props.assistantChoice}
        themeTracker={props.themeTracker}
        showModelSelector={props.showModelSelector}
        setShowModelSelector={props.setShowModelSelector}
        selectedModel={props.selectedModel}
        selectedOllamaModel={props.selectedOllamaModel}
        stopRequest={props.stopRequest}
        handleLoadSkills={props.handleLoadSkills}
        usingOwnApiKey={props.usingOwnApiKey}
        aiRoute={props.aiRoute}
        aiRouteReady={props.aiRouteReady}
        modelDegradedDetail={props.modelDegradedDetail}
        isAuthenticated={props.isAuthenticated}
        onSignIn={props.onSignIn}
        isNewChat={props.messages.length === 0}
        messages={props.messages}
        usedCommands={props.usedCommands}
        onCommandUsed={props.onCommandUsed}
        tipDismissed={props.tipDismissed}
        onDismissTip={props.onDismissTip}
        handleOpenSettings={props.handleOpenSettings}
        handleLoadAuditChecklist={props.handleLoadAuditChecklist}
        handleGasOptimisationAudit={props.handleGasOptimisationAudit}
        hasAuditorPermission={props.hasAuditorPermission}
        hasSkillsPermission={props.hasSkillsPermission}
        onUpgradeRequired={props.onUpgradeRequired}
        getRequiredPlanName={props.getRequiredPlanName}
        attachments={props.attachments}
        attachmentErrors={props.attachmentErrors}
        onAddFiles={props.onAddFiles}
        onRemoveAttachment={props.onRemoveAttachment}
        onDismissAttachmentErrors={props.onDismissAttachmentErrors}
        onCaptureScreenshot={props.onCaptureScreenshot}
        supportsVision={props.supportsVision}
      />
      <div className="ai-bottom-bar">
        <CustomTooltip placement="top" tooltipText="RemixAI can make mistakes. Check important info.">
          <i className="fa-solid fa-triangle-exclamation ai-disclaimer-icon"></i>
        </CustomTooltip>
        <button className="ai-claude-promo" data-id="ai-claude-promo-btn" onClick={() => setShowClaudeModal(true)}>
          <i className="fa-solid fa-sparkles"></i>
          Use Remix directly in Claude
          <i className="fa-solid fa-chevron-right" style={{ fontSize: '9px' }}></i>
        </button>
      </div>

      {showClaudeModal && createPortal(
        <div className="ai-install-overlay" onClick={() => setShowClaudeModal(false)}>
          <div className="ai-install-modal" onClick={e => e.stopPropagation()}>
            <div className="ai-install-modal-header">
              <span><i className="fa-solid fa-sparkles" style={{ marginRight: '8px' }}></i>Use Remix in Claude</span>
              <button className="ai-install-modal-close" onClick={() => setShowClaudeModal(false)}><i className="fa-solid fa-xmark"></i></button>
            </div>
            <div className="ai-install-tab-bar">
              <button className={`ai-install-tab-btn${claudeModalTab === 'web' ? ' active' : ''}`} onClick={() => setClaudeModalTab('web')}><i className="fa-solid fa-globe"></i> claude.ai</button>
              <button className={`ai-install-tab-btn${claudeModalTab === 'code' ? ' active' : ''}`} onClick={() => setClaudeModalTab('code')}><i className="fa-solid fa-terminal"></i> Claude Code</button>
              <button className={`ai-install-tab-btn${claudeModalTab === 'desktop' ? ' active' : ''}`} onClick={() => setClaudeModalTab('desktop')}><i className="fa-solid fa-desktop"></i> Claude Desktop</button>
            </div>

            {claudeModalTab === 'web' && (
              <ol className="ai-install-steps">
                <li>Go to <strong>claude.ai</strong> and open <strong>Customize</strong> in the left sidebar.</li>
                <li>Open the <strong>Plugins</strong> tab. In <strong>Personal plugins</strong>, click <strong>+</strong> → <strong>Add marketplace</strong>. Depending on your UI version, you may see <strong>Add Marketplace</strong> on an <strong>Added</strong> tab.</li>
                <li>
                  Choose <strong>Add from a repository</strong>, enter the GitHub repo, then click <strong>Sync</strong>.
                  <span className="ai-install-step-cmd">
                    <code className="ai-install-code">{INSTALL_REPO}</code>
                    <button className="ai-install-copy-btn" onClick={() => copyInstallCmd(INSTALL_REPO, 'web-repo')}>
                      <i className={copiedInstallCmd === 'web-repo' ? 'fa-solid fa-check ai-install-copied' : 'fa-regular fa-copy'}></i>
                    </button>
                  </span>
                </li>
                <li>Find <strong>remix-solidity</strong> in the plugin list and click <strong>Install</strong>.</li>
                <li>In a chat, type <code className="ai-install-code-inline">/</code> or click <strong>+</strong> to access skills like <code className="ai-install-code-inline">deploy-contract</code> and <code className="ai-install-code-inline">call-contract</code>.</li>
              </ol>
            )}

            {claudeModalTab === 'code' && (
              <ol className="ai-install-steps">
                <li>
                  Add the Remix marketplace.
                  <span className="ai-install-step-cmd">
                    <code className="ai-install-code">{CODE_STEPS[0]}</code>
                    <button className="ai-install-copy-btn" onClick={() => copyInstallCmd(CODE_STEPS[0], 'code-0')}>
                      <i className={copiedInstallCmd === 'code-0' ? 'fa-solid fa-check ai-install-copied' : 'fa-regular fa-copy'}></i>
                    </button>
                  </span>
                </li>
                <li>
                  Install the Remix Solidity plugin.
                  <span className="ai-install-step-cmd">
                    <code className="ai-install-code">{CODE_STEPS[1]}</code>
                    <button className="ai-install-copy-btn" onClick={() => copyInstallCmd(CODE_STEPS[1], 'code-1')}>
                      <i className={copiedInstallCmd === 'code-1' ? 'fa-solid fa-check ai-install-copied' : 'fa-regular fa-copy'}></i>
                    </button>
                  </span>
                </li>
                <li>
                  Verify — <strong>remix-solidity</strong> should appear in the list.
                  <span className="ai-install-step-cmd">
                    <code className="ai-install-code">{CODE_STEPS[2]}</code>
                    <button className="ai-install-copy-btn" onClick={() => copyInstallCmd(CODE_STEPS[2], 'code-2')}>
                      <i className={copiedInstallCmd === 'code-2' ? 'fa-solid fa-check ai-install-copied' : 'fa-regular fa-copy'}></i>
                    </button>
                  </span>
                </li>
              </ol>
            )}

            {claudeModalTab === 'desktop' && (
              <ol className="ai-install-steps">
                <li>Open <strong>Claude Desktop</strong>, go to the <strong>Cowork</strong> tab, and click <strong>Customize</strong> in the left sidebar.</li>
                <li>Open the <strong>Plugins</strong> tab. In <strong>Personal plugins</strong>, click <strong>+</strong> → <strong>Add marketplace</strong>.</li>
                <li>
                  Choose <strong>Add from a repository</strong>, enter the GitHub repo, then click <strong>Sync</strong>.
                  <span className="ai-install-step-cmd">
                    <code className="ai-install-code">{INSTALL_REPO}</code>
                    <button className="ai-install-copy-btn" onClick={() => copyInstallCmd(INSTALL_REPO, 'desktop-repo')}>
                      <i className={copiedInstallCmd === 'desktop-repo' ? 'fa-solid fa-check ai-install-copied' : 'fa-regular fa-copy'}></i>
                    </button>
                  </span>
                </li>
                <li>Find <strong>remix-solidity</strong> in the marketplace's plugin list and click <strong>Install</strong>.</li>
                <li>Type <code className="ai-install-code-inline">/</code> or click <strong>+</strong> in a chat or Cowork task to access skills like <code className="ai-install-code-inline">deploy-contract</code> and <code className="ai-install-code-inline">call-contract</code>.</li>
              </ol>
            )}
          </div>
        </div>,
        document.body
      )}
    </section>
  )
}
