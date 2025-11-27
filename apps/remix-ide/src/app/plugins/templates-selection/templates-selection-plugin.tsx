
import React, { useEffect, useRef } from 'react'
import { FormattedMessage } from 'react-intl'
import { CustomTooltip } from "@remix-ui/helper"
import { trackMatomoEvent } from '@remix-api'
import { AlertModal, AppModal } from '@remix-ui/app'
import { ViewPlugin } from '@remixproject/engine-web'
import { PluginViewWrapper } from '@remix-ui/helper'
import { RemixUIGridView } from '@remix-ui/remix-ui-grid-view'
import { RemixUIGridSection } from '@remix-ui/remix-ui-grid-section'
import { RemixUIGridCell } from '@remix-ui/remix-ui-grid-cell'
import isElectron from 'is-electron'
import type { Template, TemplateGroup } from '@remix-ui/workspace'
import './templates-selection-plugin.css'
import { templates } from './templates'
import { TEMPLATE_METADATA } from '@remix-ui/workspace'

const profile = {
  name: 'templateSelection',
  displayName: 'Template Selection',
  description: 'templateSelection',
  location: 'mainPanel',
  methods: ['aiWorkspaceGenerate'],
  events: ['onTemplateSelectionResult'],
  maintainedBy: 'Remix',
}

export class TemplatesSelectionPlugin extends ViewPlugin {
  templates: Array<TemplateGroup>
  dispatch: React.Dispatch<any> = () => { }
  opts: any = {}
  aiState: any = { prompt: '' }

  constructor() {
    super(profile)
  }

  async onActivation() {
    this.handleThemeChange()
    await this.call('tabs', 'focus', 'templateSelection')
    this.renderComponent()
    trackMatomoEvent(this, { category: 'plugin', action: 'activated', name: 'remixGuide', isClick: true })
  }

  onDeactivation(): void {
  }

  private handleThemeChange() {
    this.on('theme', 'themeChanged', (theme: any) => {
      this.renderComponent()
    })
  }

  setDispatch(dispatch: React.Dispatch<any>): void {
    this.dispatch = dispatch
    this.renderComponent()
  }

  render() {
    return (
      <div className="bg-dark" id="remixGuide">
        <PluginViewWrapper plugin={this} />
      </div>
    )
  }

  renderComponent() {
    this.dispatch({
      ...this,
    })
  }

  async aiWorkspaceGenerate () {
    const generateAIWorkspace = async () => {
      const okAction = async () => {
        this.call('remixaiassistant', 'chatPipe', '/generate ' + this.aiState.prompt)
      }
      const aiTemplateModal: AppModal = {
        id: 'TemplatesSelection',
        title:  window._intl.formatMessage({ id: !isElectron() ? 'filePanel.workspace.create': 'filePanel.workspace.create.desktop' }),
        message: aiModalTemplate((value) => this.aiState.prompt = value),
        okLabel: window._intl.formatMessage({ id: !isElectron() ? 'filePanel.ok':'filePanel.selectFolder' }),
        okFn: okAction
      }
      const modalResult = await this.call('notification', 'modal', aiTemplateModal)
      const alertModal: AlertModal = {
        id: 'TemplatesSelectionAiAlert',
        message: <div className='d-flex flex-row align-items-center'>
          <span><img src="../../../assets/img/remixai-logoDefault.webp" style={{ width: '50px', height: '50px' }} alt="Ai alert" /></span>
          <p className='ms-2' style={{ fontSize: '1.1rem' }}>Your request is being processed. Please wait while I generate the workspace for you. It won't be long.</p>
        </div>,
        title: 'Generating Workspace'
      }
      this.on('remixAI', 'generateWorkspace', async () => {
        await this.call('notification', 'alert', alertModal)
      })
      if (modalResult === undefined) {
      }
    }

    const aiModalTemplate = (onChangeTemplateName: (value) => void) => {
      return (
        <>
          <div>
            <label id="wsName" className="form-check-label mb-2" style={{ fontWeight: 'bolder' }}>
              Generate Workspace
            </label>
            <input
              type="text"
              data-id="modalDialogCustomPromptTextCreate"
              placeholder="Enter a description of the workspace you want to create"
              className="form-control mb-3"
              onChange={(e) => onChangeTemplateName(e.target.value)}
              onInput={(e) => onChangeTemplateName((e.target as any).value)}
            />
          </div>
        </>
      )
    }
    generateAIWorkspace()
  }

