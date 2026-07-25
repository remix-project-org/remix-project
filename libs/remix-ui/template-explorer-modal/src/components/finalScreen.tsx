import React, { useContext, useState } from 'react'
import { MiniFileExplorer } from './miniFileExplorer'
import { Editor } from '@monaco-editor/react'
import { TemplateExplorerWizardAction } from '../../types/template-explorer-types'
import { TemplateExplorerContext } from '../../context/template-explorer-context'

interface FinalScreenProps {
  strategy?: any
}

export function FinalScreen(props: FinalScreenProps) {
  const { state, dispatch, facade } = useContext(TemplateExplorerContext)
  const [showEditWorkspaceName, setShowEditWorkspaceName] = useState(false)

  return (
    <section className="tem-form-body">
      <div className="d-flex flex-row align-items-center gap-2">
        {showEditWorkspaceName
          ? <input data-id="finalize-contract-wizard-workspaceName-input" type="text" className="form-control form-control-sm tem-form-input" value={state.workspaceName} onChange={(e) => dispatch({ type: TemplateExplorerWizardAction.SET_WORKSPACE_NAME, payload: e.target.value })} />
          : <span data-id="finalize-contract-wizard-workspaceName-span" className="fw-semibold fs-6">{state.workspaceName}</span>
        }
        <i data-id="finalize-contractWizard-workspace-edit-icon" className="fa-solid fa-edit" style={{ cursor: 'pointer', color: 'var(--bs-secondary-color)' }} onClick={() => setShowEditWorkspaceName(!showEditWorkspaceName)}></i>
      </div>
      <button className="btn btn-primary btn-sm" data-id="validateWorkspaceButton" disabled={state.creating} onClick={async () => {
        await facade.createWorkspace({
          workspaceName: state.workspaceName,
          workspaceTemplateName: state.workspaceTemplateChosen.value,
          opts: state.contractOptions,
          isEmpty: false,
          isGitRepo: false,
          createCommit: true,
          contractContent: state.contractCode,
          contractName: state.tokenName
        })
        facade.closeWizard()
      }}>
        {state.creating ? <><i className="fas fa-spinner fa-spin me-2"></i>Creating...</> : 'Finish'}
      </button>
    </section>
  )
}
