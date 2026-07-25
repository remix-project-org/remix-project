/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React,{ ReactNode, useContext, useEffect, useRef, useState } from 'react'
import Editor, { Monaco } from '@monaco-editor/react'
import { AccessControlType, ContractTypeStrategy, ContractWizardAction, TemplateExplorerWizardAction } from '../../types/template-explorer-types'
import { getErc1155ContractCode, getErc20ContractCode, getErc721ContractCode } from '../utils/contractWizardUtils'
import { TemplateExplorerContext } from '../../context/template-explorer-context'
import CodeMirror from '@uiw/react-codemirror'
import { vscodeDark, vscodeLight } from '@uiw/codemirror-theme-vscode'
import { javascript } from '@codemirror/lang-javascript'
import { EditorView } from '@codemirror/view'
import { ContractTagSelector } from './contractTagSelector'
import { MatomoCategories, MatomoEvent, TemplateExplorerModalEvent,WorkspaceEvent } from '@remix-api'
import TrackingContext from '@remix-ide/tracking'

const defaultStrategy: ContractTypeStrategy = {
  contractType: 'erc20',
  contractOptions: {
    mintable: false,
    burnable: false,
    pausable: false,
    permit: true,
  },
  contractAccessControl: '',
  contractUpgradability: {
    uups: false,
    transparent: false
  },
  contractCode: getErc20ContractCode('erc20', {
    contractType: 'erc20',
    contractOptions: { mintable: false, burnable: false, pausable: false, permit: true },
    contractAccessControl: '',
    contractUpgradability: { uups: false, transparent: false },
    contractCode: '',
    contractImport: '',
    initializeAsGitRepo: false,
    tokenName: 'MyToken'
  }),
  contractImport: '',
  initializeAsGitRepo: false
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

export function ContractWizard () {
  const { state, dispatch, theme, facade, generateUniqueWorkspaceName, trackMatomoEvent } = useContext(TemplateExplorerContext)
  const [uniqueWorkspaceName, setUniqueWorkspaceName] = useState(state.workspaceName)
  const strategy = state

  function toggleContractOption(key: keyof typeof strategy.contractOptions) {
    if (key === 'mintable') {
      dispatch({ type: ContractWizardAction.CONTRACT_OPTIONS_UPDATE, payload: { ...strategy.contractOptions, [key]: !strategy.contractOptions[key] } })
      switchAccessControl(strategy.contractAccessControl || 'ownable')
    } else if (key === 'pausable') {
      dispatch({ type: ContractWizardAction.CONTRACT_OPTIONS_UPDATE, payload: { ...strategy.contractOptions, [key]: !strategy.contractOptions[key] } })
      switchAccessControl(strategy.contractAccessControl || 'ownable')
    }
    dispatch({ type: ContractWizardAction.CONTRACT_OPTIONS_UPDATE, payload: { ...strategy.contractOptions, [key]: !strategy.contractOptions[key] } })
    if (strategy.contractUpgradability.uups) {
      updateUpgradability(strategy.contractUpgradability)
    }
  }

  function switchAccessControl(accessControl: AccessControlType) {
    dispatch({ type: ContractWizardAction.CONTRACT_ACCESS_CONTROL_UPDATE, payload: accessControl })
  }
  function updateUpgradability(upgradability: { uups?: boolean; transparent?: boolean }) {
    dispatch({ type: ContractWizardAction.CONTRACT_UPGRADABILITY_UPDATE, payload: upgradability })
    switchAccessControl(strategy.contractAccessControl)
    if (strategy.contractOptions.permit === false && strategy.contractType === 'erc20') {
      dispatch({ type: ContractWizardAction.UPDATE_ERC20_PERMIT, payload: { ...strategy.contractOptions, permit: true } })
    }
  }
  function updateContractName(contractName: string) {
    dispatch({ type: ContractWizardAction.CONTRACT_NAME_UPDATE, payload: contractName })
    dispatch({ type: ContractWizardAction.TOKEN_NAME_UPDATE, payload: contractName })
  }

  useEffect(() => {
    if (strategy.contractType.toLowerCase() === 'erc20') {
      dispatch({ type: ContractWizardAction.CONTRACT_CODE_UPDATE, payload: getErc20ContractCode(strategy.contractType.toLowerCase() as 'erc20', strategy) })
    } else if (strategy.contractType.toLowerCase() === 'erc721') {
      dispatch({ type: ContractWizardAction.CONTRACT_CODE_UPDATE, payload: getErc721ContractCode(strategy.contractType.toLowerCase() as 'erc721', strategy) })
    } else if (strategy.contractType.toLowerCase() === 'erc1155') {
      dispatch({ type: ContractWizardAction.CONTRACT_CODE_UPDATE, payload: getErc1155ContractCode(strategy.contractType.toLowerCase() as 'erc1155', strategy) })
    }
  }, [strategy.contractType, strategy.contractOptions, strategy.contractAccessControl, strategy.contractUpgradability, strategy.contractName, strategy.contractTag])

  useEffect(() => {
    const run = async () => {
      const result = await generateUniqueWorkspaceName(state.workspaceName)
      setUniqueWorkspaceName(result)
    }
    run()
  }, [state.contractType, state.contractTag])

  const switching = (value: 'erc20' | 'erc721' | 'erc1155') => {
    dispatch({ type: ContractWizardAction.CONTRACT_TYPE_UPDATED, payload: value })
    dispatch({ type: ContractWizardAction.CONTRACT_TAG_UPDATE, payload: value.toUpperCase() })

    const templateMap = {
      erc20: { value: 'ozerc20', displayName: 'ERC20', tagList: ["ERC20", "Solidity"], description: 'A customizable fungible token contract' },
      erc721: { value: 'ozerc721', displayName: 'ERC721', tagList: ["ERC721", "Solidity"], description: 'A customizable non-fungible token (NFT) contract' },
      erc1155: { value: 'ozerc1155', displayName: 'ERC1155', tagList: ["ERC1155", "Solidity"], description: 'A customizable multi token contract' }
    }

    dispatch({ type: TemplateExplorerWizardAction.SET_WORKSPACE_NAME, payload: value.toUpperCase() })
    dispatch({ type: TemplateExplorerWizardAction.SET_WORKSPACE_TEMPLATE, payload: templateMap[value] })
    trackMatomoEvent({ category: MatomoCategories.TEMPLATE_EXPLORER_MODAL, action: 'contractTypeSelectedInContractWizard', name: value.toUpperCase(), isClick: true })
  }

  const validateAndCreateWorkspace = async () => {
    dispatch({ type: TemplateExplorerWizardAction.SET_WORKSPACE_NAME, payload: uniqueWorkspaceName })
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
    trackMatomoEvent({ category: MatomoCategories.TEMPLATE_EXPLORER_MODAL, action: 'createWorkspaceWithContractWizard', name: state.workspaceTemplateChosen.value, isClick: true })
    facade.closeWizard()
  }

  const validateAndCreateContractFile = async () => {
    const exists = await facade.plugin.call('fileManager', 'exists', '/contracts')
    if (!exists) {
      await facade.plugin.call('fileManager', 'mkdir', 'contracts')
    }
    await facade.plugin.call('fileManager', 'writeFileNoRewrite', `/contracts/${state.contractName}.sol`, state.contractCode)
    trackMatomoEvent({ category: MatomoCategories.TEMPLATE_EXPLORER_MODAL, action: 'addContractFileToWorkspace', name: state.contractName, isClick: true })
    facade.closeWizard()
    await facade.plugin.call('fileManager', 'open', `/contracts/${state.contractName}.sol`)
    await facade.plugin.call('notification', 'toast', 'Contract file created successfully')
  }

  return (
    <section className="tem-wizard">
      <div className="tem-wizard-header">
        {state.manageCategory === 'Template' ? (
          <div className="d-flex flex-column gap-1">
            <label className="tem-form-label">Workspace name</label>
            <input
              data-id="contract-wizard-workspace-name-input"
              className="form-control form-control-sm tem-form-input"
              value={uniqueWorkspaceName}
              onChange={(e) => setUniqueWorkspaceName(e.target.value)}
            />
          </div>
        ) : <div />}
        <ContractTagSelector switching={switching} />
      </div>

      <div className="tem-wizard-content">
        <div data-id="contract-wizard-container" className="tem-wizard-sidebar">
          <div className="d-flex flex-column gap-1">
            <label data-id="contract-wizard-token-name-label" className="tem-form-label">Token name</label>
            <input data-id="contract-wizard-token-name-input" className="form-control form-control-sm tem-form-input" value={state.tokenName} onChange={(e) => updateContractName(e.target.value)} />
          </div>

          <div className="d-flex flex-column gap-2">
            <p data-id="contract-wizard-features-title" className="tem-form-label">Features</p>
            <div className="d-flex flex-column gap-1">
              <div className="form-check m-0">
                <input data-id="contract-wizard-mintable-checkbox" className="form-check-input" type="checkbox" id="featMintable" checked={strategy.contractOptions.mintable} onChange={() => toggleContractOption('mintable')} />
                <label className="form-check-label" htmlFor="featMintable">Mintable</label>
              </div>
              <div className="form-check m-0">
                <input data-id="contract-wizard-burnable-checkbox" className="form-check-input" type="checkbox" id="featBurnable" checked={strategy.contractOptions.burnable} onChange={() => toggleContractOption('burnable')} />
                <label className="form-check-label" htmlFor="featBurnable">Burnable</label>
              </div>
              <div className="form-check m-0">
                <input data-id="contract-wizard-pausable-checkbox" className="form-check-input" type="checkbox" id="featPausable" checked={strategy.contractOptions.pausable} onChange={() => toggleContractOption('pausable')} />
                <label className="form-check-label" htmlFor="featPausable">Pausable</label>
              </div>
              {strategy.contractType === 'erc20' && (
                <div className="form-check m-0">
                  <input data-id="contract-wizard-permit-checkbox" className="form-check-input" type="checkbox" id="featPermit" checked={strategy.contractOptions.permit} onChange={() => toggleContractOption('permit')} />
                  <label className="form-check-label" htmlFor="featPermit">Permit</label>
                </div>
              )}
            </div>
          </div>

          <div className="d-flex flex-column gap-2">
            <p className="tem-form-label">Access control</p>
            <div className="d-flex flex-column gap-1">
              <div className="form-check m-0">
                <input data-id="contract-wizard-access-ownable-radio" className="form-check-input" type="radio" name="accessControl" id="accessOwnable" checked={strategy.contractAccessControl==='ownable'} onChange={() => switchAccessControl('ownable')} />
                <label className="form-check-label" htmlFor="accessOwnable">Ownable</label>
              </div>
              <div className="form-check m-0">
                <input data-id="contract-wizard-access-roles-radio" className="form-check-input" type="radio" name="accessControl" id="accessRoles" checked={strategy.contractAccessControl==='roles'} onChange={() => switchAccessControl('roles')} />
                <label className="form-check-label" htmlFor="accessRoles">Roles</label>
              </div>
              <div className="form-check m-0">
                <input data-id="contract-wizard-access-managed-radio" className="form-check-input" type="radio" name="accessControl" id="accessManaged" checked={strategy.contractAccessControl==='managed'} onChange={() => switchAccessControl('managed')} />
                <label className="form-check-label" htmlFor="accessManaged">Managed</label>
              </div>
            </div>
          </div>

          <div className="d-flex flex-column gap-2">
            <p className="tem-form-label">Upgradability</p>
            <div className="d-flex flex-column gap-1">
              <div className="form-check m-0">
                <input data-id="contract-wizard-upgradability-uups-checkbox" className="form-check-input" type="checkbox" id="featUups" checked={strategy.contractUpgradability.uups} onChange={() => {
                  dispatch({ type: ContractWizardAction.CONTRACT_UPGRADABILITY_UPDATE, payload: { ...strategy.contractUpgradability, uups: !strategy.contractUpgradability.uups } })
                  dispatch({ type: ContractWizardAction.CONTRACT_ACCESS_CONTROL_UPDATE, payload: strategy.contractAccessControl })
                }} />
                <label className="form-check-label" htmlFor="featUups">UUPS</label>
              </div>
              <div className="form-check m-0">
                <input data-id="contract-wizard-upgradability-transparent-checkbox" className="form-check-input" type="checkbox" id="featTransparent" checked={strategy.contractUpgradability.transparent} onChange={() => dispatch({ type: ContractWizardAction.CONTRACT_UPGRADABILITY_UPDATE, payload: { ...strategy.contractUpgradability, transparent: !strategy.contractUpgradability.transparent } })} />
                <label className="form-check-label" htmlFor="featTransparent">Transparent</label>
              </div>
            </div>
          </div>
        </div>

        <div data-id="contract-wizard-editor-container" className="tem-wizard-editor">
          <CodeMirror
            data-id="contract-wizard-editor"
            value={strategy.contractCode as string}
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
            extensions={[javascript({ typescript: true }), vscodeDark, darkTheme]}
          />
        </div>
      </div>

      <div className="tem-form-footer">
        {state.manageCategory === 'Template' ? (
          <div className="form-check m-0">
            <input data-id="contract-wizard-initialize-as-git-repo-checkbox" className="form-check-input" type="checkbox" id="initGit" checked={state.initializeAsGitRepo}
              onChange={(e) => dispatch({ type: ContractWizardAction.INITIALIZE_AS_GIT_REPO_UPDATE, payload: e.target.checked })} />
            <label className="form-check-label" htmlFor="initGit">Initialize as a Git repository</label>
          </div>
        ) : <div />}
        <button data-id="contract-wizard-validate-workspace-button" className="btn btn-primary btn-sm" disabled={state.creating} onClick={async () => {
          if (state.manageCategory === 'Files') {
            await validateAndCreateContractFile()
          } else {
            await validateAndCreateWorkspace()
          }
        }}>
          {state.creating ? <><i className="fas fa-spinner fa-spin me-2"></i>Creating...</> : <><i className="far fa-check me-2"></i>{state.manageCategory === 'Files' ? 'Create contract file' : 'Create workspace'}</>}
        </button>
      </div>
    </section>
  )
}