  updateComponent() {

    const errorCallback = async (error, data) => {
      if (error) {
        const modal: AppModal = {
          id: 'TemplatesSelection',
          title: window._intl.formatMessage({ id: !isElectron() ? 'filePanel.workspace.create' : 'filePanel.workspace.create.desktop' }),
          message: error.message,
          okLabel: window._intl.formatMessage({ id: 'filePanel.ok' }),
          cancelLabel: window._intl.formatMessage({ id: 'filePanel.cancel' })
        }
        await this.call('notification', 'modal', modal)
        console.error(error)
      }

    }

    const createWorkspace = async (item: Template, templateGroup: TemplateGroup) => {
      if (isElectron()) {
        await this.call('remix-templates', 'loadTemplateInNewWindow', item.value)
        return
      }
      const defaultName = await this.call('filePanel', 'getAvailableWorkspaceName', item.displayName)
      const username = await this.call('settings', 'get', 'settings/github-user-name')
      const email = await this.call('settings', 'get', 'settings/github-email')
      const gitNotSet = !username || !email
      let workspaceName = defaultName
      let initGit = false

      this.opts = {}
      const modal: AppModal = {
        id: 'TemplatesSelection',
        title: window._intl.formatMessage({ id: !isElectron() ? 'filePanel.workspace.create' : 'filePanel.workspace.create.desktop' }),
        message: await createModalMessage(
          item,
          templateGroup,
          defaultName,
          gitNotSet,
          (value) => workspaceName = value,
          (value) => initGit = !!value,
          (event) => setCheckBoxRefs(event),
          (event) => setRadioRefs(event),
        ),
        okLabel: window._intl.formatMessage({ id: !isElectron() ? 'filePanel.ok' : 'filePanel.selectFolder' }),
      }

      const modalResult = await this.call('notification', 'modal', modal)
      if (!modalResult) return
      trackMatomoEvent(this, { category: 'template-selection', action: 'createWorkspace', name: item.value, isClick: true })
      this.emit('createWorkspaceReducerEvent', workspaceName, item.value, this.opts, false, errorCallback, initGit)
    }

    const addToCurrentElectronFolder = async (item: any, templateName: string) => {
      await this.call('remix-templates', 'addToCurrentElectronFolder', item.value, templateName)
    }

    const addToCurrentWorkspace = async (item: Template, templateGroup: TemplateGroup) => {
      this.opts = {}
      trackMatomoEvent(this, { category: 'template-selection', action: 'addToCurrentWorkspace', name: item.value, isClick: true })
      if (templateGroup.hasOptions) {
        const modal: AppModal = {
          id: 'TemplatesSelection',
          title: window._intl.formatMessage({ id: 'filePanel.customizeTemplate' }),
          message: createOptionsModal(
            (event) => setCheckBoxRefs(event),
            (event) => setRadioRefs(event),),
          okLabel: window._intl.formatMessage({ id: 'filePanel.ok' }),
          cancelLabel: window._intl.formatMessage({ id: 'filePanel.cancel' })
        }
        const modalResult = await this.call('notification', 'modal', modal)
        if (!modalResult) return
      }

      this.emit('addTemplateToWorkspaceReducerEvent', item.value, this.opts, false, async (e, data) => {
        if (e) {
          const modal: AppModal = {
            id: 'TemplatesSelection',
            title: window._intl.formatMessage({ id: !isElectron() ? 'filePanel.workspace.create' : 'filePanel.workspace.create.desktop' }),
            message: e.message,
            okLabel: window._intl.formatMessage({ id: 'filePanel.ok' }),
            cancelLabel: window._intl.formatMessage({ id: 'filePanel.cancel' })
          }
          await this.call('notification', 'modal', modal)
          console.error(e)
        } else {
          this.call('notification', 'toast', 'Files Added.')
        }
      })
    }

    const setCheckBoxRefs = (event) => {
      const { value, checked } = event.target
      if (value === 'mintable') {
        this.opts.mintable = checked
      } else if (value === 'burnable') {
        this.opts.burnable = checked
      } else if (value === 'pausable') {
        this.opts.pausable = checked
      }
    }

    const setRadioRefs = (event) => {
      const { value } = event.target
      if (value === 'transparent') {
        this.opts.upgradeable = value
      } else if (value === 'uups') {
        this.opts.upgradeable = value
      }
    }

    return (
      <RemixUIGridView
        plugin={this}
        styleList={""}
        logo='assets/img/bgRemi.webp'
        enableFilter={true}
        showUntagged={true}
        showPin={false}
        tagList={[
          ['Solidity', 'danger'],
          ['ZKP', 'warning'],
          ['ERC20', 'success'],
          ['ERC721', 'secondary'],
          ['ERC1155', 'primary'],
        ]}
        title='Workspace Templates'
        description="Select a template to create a Workspace or to add it to current Workspace"
      >
        {
          templates(window._intl, this).map(template => {
            return <RemixUIGridSection
              plugin={this}
              key={template.name}
              title={template.name}
              tooltipTitle={template.tooltip}
              hScrollable={false}
            >
              {template.items.map((item, index) => {

                item.templateType = TEMPLATE_METADATA[item.value]

                if (item.templateType && item.templateType.desktopCompatible === false && isElectron()) {
                  return <React.Fragment key={item.name || index}></React.Fragment>
                }

                if (item.templateType && item.templateType.disabled === true) return null
                if (!item.opts) {
                  return (
                    <RemixUIGridCell
                      // plugin={this}
                      title={item.displayName}
                      key={item.name || index}
                      id={item.name}
                      searchKeywords={[item.displayName, item.description, template.name]}
                      tagList={item.tagList}
                      classList={'TSCellStyle'}
                    >
                      <div className='d-flex justify-content-between h-100 flex-column'>
                        <div className='d-flex flex-column'>
                          <div>
                            {item.description && <span className='text-dark'>{item.description}</span>}
                          </div>
                          <div className='d-flex flex-wrap mb-2'>
                            {(item.opts && item.opts.upgradeable && item.opts.upgradeable === 'uups') && <span className='badgeForCell badge text-secondary'>Upgradeable-UUPS</span>}
                            {(item.opts && item.opts.mintable) && <span className='badgeForCell text-secondary'>mintable</span>}
                            {(item.opts && item.opts.burnable) && <span className='badgeForCell text-secondary'>burnable</span>}
                            {(item.opts && item.opts.pausable) && <span className='badgeForCell text-secondary'>pausable</span>}
                          </div>
                        </div>
                        <div className='align-items-center justify-content-between w-100 d-flex pt- flex-row'>
                          {(!template.IsArtefact || !item.IsArtefact) && <CustomTooltip
                            placement="auto"
                            tooltipId={`overlay-tooltip-new${item.name}`}
                            tooltipText="Create a new workspace"
                          >
                            <span
                              data-id={`create-${item.value}${item.opts ? JSON.stringify(item.opts) : ''}`}
                              onClick={async () => {
                                if ((item.value as string).toLowerCase().includes('ai')) {
                                  this.aiWorkspaceGenerate()
                                } else {
                                  createWorkspace(item, template)
                                }
                              }}
                              className="btn btn-sm me-2 border border-primary"
                              data-template-name={item.name}
                            >
                              {isElectron() ?
                                <><i className='fa fa-folder-open me-1'></i>Create</> : 'Create'}
                            </span>
                          </CustomTooltip>}
                          {item.templateType && item.templateType.forceCreateNewWorkspace ? <></> : isElectron() ?

                            <div className=''>
                              <CustomTooltip
                                placement="auto"
                                tooltipId={`overlay-tooltip-add${item.name}`}
                                tooltipText="Add template files to current workspace"
                              >
                                <span
                                  data-id={`add-${item.value}`}
                                  onClick={async () => addToCurrentElectronFolder(item, template.name)}
                                  className="btn btn-sm border"
                                >
                                  <i className="fa fa-folder-plus me-1" aria-hidden="true"></i>
                                 Add here
                                </span>
                              </CustomTooltip>
                            </div>
                            :
                            <CustomTooltip
                              placement="auto"
                              tooltipId={`overlay-tooltip-add${item.name}`}
                              tooltipText="Add template files to current workspace"
                            >
                              <span
                                data-id={`add-${item.value}`}
                                onClick={async () => addToCurrentWorkspace(item, template)}
                                className="btn btn-sm border"
                              >
                                Add to current
                              </span>
                            </CustomTooltip>}
                        </div>
                      </div>
                    </RemixUIGridCell>
                  )
                }
              })}
              {template.name === 'Cookbook' && <RemixUIGridCell
                // plugin={this}
                title={"More from Cookbook"}
                key={"cookbookMore"}
                id={"cookBookMore"}
                searchKeywords={["cookbook"]}
                tagList={[]}
                classList='TSCellStyle'
              >
                <div className='d-flex justify-content-between h-100 flex-column'>
                  <span className='pt-2 px-1 h6 text-dark'>{template.description}</span>
                  <span style={{ cursor: 'pointer' }} className='mt-2 mb-1 btn btn-sm border align-items-left' onClick={() => template.onClick()}>{template.onClickLabel}</span>
                </div>
              </RemixUIGridCell>}
            </RemixUIGridSection>
          })}
      </RemixUIGridView>
    )
  }
}

