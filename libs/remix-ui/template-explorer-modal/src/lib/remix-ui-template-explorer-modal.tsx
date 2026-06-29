import React, { useContext, useState, useEffect, useRef } from 'react'
import './remix-ui-template-explorer-modal.css'
import { AppState } from '@remix-ui/app'
import { TemplateExplorerContext } from '../../context/template-explorer-context'
import { ContractWizard } from '../components/contract-wizard'
import { WorkspaceDetails } from '../components/workspaceDetails'
import { TemplateExplorerBody } from '../components/template-explorer-body'
import { GenericWorkspaceTemplate } from '../components/genericWorkspaceTemplate'
import { GenerateWorkspaceWithAi } from '../components/generateWorkspaceWithAi'
import { FinalScreen } from '../components/finalScreen'
import { MatomoEvent, TemplateExplorerModalEvent,WorkspaceEvent } from '@remix-api'
import TrackingContext from '@remix-ide/tracking'
import { ImportFromIpfs } from '../components/importFromIpfs'
import { TemplateExplorerWizardAction } from '../../types/template-explorer-types'
import { GitCloneScreen } from '../components/gitCloneScreen'

export interface RemixUiTemplateExplorerModalProps {
  dispatch: any
  appState: AppState
}

export function RemixUiTemplateExplorerModal (props: RemixUiTemplateExplorerModalProps) {

  const { setSearchTerm, state, dispatch, facade, theme, plugin } = useContext(TemplateExplorerContext)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = TemplateExplorerModalEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }
  const containerRef = useRef<HTMLDivElement>(null)
  const [modalHeight, setModalHeight] = useState<string>('')

  useEffect(() => {
    // Calculate dynamic height based on content
    if (containerRef.current) {
      const scrollHeight = containerRef.current.scrollHeight
      const viewportHeight = window.innerHeight
      const maxHeight = Math.min(scrollHeight + 20, viewportHeight * 0.9) // 90vh max with 20px buffer

      // Only set fixed height for non-template steps
      if (state.wizardStep === 'reset' || state.wizardStep === 'template') {
        setModalHeight(`${maxHeight}px`)
      } else {
        setModalHeight('720px')
      }
    }
  }, [state.wizardStep, state.manageCategory])

  return (
    <section data-id="template-explorer-modal-react" data-path={`templateExplorerModal-${state.manageCategory}`}>
      <section className="template-explorer-modal-background" style={{ zIndex: 8888 }}>
        <div ref={containerRef} className="template-explorer-modal-container border bg-dark p-2" style={{ height: modalHeight }}>
          <div className="template-explorer-modal-close-container bg-dark mb-3 w-100 d-flex flex-row justify-content-between align-items-center">
            {state.wizardStep === 'template' || state.wizardStep === 'reset' ? <div className="d-flex flex-row gap-2 w-100 mx-3 my-2">
              <input
                type="text"
                name="template-explorer-search"
                data-id="template-explorer-search-input"
                placeholder="Search"
                className="form-control template-explorer-modal-search-input ps-5 fw-light"
                style={{ color: theme?.name === 'Light' ? '#1B1D24' : '#FFF' }}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  trackMatomoEvent({ category: 'templateExplorerModal', action: 'search', value: e.target.value })
                }}
              />
            </div> : <div>
              <div className="d-flex flex-row gap-2 w-100 mx-1 my-2">
                <button className="btn" onClick={() => {
                  if (state.wizardStep === 'importFiles' || state.manageCategory === 'Files') {
                    dispatch({ type: TemplateExplorerWizardAction.SET_WIZARD_STEP, payload: 'template' })
                    dispatch({ type: TemplateExplorerWizardAction.SET_MANAGE_CATEGORY, payload: 'Files' })
                  } else {
                    facade.resetExplorerWizard(dispatch as any)
                  }
                }}>
                  <i className="fa-solid fa-chevron-left me-2"></i>
                  {state.manageCategory === 'Template' ? 'Back to Workspace Templates' : 'Back to File Templates'}
                </button>
              </div>
            </div>}
            <button data-id="template-explorer-modal-close-button" className="template-explorer-modal-close-button" onClick={async () => {
              facade.closeWizard();
              await plugin.call('templateexplorermodal', 'resetFileMode')
              await plugin.call('templateexplorermodal', 'resetIpfsMode')
              trackMatomoEvent({ category: 'templateExplorerModal', action: 'closeModal', isClick: true })
            }}>
              <i className="fa-solid fa-xmark text-dark"></i>
            </button>
          </div>
          {state.wizardStep === 'template' || state.wizardStep === 'reset' ? <TemplateExplorerBody /> : null}
          {state.wizardStep === 'generic' ? <GenericWorkspaceTemplate /> : null}
          {state.wizardStep === 'genAI' ? <GenerateWorkspaceWithAi /> : null}
          {state.wizardStep === 'wizard' ? <ContractWizard /> : null}
          {state.wizardStep === 'remixdefault' ? <WorkspaceDetails strategy={state} /> : null}
          {state.wizardStep === 'importFiles' ? <ImportFromIpfs /> : null}
          {state.wizardStep === 'importHttps' ? <ImportFromIpfs /> : null}
          {state.wizardStep === 'gitClone' ? <GitCloneScreen /> : null}
        </div>
      </section>
    </section>
  )
}
