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
    <section className="flex flex-col gap-3 bg-light" style={{ height: '80%' }}>
      <div className="pt-3 pl-3 flex flex-row items-center text-dark">
        { showEditWorkspaceName ? <input data-id="finalize-contract-wizard-workspaceName-input" type="text" className="form-control form-control-sm" value={state.workspaceName} onChange={(e) => dispatch({ type: TemplateExplorerWizardAction.SET_WORKSPACE_NAME, payload: e.target.value })} /> : <span data-id="finalize-contract-wizard-workspaceName-span" className="fw-semibold fs-6">{state.workspaceName}</span> }
        <i data-id="finalize-contractWizard-workspace-edit-icon" className="fa-solid fa-edit ml-2" onClick={() => setShowEditWorkspaceName(!showEditWorkspaceName)}></i>
      </div>

      <button className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors btn-sm mx-3" data-id="validateWorkspaceButton" disabled={state.creating} onClick={async () => {
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
      }}>{state.creating ? <><i className="fas fa-spinner fa-spin mr-2"></i>Creating...</> : 'Finish'}</button>
    </section>
  )
}