const createModalMessage = async (
  template: Template,
  templateGroup: TemplateGroup,
  defaultName: string,
  gitConfigNotSet: boolean,
  onChangeTemplateName: (name: string) => void,
  onChangeInitGit: (name: string) => void,
  onChangeCheckBoxRefs: (event: any) => void,
  onChangeRadioRefs: (event: any) => void,
) => {
  return (
    <>
      <label id="wsName" className="form-check-label" style={{ fontWeight: 'bolder' }}>
        <FormattedMessage id="filePanel.workspaceName" />
      </label>
      <input
        type="text"
        data-id="modalDialogCustomPromptTextCreate"
        defaultValue={defaultName}
        className="form-control mb-3"
        onChange={(e) => onChangeTemplateName(e.target.value)}
        onInput={(e) => onChangeTemplateName((e.target as any).value)}
      />
      {templateGroup.hasOptions ? createOptionsModal(onChangeCheckBoxRefs, onChangeRadioRefs) : null}
      <div className="d-flex py-2 align-items-center form-check">
        <input
          id="initGitRepository"
          data-id="initGitRepository"
          className="form-check-input"
          type="checkbox"
          disabled={gitConfigNotSet}
          onChange={(e) => onChangeInitGit(e.target.value)}
          onInput={(e) => onChangeInitGit((e.target as any).value)}
        />
        <label
          htmlFor="initGitRepository"
          data-id="initGitRepositoryLabel"
          className="ms-1 form-check-label udapp_checkboxAlign"
          title={window._intl.formatMessage({ id: 'filePanel.initGitRepoTitle' })}
        >
          <FormattedMessage id="filePanel.initGitRepositoryLabel" />
        </label>
      </div>
      {gitConfigNotSet ? (
        <div className="text-warning">
          <FormattedMessage id="filePanel.initGitRepositoryWarning" />
        </div>
      ) : (
        <></>
      )}
    </>
  )
}

