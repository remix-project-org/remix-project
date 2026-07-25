import React, { useContext, useState } from 'react'
import { TemplateExplorerWizardAction } from '../../types/template-explorer-types'
import { TemplateExplorerContext } from '../../context/template-explorer-context'
import { AppContext } from '@remix-ui/app'
import { MatomoCategories } from '@remix-api'

const PROMPT_EXAMPLES = [
  'ERC20 token with minting and burning',
  'NFT collection with marketplace',
  'DAO with on-chain voting',
  'Multisig wallet',
  'DeFi staking contract',
]

export function GenerateWorkspaceWithAi() {
  const { dispatch, plugin, facade, state, trackMatomoEvent } = useContext(TemplateExplorerContext)
  useContext(AppContext)
  const [prompt, setPrompt] = useState('')

  const updatePrompt = (value: string) => {
    setPrompt(value)
    dispatch({ type: TemplateExplorerWizardAction.SET_WORKSPACE_NAME, payload: value })
  }

  return (
    <section className="tem-form-body">
      <div className="d-flex align-items-center justify-content-between">
        <div className="d-flex align-items-center gap-2">
          <img src="assets/img/remixai-logoDefault.webp" style={{ width: '18px', height: '18px' }} />
          <strong style={{ fontSize: '14px', color: 'var(--bs-emphasis-color)' }}>Generate with AI</strong>
        </div>
        <span className="tem-card-tag">Beta</span>
      </div>
      <p className="tem-form-desc">Describe what you want to build and Remix AI will generate a complete workspace for you.</p>
      <textarea
        data-id="ai-workspace-prompt-input"
        className="form-control tem-form-input"
        style={{ flex: 1, resize: 'none', minHeight: '120px', fontSize: '13px' }}
        value={prompt}
        onChange={(e) => updatePrompt(e.target.value)}
        placeholder="I want to create a decentralized voting platform with Solidity..."
      />
      <div className="d-flex flex-wrap gap-2">
        {PROMPT_EXAMPLES.map((example) => (
          <span
            key={example}
            className="tem-prompt-pill"
            onClick={() => updatePrompt(example)}
          >
            {example}
          </span>
        ))}
      </div>
      <div className="d-flex justify-content-end" style={{ padding: '0.5rem 0' }}>
        <button
          className="btn btn-primary btn-sm"
          data-id="validateWorkspaceButton"
          onClick={async () => {
            facade.closeWizard()
            trackMatomoEvent({ category: MatomoCategories.TEMPLATE_EXPLORER_MODAL, action: 'createWorkspaceWithAiRequestSent', name: state.workspaceName, isClick: true })
            await plugin.call('remixaiassistant', 'chatPipe', '/generate ' + state.workspaceName, false, { source: 'template-explorer', presetId: 'generate-workspace' })
            // further matomo events handled by generate function
          }}>
          <i className="fa-solid fa-magic me-2"></i>
          Generate my Workspace
        </button>
      </div>
    </section>
  )
}
