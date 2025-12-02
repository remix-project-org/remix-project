/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { useContext, useState, useRef, useEffect } from 'react'
import { TemplateExplorerContext } from '../../context/template-explorer-context'
import { ContractWizardAction, TemplateExplorerWizardAction } from '../../types/template-explorer-types'
import { createWorkspace, switchToWorkspace, uploadFile, uploadFolder, uploadFolderExcludingRootFolder } from 'libs/remix-ui/workspace/src/lib/actions/workspace'
import { getErc20ContractCode } from '../utils/contractWizardUtils'
import { MatomoCategories, TemplateExplorerModalEvent, MatomoEvent } from '@remix-api'
import { useOnClickOutside } from 'libs/remix-ui/remix-ai-assistant/src/components/onClickOutsideHook'
import { createNewFile } from 'libs/remix-ui/workspace/src/lib/actions'

export function TopCards() {
  const { dispatch, facade, templateCategoryStrategy, plugin, theme, generateUniqueWorkspaceName, state, trackMatomoEvent } = useContext(TemplateExplorerContext)
  const enableDirUpload = { directory: '', webkitdirectory: '' }
  const [importFiles, setImportFiles] = useState(false)
  const [importOptionsPosition, setImportOptionsPosition] = useState({ top: 0, left: 0 })
  const importCardRef = useRef<HTMLDivElement>(null)
  const importOptionRef = useRef(null)
  const importFileInputRef = useRef(null)
  useOnClickOutside([importCardRef, importOptionRef], () => setImportFiles(false))

  useEffect(() => {
    if (importFiles && importCardRef.current) {
      const card = importCardRef.current
      const container = card.offsetParent as HTMLElement

      if (container) {
        const cardRect = card.getBoundingClientRect()
        const containerRect = container.getBoundingClientRect()

        setImportOptionsPosition({
          top: cardRect.bottom - containerRect.top - 8, // 8px gap below the card
          left: cardRect.left - containerRect.left
        })
      } else {
        // Fallback: use offsetTop/offsetLeft if offsetParent is not available
        setImportOptionsPosition({
          top: card.offsetTop + card.offsetHeight - 8, // 8px gap below the card
          left: card.offsetLeft
        })
      }
    }
  }, [importFiles])

  const ImportOptions = () => {

    return (
      <ul
        className="list-unstyled p-3 gap-2 d-flex flex-column align-items-start justify-content-end bg-light position-absolute"
        ref={importOptionRef}
        style={{
          borderRadius: '10px',
          zIndex: 1000,
          top: `${importOptionsPosition.top}px`,
          left: `${importOptionsPosition.left}px`,
          width: '298px'
        }}
        data-id="importOptionsMenu"
      >
        <li
          className="d-flex flex-row align-items-center import-option-item "
          onClick={() => {
            if (state.manageCategory === 'Template') {
              dispatch({ type: TemplateExplorerWizardAction.SET_MANAGE_CATEGORY, payload: 'Files' })
            }
            dispatch({ type: TemplateExplorerWizardAction.IMPORT_FILES, payload: 'importFiles' })
            dispatch({ type: TemplateExplorerWizardAction.SET_WIZARD_STEP, payload: 'importFiles' })
            trackMatomoEvent({ category: MatomoCategories.TEMPLATE_EXPLORER_MODAL, action: 'importFiles', isClick: true })
          }}
          data-id="importOptionsMenuIPFS"
        >
          <i className="me-2 far fa-cube"></i><span className="fw-light">Import from IPFS</span></li>
        <li
          className="d-flex flex-row align-items-center import-option-item"
          onClick={() => {
            importFileInputRef.current?.click()
          }}
          data-id="importOptionsMenuLocalFileSystem"
        >
          <i className="me-2 far fa-upload"></i>
          <input
            ref={importFileInputRef}
            type="file"
            id="importFilesInput"
            className="d-none"
            onChange={async (e) => {
              e.stopPropagation()
              if (e.target.files.length === 0 || !e.target.files) return
              await uploadFile(e.target, '/')
              setImportFiles(false)
              trackMatomoEvent({ category: MatomoCategories.TEMPLATE_EXPLORER_MODAL, action: 'importFiles', isClick: true })
              facade.closeWizard()
              await plugin.call('notification', 'toast', 'Files imported successfully')
            }}
          />
          <span className="fw-light">Import from local file system</span>
        </li>
        <li
          className="d-flex flex-row align-items-center import-option-item"
          onClick={() => {
            if (state.manageCategory === 'Template') {
              dispatch({ type: TemplateExplorerWizardAction.SET_MANAGE_CATEGORY, payload: 'Files' })
            }
            dispatch({ type: TemplateExplorerWizardAction.IMPORT_HTTPS, payload: 'importHttps' })
            dispatch({ type: TemplateExplorerWizardAction.SET_WIZARD_STEP, payload: 'importHttps' })
            trackMatomoEvent({ category: MatomoCategories.TEMPLATE_EXPLORER_MODAL, action: 'importHttps', isClick: true })
          }}
          data-id="importOptionsMenuHTTPS"
        >
          <i className="me-2 far fa-upload"></i><span className="fw-light">Import from https</span></li>
      </ul>
    )
  }

  return (
    <div className="title">
      <div className="row g-3 mb-1" style={{ position: 'relative' }}>
        <div className="col-6">
          <div
            data-id="create-blank-workspace-topcard"
            className={`explora-topcard d-flex flex-row align-items-center bg-light p-3 p-md-4 shadow-sm border-0 h-100 ${theme?.name === 'Dark' ? 'text-white-dimmed' : 'text-dark'}`}
            onClick={async () => {
              if (state.manageCategory === 'Template') {
                dispatch({ type: TemplateExplorerWizardAction.SET_WORKSPACE_TEMPLATE, payload: { value: 'blank', displayName: 'Blank', tagList: ["Blank", "Solidity"], description: 'A blank project' } })
                dispatch({ type: TemplateExplorerWizardAction.SET_WORKSPACE_TEMPLATE_GROUP, payload: 'Generic' })
                dispatch({ type: TemplateExplorerWizardAction.SET_WORKSPACE_NAME, payload: 'Blank' })
                dispatch({ type: TemplateExplorerWizardAction.SET_WIZARD_STEP, payload: 'generic' })
                trackMatomoEvent({ category: MatomoCategories.TEMPLATE_EXPLORER_MODAL, action: 'topCardCreateBlankWorkspace', isClick: true })
              } else {
                await createNewFile('blank', '/')
                facade.closeWizard()
                trackMatomoEvent({ category: MatomoCategories.TEMPLATE_EXPLORER_MODAL, action: 'topCardCreateBlankFile', isClick: true })
                plugin.call('notification', 'toast', 'File created successfully')
              }
            }}
            style={{
              borderRadius: '10px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <span className="d-flex flex-shrink-0">
              <i className={`fa-2x fas fa-plus`}></i>
            </span>
            <span className="d-flex flex-column flex-grow-1 ms-2 ms-md-3">
              <p className="mb-0 fw-semibold">Create blank</p>
              <p className="mb-0 fw-light text-wrap">{state.manageCategory === 'Template' ? 'Create an empty workspace' : 'Create a blank file'}</p>
            </span>
          </div>
        </div>
        <div className="col-6">
          <div
            data-id="create-with-ai-topcard"
            className={`explora-topcard d-flex flex-row align-items-center bg-light p-3 p-md-4 shadow-sm border-0 h-100 ${theme?.name === 'Dark' ? 'text-white-dimmed' : 'text-dark'}`}
            onClick={async () => {
              let aiPluginProfile = await plugin.call('remixaiassistant', 'getProfile')
              if (state.manageCategory === 'Template') {
                dispatch({ type: TemplateExplorerWizardAction.SET_WIZARD_STEP, payload: 'genAI' })
                const hiddenPlugin = await plugin.call('rightSidePanel', 'getHiddenPlugin')
                if (hiddenPlugin && hiddenPlugin.name === aiPluginProfile.name) {
                  await plugin.call('rightSidePanel', 'togglePanel')
                } else {
                  await plugin.call('menuicons', 'select', 'remixaiassistant')
                  await new Promise((resolve) => setTimeout(resolve, 500))
                }
                trackMatomoEvent({ category: MatomoCategories.TEMPLATE_EXPLORER_MODAL, action: 'topCardCreateWithAi', isClick: true })
              } else {
                const hiddenPlugin = await plugin.call('rightSidePanel', 'getHiddenPlugin')
                if (hiddenPlugin && hiddenPlugin.name === aiPluginProfile.name) {
                  await plugin.call('rightSidePanel', 'togglePanel')
                  await plugin.call('remixaiassistant', 'handleExternalMessage', 'What file do you want me to create?')
                } else {
                  await plugin.call('menuicons', 'select', 'remixaiassistant')
                  await plugin.call('remixaiassistant', 'handleExternalMessage', 'What file do you want me to create?')
                  await new Promise((resolve) => setTimeout(resolve, 500))
                }
                facade.closeWizard()
                trackMatomoEvent({ category: MatomoCategories.TEMPLATE_EXPLORER_MODAL, action: 'topCardCreateFileWithAi', isClick: true })
              }
              aiPluginProfile = null
            }}
            style={{
              borderRadius: '10px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <span className="d-flex flex-shrink-0">
              <img src={'assets/img/remixai-logoDefault.webp'} className="img-fluid" style={{ width: '20px', height: '20px' }} />
            </span>
            <span className="d-flex flex-column flex-grow-1 ms-2 ms-md-3">
              <p className="mb-0 fw-semibold">Create with AI</p>
              <p className="mb-0 fw-light text-wrap">{state.manageCategory === 'Template' ? 'Generate a workspace with AI' : 'Generate files with AI'}</p>
            </span>
          </div>
        </div>
        <div className="col-6">
          <div
            data-id="contract-wizard-topcard"
            className={`explora-topcard d-flex flex-row align-items-center bg-light p-3 p-md-4 shadow-sm border-0 h-100 ${theme?.name === 'Dark' ? 'text-white-dimmed' : 'text-dark'}`}
            onClick={() => {
              if (state.manageCategory === 'Template') {
                dispatch({ type: ContractWizardAction.CONTRACT_CODE_UPDATE, payload: getErc20ContractCode('erc20', state) })
                facade.switchWizardScreen(dispatch, { value: 'ozerc20', displayName: 'ERC20', tagList: ["ERC20", "Solidity"], description: 'A customizable fungible token contract' }, { name: 'OpenZeppelin', items: []}, templateCategoryStrategy)
                trackMatomoEvent({ category: MatomoCategories.TEMPLATE_EXPLORER_MODAL, action: 'topCardContractWizard', isClick: true })
              } else {
                dispatch({ type: ContractWizardAction.CONTRACT_CODE_UPDATE, payload: getErc20ContractCode('erc20', state) })
                facade.switchWizardScreen(dispatch, { value: 'ozerc20', displayName: 'ERC20', tagList: ["ERC20", "Solidity"], description: 'A customizable fungible token contract' }, { name: 'OpenZeppelin', items: []}, templateCategoryStrategy)
                trackMatomoEvent({ category: MatomoCategories.TEMPLATE_EXPLORER_MODAL, action: 'topCardContractWizardCreateFile', isClick: true })
              }
            }}
            style={{
              borderRadius: '10px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <span className="d-flex flex-shrink-0">
              <img src={'assets/img/openzeppelin-logo.png'} className="img-fluid" style={{ width: '20px', height: '20px' }} />
            </span>
            <span className="d-flex flex-column flex-grow-1 ms-2 ms-md-3">
              <p className="mb-0 fw-semibold">Contract Wizard</p>
              <p className="mb-0 fw-light text-wrap">{state.manageCategory === 'Template' ? 'Create a new workspace with the OpenZeppelin Wizard' : 'Create a contract file with the OpenZeppelin Wizard'}</p>
            </span>
          </div>
        </div>
        <div className="col-6">
          <div
            ref={importCardRef}
            data-id="import-project-topcard"
            className={`explora-topcard d-flex flex-row align-items-center p-3  shadow-sm import-files border border-light h-100 ${theme?.name === 'Dark' ? 'text-white-dimmed' : 'text-dark'}`}
            style={{
              backgroundColor: 'transparent',
              transition: 'background 0.3s, transform 0.2s, box-shadow 0.2s',
              borderRadius: '10px'
            }}
            onClick={() => {
              if (state.manageCategory === 'Template') {
                document.getElementById('importProjectInput')?.click()
              } else {
                setImportFiles(!importFiles)
              }
            }}

            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            {state.manageCategory === 'Template' ? (
              <input
                type="file"
                id="importProjectInput"
                multiple
                className="d-none"
                onChange={async (e) => {
                  e.stopPropagation()
                  if (e.target.files.length === 0 || !e.target.files) return
                  let relativePath = e.target.files[0].webkitRelativePath
                  let targetFolder = relativePath.split('/')[0]
                  const result = await generateUniqueWorkspaceName(targetFolder)
                  await createWorkspace(result, 'emtpy ' as any, {}, false, undefined, false, false, null, null)
                  await switchToWorkspace(result)
                  const remixconfigExists = await plugin.call('fileManager', 'exists', '/remix.config.json')
                  const prettierrcExists = await plugin.call('fileManager', 'exists', '.prettierrc.json')
                  if (remixconfigExists && prettierrcExists) {
                    await plugin.call('fileManager', 'remove', 'remix.config.json')
                    await plugin.call('fileManager', 'remove', '.prettierrc.json')
                  }
                  await uploadFolderExcludingRootFolder(e.target, '/')
                  facade.closeWizard()
                  relativePath = null
                  targetFolder = null
                  trackMatomoEvent({ category: MatomoCategories.TEMPLATE_EXPLORER_MODAL, action: 'topCardImportProject', isClick: true })
                }}
                {...enableDirUpload}
              />) : null
            }

            <span className="d-flex flex-shrink-0">
              <i className="fa-2x fas fa-upload"></i>
            </span>

            <span className="d-flex flex-column flex-grow-1 ms-2 ms-md-3">
              <p className="mb-0 fw-semibold">{state.manageCategory === 'Template' ? 'Import Project' : 'Import Files'}</p>
              <p className="mb-0 fw-light text-wrap">{state.manageCategory === 'Template' ? 'Import an existing project' : 'Import existing files'}</p>
            </span>
          </div>
        </div>
        {importFiles && <ImportOptions />}
      </div>
    </div>
  )
}
