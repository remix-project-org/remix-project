import React, { useContext, useState } from 'react'
import { MiniFileExplorer } from './miniFileExplorer'
import { Editor } from '@monaco-editor/react'
import { TemplateExplorerWizardAction } from '../../types/template-explorer-types'
import { TemplateExplorerContext } from '../../context/template-explorer-context'

interface ScriptsFinalScreenProps {
  strategy?: any
}

export function ScriptsFinalScreen(props: ScriptsFinalScreenProps) {
  const { state, dispatch, facade } = useContext(TemplateExplorerContext)

  return (
    <section className="d-flex flex-column gap-3 bg-light" style={{ height: '80%' }}>

      <button className="btn btn-primary btn-sm mx-3" data-id="validateWorkspaceButton" disabled={state.creating} onClick={async () => {
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
      }}>{state.creating ? <><i className="fas fa-spinner fa-spin me-2"></i>Creating...</> : 'Finish'}</button>
    </section>
  )
}
