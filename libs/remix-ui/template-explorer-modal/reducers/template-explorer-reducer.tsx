import React from 'react'
import { ContractWizardAction, MetadataType, TemplateExplorerWizardAction, TemplateExplorerWizardState, TemplateRepository, WizardStep } from '../types/template-explorer-types'
import { metadata, templatesRepository } from '../src/utils/helpers'
import * as erc20 from '../src/contractCode/erc20'
import { getErc20ContractCode } from '../src/utils/contractWizardUtils'

export const initialState: TemplateExplorerWizardState = {
  workspaceTemplateChosen: '',
  workspaceTemplateGroupChosen: '',
  workspaceName: 'workspace Name',
  defaultWorkspaceName: '',
  topLeftNagivationName: '',
  initializeAsGitRepo: false,
  workspaceGeneratedWithAi: false,
  searchTerm: '',
  metadata: metadata as any,
  templateRepository: templatesRepository as TemplateRepository || [],
  selectedTag: null,
  setSearchTerm: (term: string) => {},
  wizardStep: 'template',
  setWizardStep: (step: WizardStep) => {},
  recentBump: 0,
  contractType: 'erc20',
  workspaceTemplateType: '',
  contractTag: 'ERC20',
  contractOptions: {
    mintable: false,
    burnable: false,
    pausable: false
  },
  contractAccessControl: '',
  contractUpgradability: {
    uups: false,
    transparent: false
  },
  contractCode: erc20.erc20DefaultNoOptions('MyToken'),
  contractImport: '',
  gitUrl: '',
  tokenName: 'MyToken',
  contractName: 'MyToken',
  manageCategory: 'Template'
}

export const templateExplorerReducer = (state: TemplateExplorerWizardState, action: any) => {
  switch (action.type) {
  case TemplateExplorerWizardAction.RESET_STATE:
    return { ...state, contractCode: getErc20ContractCode('erc20', state) }
  case TemplateExplorerWizardAction.SET_TEMPLATE_REPOSITORY:
    return { ...state, templateRepository: action.payload }
  case TemplateExplorerWizardAction.SET_METADATA:
    return { ...state, metadata: action.payload }
  case TemplateExplorerWizardAction.SELECT_TEMPLATE:{
    return { ...state, workspaceTemplateChosen: action.payload }
  }
  case TemplateExplorerWizardAction.SET_WORKSPACE_TEMPLATE:{
    return { ...state, workspaceTemplateChosen: action.payload }
  }
  case TemplateExplorerWizardAction.SET_WORKSPACE_TEMPLATE_GROUP:{
    return { ...state, workspaceTemplateGroupChosen: action.payload }
  }
  case TemplateExplorerWizardAction.SET_WORKSPACE_TEMPLATE_TYPE:{
    return { ...state, workspaceTemplateType: action.payload }
  }
  case TemplateExplorerWizardAction.SET_WORKSPACE_NAME:{
    return { ...state, workspaceName: action.payload }
  }
  case TemplateExplorerWizardAction.SET_MANAGE_CATEGORY:{
    return { ...state, manageCategory: action.payload }
  }
  case TemplateExplorerWizardAction.SET_DEFAULT_WORKSPACE_NAME:{
    return { ...state, defaultWorkspaceName: action.payload }
  }
  case TemplateExplorerWizardAction.MODIFY_WORKSPACE: {
    return { ...state, wizardStep: action.payload as WizardStep }
  }
  case TemplateExplorerWizardAction.SET_TOP_LEFT_NAVIGATION_NAME:
    return { ...state, topLeftNagivationName: action.payload }
  case TemplateExplorerWizardAction.SET_INITIALIZE_AS_GIT_REPO:
    return { ...state, initializeAsGitRepo: action.payload }
  case TemplateExplorerWizardAction.SET_WORKSPACE_GENERATED_WITH_AI:
    return { ...state, workspaceGeneratedWithAi: action.payload }
  case TemplateExplorerWizardAction.END_WORKSPACE_WIZARD:
    return { ...state, wizardStep: 'confirm' }
  case TemplateExplorerWizardAction.FINALIZE_WORKSPACE_CREATION: {
    return initialState
  }
  case TemplateExplorerWizardAction.SET_SELECTED_TAG: {
    return { ...state, selectedTag: action.payload }
  }
  case TemplateExplorerWizardAction.SET_RECENT_BUMP: {
    return { ...state, recentBump: action.payload }
  }
  case TemplateExplorerWizardAction.CLEAR_SELECTED_TAG: {
    return { ...state, selectedTag: null }
  }
  case TemplateExplorerWizardAction.SET_SEARCH_TERM: {
    return { ...state, searchTerm: action.payload }
  }
  case TemplateExplorerWizardAction.SET_WIZARD_STEP: {
    return { ...state, wizardStep: action.payload }
  }
  case ContractWizardAction.CONTRACT_TYPE_UPDATED: {
    return { ...state, contractType: action.payload }
  }
  case ContractWizardAction.CONTRACT_UPGRADABILITY_UPDATE: {
    return { ...state, contractUpgradability: action.payload }
  }
  case ContractWizardAction.CONTRACT_ACCESS_CONTROL_UPDATE: {
    return { ...state, contractAccessControl: action.payload }
  }
  case ContractWizardAction.CONTRACT_OPTIONS_UPDATE: {
    return { ...state, contractOptions: action.payload }
  }
  case ContractWizardAction.CONTRACT_CODE_UPDATE: {
    return { ...state, contractCode: action.payload }
  }
  case ContractWizardAction.CONTRACT_IMPORT_UPDATE: {
    return { ...state, contractImport: action.payload }
  }
  case ContractWizardAction.INITIALIZE_AS_GIT_REPO_UPDATE: {
    return { ...state, initializeAsGitRepo: action.payload }
  }
  case ContractWizardAction.TOKEN_NAME_UPDATE: {
    return { ...state, tokenName: action.payload }
  }
  case ContractWizardAction.CONTRACT_NAME_UPDATE: {
    return { ...state, contractName: action.payload }
  }
  case ContractWizardAction.CONTRACT_TAG_UPDATE: {
    return { ...state, contractTag: action.payload }
  }
  default: {
    return { ...state, contractCode: getErc20ContractCode('erc20', state) }
  }
  }
}
