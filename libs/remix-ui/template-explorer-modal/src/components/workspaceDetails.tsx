import React, { useContext, useEffect, useState } from 'react'
import { MiniFileExplorer } from './miniFileExplorer'
import { Editor } from '@monaco-editor/react'
import { ContractWizardAction, TemplateExplorerWizardAction } from '../../types/template-explorer-types'
import { storageContractCode, ownerContractCode, ballotContractCode } from '../contractCode/remixDefault'
import { TemplateExplorerContext } from '../../context/template-explorer-context'
import { vscodeDark, vscodeLight } from '@uiw/codemirror-theme-vscode'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { MatomoCategories, trackMatomoEvent } from '@remix-api'

interface WorkspaceDetailsProps {
  strategy?: any
}

const darkTheme = EditorView.theme({
  "&": {
    backgroundColor: "#2a2c3f",
    color: "#e0e0e0"
  },
  ".cm-content": {
    caretColor: "#ffffff"
  },
  ".cm-gutters": {
    backgroundColor: "#2a2c3f",
    color: "#6c7293"
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "#ffffff"
  },
  "&.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "#3a3d58"
  }
}, { dark: true })

export function WorkspaceDetails(props: WorkspaceDetailsProps) {
  const { state, dispatch, facade, theme, generateUniqueWorkspaceName, trackMatomoEvent } = useContext(TemplateExplorerContext)
  const [showEditWorkspaceName, setShowEditWorkspaceName] = useState(false)
  const [uniqueWorkspaceName, setUniqueWorkspaceName] = useState(state.workspaceName)
  useEffect(() => {
    const run = async () => {
      const result = await generateUniqueWorkspaceName(state.workspaceName)
      setUniqueWorkspaceName(result)
    }
    run()
  }, [state.contractType, state.contractTag])

  return (
    <section data-id="workspace-details-section" className="flex flex-col gap-3 bg-light workspace-details-section h-full">
      <div className="p-3 flex flex-row items-center">
        { showEditWorkspaceName ? <input data-id="workspace-name-input" type="text" className="form-control form-control-sm" value={uniqueWorkspaceName} onChange={(e) => {
          setUniqueWorkspaceName(e.target.value)
          dispatch({ type: TemplateExplorerWizardAction.SET_WORKSPACE_NAME, payload: uniqueWorkspaceName })
        }} /> : <span data-id="default-workspace-name-span" className={`uppercase small fw-semibold fs-6 ${theme?.name === 'Light' ? 'text-dark' : 'text-white'}`}>
          {uniqueWorkspaceName}
        </span> }
        <i data-id="default-workspace-name-edit-icon" className={`${showEditWorkspaceName ? 'fas fa-lock ml-2' : "ml-2 fas fa-edit"}`} onClick={() => setShowEditWorkspaceName(!showEditWorkspaceName)}></i>
      </div>
      <div className="flex flex-col flex-md-row h-full pt-1 pl-3 pr-3 pb-3 workspace-details-content-wrapper">
        <div className="workspace-details-file-explorer">
          <MiniFileExplorer />
        </div>
        <div className="border workspace-details-editor-container mx-auto px-4">
          <CodeMirror
            data-id="workspace-details-editor"
            value={storageContractCode('Storage')}
            lang="typescript"
            height="460px"
            theme={theme?.name === 'Light' ? vscodeLight : darkTheme}
            readOnly={true}
            basicSetup={{
              lineNumbers: false,
              syntaxHighlighting: true,
              foldGutter: false,
              highlightActiveLine: true,
              highlightActiveLineGutter: false,
              indentOnInput: false,
              tabSize: 2
            }}
            extensions={[javascript({ typescript: true }),vscodeDark, darkTheme]}
          />
        </div>
      </div>
      <div className="flex justify-between items-center gap-3 mb-2 p-2">
        <div className="form-check m-0">
          <>
            <input data-id="initGitRepositoryLabel" className="form-check-input" type="checkbox" id="initGit" checked={state.initializeAsGitRepo}
              onChange={(e) => dispatch({ type: ContractWizardAction.INITIALIZE_AS_GIT_REPO_UPDATE, payload: e.target.checked })} />
            <label className="form-check-label" htmlFor="initGit">Initialize as a Git repository</label>
          </>
        </div>

        <button className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors btn-sm" data-id="validateWorkspaceButton" disabled={state.creating} onClick={async () => {
          await facade.createWorkspace({
            workspaceName: uniqueWorkspaceName,
            workspaceTemplateName: state.workspaceTemplateChosen.value,
            opts: { },
            isEmpty: false,
            isGitRepo: state.initializeAsGitRepo,
            createCommit: true
          })
          trackMatomoEvent({ category: MatomoCategories.TEMPLATE_EXPLORER_MODAL, action: 'createWorkspaceWithBasicTemplate', isClick: true })
          facade.closeWizard()
          dispatch({ type: TemplateExplorerWizardAction.RESET_STATE })
        }}>
          {state.creating ? <><i className="fas fa-spinner fa-spin mr-2"></i>Creating...</> : <><i className="far fa-plus mr-2"></i> Create a new workspace</>}
        </button>
      </div>
    </section>
  )
}
