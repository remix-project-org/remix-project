import React, { useContext, useReducer } from 'react'
import { TemplateExplorerWizardAction } from '../../types/template-explorer-types'
import { TemplateExplorerContext } from '../../context/template-explorer-context'
import { AppContext } from '@remix-ui/app'
import { MatomoCategories } from '@remix-api'

export function GenerateWorkspaceWithAi() {
  const { dispatch, plugin, facade, state, theme, trackMatomoEvent } = useContext(TemplateExplorerContext)
  const { setIsAiWorkspaceBeingGenerated } = useContext(AppContext)
  return (
    <section className="mx-3 p-2">
      <div className="d-flex flex-column p-3 bg-light" style={{ minHeight: '90%', borderRadius: '10px' }}>
        <div className="d-flex flex-row justify-content-between align-items-center mb-3 border-bottom border-light">
          <label className="form-label text-uppercase mb-2">Write a prompt to generate a workspace</label>
          <span className="badge badge-pill text-primary border mb-2 border-primary">Beta</span>
        </div>
        <div>
          <textarea className={`form-control ${theme.name === 'Light' ? 'text-dark' : 'text-white'}`} onChange={(e) => dispatch({ type: TemplateExplorerWizardAction.SET_WORKSPACE_NAME, payload: e.target.value })}
            placeholder="I want to create a decentralized voting platform with Solidity"
            rows={10}
          />
        </div>
        <div className="d-flex justify-content-end align-items-center mt-3">
          <button className="btn btn-primary btn-sm" data-id="validateWorkspaceButton" onClick={async () => {
            facade.closeWizard()

            trackMatomoEvent({ category: MatomoCategories.TEMPLATE_EXPLORER_MODAL, action: 'createWorkspaceWithAiRequestSent', name: state.workspaceName, isClick: true })
            await plugin.call('remixaiassistant', 'chatPipe', '/generate ' + state.workspaceName)
            // further matomo events handled by generate function
          }}>
            <i className="fa-solid fa-magic me-2"></i>
          Generate my Workspace
          </button>
        </div>
      </div>
    </section>
  )
}