const createOptionsModal = (
  onChangeCheckBoxRefs: (event: any) => void,
  onChangeRadioRefs: (event: any) => void
) => (
  <div id="ozcustomization" data-id="ozCustomization" style={{ display: 'block' }} className="mb-2">
    <label className="form-check-label d-block mb-2" style={{ fontWeight: 'bolder' }}>
      <FormattedMessage id="filePanel.customizeTemplate" />
    </label>

    <label className="form-check-label d-block mb-1">
      <FormattedMessage id="filePanel.features" />
    </label>
    <div className="mb-2">
      {['mintable', 'burnable', 'pausable'].map((feature) => (
        <div key={feature} className="d-flex ms-2 form-check">
          <input className="form-check-input" type="checkbox" name="feature" value={feature} id={feature} onChange={onChangeCheckBoxRefs} />
          <label className="form-check-label ms-1" htmlFor={feature} data-id={`featureType${feature.charAt(0).toUpperCase() + feature.slice(1)}`}>
            <FormattedMessage id={`filePanel.${feature}`} />
          </label>
        </div>
      ))}
    </div>

    <label className="form-check-label d-block mb-1">
      <FormattedMessage id="filePanel.upgradeability" />
    </label>
    <div>
      {['transparent', 'uups'].map((type) => (
        <div key={type} className="d-flex ms-2 form-check">
          <input className="form-check-input" type="radio" name="upgradeability" value={type} id={type} onChange={onChangeRadioRefs} />
          <label className="form-check-label ms-1" htmlFor={type} data-id={`upgradeType${type.charAt(0).toUpperCase() + type.slice(1)}`}>
            {type.toUpperCase()}
          </label>
        </div>
      ))}
    </div>
  </div>
)

