/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { useContext, useEffect, useReducer, useState } from 'react'
import { initialState, templateExplorerReducer } from '../../reducers/template-explorer-reducer'
import { ContractWizardAction, TemplateExplorerWizardAction } from '../../types/template-explorer-types'
import { TemplateExplorerContext } from '../../context/template-explorer-context'
import { RemixMdRenderer } from 'libs/remix-ui/helper/src/lib/components/remix-md-renderer'
import heightConfig from '../config/height-config.json'
import { MatomoCategories, MatomoEvent, TemplateExplorerModalEvent, trackMatomoEvent } from '@remix-api'
import TrackingContext from '@remix-ide/tracking'

export function GenericWorkspaceTemplate() {

  const { state, theme, dispatch, facade, generateUniqueWorkspaceName } = useContext(TemplateExplorerContext)
  const [readMe, setReadMe] = useState(null)
  const [uniqueWorkspaceName, setUniqueWorkspaceName] = useState(facade.getUniqueWorkspaceName())
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = TemplateExplorerModalEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }

  useEffect(() => {
    const run = async () => {
      const readMe = await facade.getTemplateReadMeFile(state.workspaceTemplateChosen.value)
      setReadMe(readMe)
    }
    run()
  }, [state.workspaceTemplateChosen.value])

  useEffect(() => {
    const run = async () => {
      const result = await generateUniqueWorkspaceName(state.workspaceName)
      setUniqueWorkspaceName(result)
      dispatch({ type: TemplateExplorerWizardAction.SET_WORKSPACE_NAME, payload: uniqueWorkspaceName })
    }
    run()
  }, [state.workspaceTemplateChosen.value, state.wizardStep])

  const calculateHeight = () => {
    const displayName = state.workspaceTemplateChosen.displayName?.toLowerCase() || ''
    const templateGroup = state.workspaceTemplateGroupChosen?.toLowerCase() || ''
    const workspaceName = state.workspaceName?.trim().toLowerCase() || ''
    const templateType = state.workspaceTemplateChosen.templateType?.type || ''

    for (const rule of heightConfig.rules) {
      if (rule.type === 'default') {
        continue
      }

      if (rule.type === 'exactMatch' && rule.field === 'displayName' && displayName === rule.value) {
        return rule.percentage
      }
      if (rule.type === 'exactMatch' && rule.field === 'workspaceName' && workspaceName === rule.value) {
        return rule.percentage
      }

      if (rule.type === 'includes' && rule.field === 'displayName' && displayName.includes(rule.value)) {
        return rule.percentage
      }
      if (rule.type === 'includes' && rule.field === 'templateGroup' && templateGroup.includes(rule.value)) {
        return rule.percentage
      }

      if (rule.type === 'templateType' && templateType === rule.value) {
        return rule.percentage
      }
    }

    //default
    const defaultRule = heightConfig.rules.find(rule => rule.type === 'default')
    return defaultRule?.percentage || '50%'
  }

  return (
    <section data-id={`generic-template-section-${state.workspaceTemplateChosen.value}`} className="mx-3 p-2">
      <div className="d-flex flex-column p-3 bg-light" style={{ height: state.workspaceName === 'MultiSig Wallet' ? '90%' : calculateHeight() }}>
        <div>
          <label className="form-label text-uppercase small mb-1">Workspace name</label>
        </div>
        <div>
          <input name="workspaceName" data-id={`workspace-name-${state.workspaceTemplateChosen.value}-input`} type="text" className={`form-control ${theme.name === 'Light' ? 'text-dark' : 'text-white'}`} value={uniqueWorkspaceName} onChange={(e) => {
            setUniqueWorkspaceName(e.target.value)
            dispatch({ type: TemplateExplorerWizardAction.SET_WORKSPACE_NAME, payload: uniqueWorkspaceName })
          }} />
        </div>

        <div className="d-flex justify-content-between align-items-center gap-3 mt-3 mb-5">
          <div className="form-check m-0">
            <>
              <input data-id={`initializeAsGitRepo-${state.workspaceTemplateChosen.value}`} className="form-check-input" type="checkbox" id="initGit" checked={state.initializeAsGitRepo}
                onChange={(e) => {
                  dispatch({ type: ContractWizardAction.INITIALIZE_AS_GIT_REPO_UPDATE, payload: e.target.checked })
                }} />
              <label className="form-check-label" htmlFor="initGit">Initialize as a Git repository</label>
            </>
          </div>

          <button className="btn btn-primary btn-sm mx-3" data-id={`validate-${state.workspaceTemplateChosen.value}workspace-button`} onClick={async () => {
            await facade.createWorkspace({
              workspaceName: uniqueWorkspaceName,
              workspaceTemplateName: state.workspaceTemplateChosen.value,
              opts: state.contractOptions,
              isEmpty: false,
              isGitRepo: state.initializeAsGitRepo,
              createCommit: true,
              contractContent: state.contractCode,
              contractName: state.tokenName
            })
            trackMatomoEvent({ category: MatomoCategories.TEMPLATE_EXPLORER_MODAL, action: 'createWorkspaceWithGenericTemplate', name: state.workspaceTemplateChosen.value, isClick: true })
            facade.closeWizard()
          }}>Finish</button>
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: '70%' }}>
          {readMe?.readMe && (
            readMe.type === 'md' ? (
              <RemixMdRenderer markDownContent={readMe.readMe} theme={theme.name} />
            ) : (
              <p className="text-dark">{readMe.readMe}</p>
            )
          )}
        </div>
      </div>
    </section>
  )
}
