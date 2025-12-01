/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import { WorkspaceTemplate } from 'libs/remix-ui/workspace/src/lib/types'
import { TemplateExplorerModalFacade } from '../src/utils/workspaceUtils'
import { TemplateCategoryStrategy } from '../stategies/templateCategoryStrategy'
import { TemplateExplorerModalPlugin } from 'apps/remix-ide/src/app/plugins/template-explorer-modal'
import { MatomoEvent, TemplateExplorerModalEvent } from '@remix-api'

export interface TemplateExplorerWizardState {
  workspaceTemplateChosen: any
  workspaceTemplateGroupChosen: string
  workspaceName: string
  workspaceTemplateType: string
  defaultWorkspaceName: string
  topLeftNagivationName: string
  initializeAsGitRepo: boolean
  workspaceGeneratedWithAi: boolean
  searchTerm: string
  metadata: MetadataType
  templateRepository: TemplateCategory[]
  selectedTag: string | null
  recentBump: number
  setSearchTerm: (term: string) => void
  wizardStep: WizardStep
  setWizardStep: (step: WizardStep) => void
  contractType: ContractType
  contractTag: 'ERC20' | 'ERC721' | 'ERC1155'
  contractOptions: {
    mintable?: boolean
    burnable?: boolean
    pausable?: boolean
  }
  contractAccessControl: AccessControlType
  contractUpgradability: {
    uups?: boolean
    transparent?: boolean
  }
  contractCode: string
  contractImport?: string
  contractName?: string
  tokenName?: string
  manageCategory: 'Template' | 'Files'
}

export type WizardStep = 'template' | 'finishSetup' | 'wizard' | 'import' | 'genAI' | 'generic' | 'remixdefault' | 'cookbook' | 'back' | 'reset' | 'ModifyWorkspace' | 'confirm' | 'scripts' | 'aiFileGeneration' | 'importFiles' | 'importHttps'

export interface TemplateExplorerContextType {
  plugin: TemplateExplorerModalPlugin
  templateRepository: TemplateCategory[]
  metadata: any[]
  selectedTag: string | null
  recentTemplates: TemplateItem[]
  filteredTemplates: TemplateCategory[]
  dedupedTemplates: TemplateCategory[]
  setSearchTerm: (term: string) => void
  handleTagClick: (tag: string) => void
  clearFilter: () => void
  addRecentTemplate: (template: TemplateItem) => void
  RECENT_KEY: string
  allTags: string[]
  dispatch: (action: any) => void
  state: TemplateExplorerWizardState
  theme: any
  facade: TemplateExplorerModalFacade
  templateCategoryStrategy: TemplateCategoryStrategy
  generateUniqueWorkspaceName: (name: string) => Promise<string>
  trackMatomoEvent: <T extends MatomoEvent = TemplateExplorerModalEvent>(event: T) => void
  fileMode: boolean
  ipfsMode: boolean
  httpImportMode: boolean
}

export enum TemplateExplorerWizardAction {
  SET_WORKSPACE_TEMPLATE = 'SET_WORKSPACE_TEMPLATE',
  SET_WORKSPACE_TEMPLATE_WIZARD_STEP = 'SET_WORKSPACE_TEMPLATE_WIZARD_STEP',
  SET_WORKSPACE_TEMPLATE_GROUP = 'SET_WORKSPACE_TEMPLATE_GROUP',
  SET_WORKSPACE_NAME = 'SET_WORKSPACE_NAME',
  SET_DEFAULT_WORKSPACE_NAME = 'SET_DEFAULT_WORKSPACE_NAME',
  SET_TOP_LEFT_NAVIGATION_NAME = 'SET_TOP_LEFT_NAVIGATION_NAME',
  SET_INITIALIZE_AS_GIT_REPO = 'SET_INITIALIZE_AS_GIT_REPO',
  SET_WORKSPACE_GENERATED_WITH_AI = 'SET_WORKSPACE_GENERATED_WITH_AI',
  END_WORKSPACE_WIZARD = 'END_WORKSPACE_WIZARD',
  SET_RECENT_BUMP = 'SET_RECENT_BUMP',
  SET_SELECTED_TAG = 'SET_SELECTED_TAG',
  CLEAR_SELECTED_TAG = 'CLEAR_SELECTED_TAG',
  SET_METADATA = 'SET_METADATA',
  SET_TEMPLATE_REPOSITORY = 'SET_TEMPLATE_REPOSITORY',
  SELECT_TEMPLATE = 'SELECT_TEMPLATE',
  GENERATE_TEMPLATE = 'GENERATE_TEMPLATE',
  MODIFY_WORKSPACE = 'MODIFY_WORKSPACE',
  REVIEW_WORKSPACE = 'REVIEW_WORKSPACE',
  IMPORT_WORKSPACE = 'IMPORT_WORKSPACE',
  FINALIZE_WORKSPACE_CREATION = 'FINALIZE_WORKSPACE_CREATION',
  ABORT_WORKSPACE_CREATION = 'ABORT_WORKSPACE_CREATION',
  BACK_ONE_STEP = 'BACK_ONE_STEP',
  SET_SEARCH_TERM = 'SET_SEARCH_TERM',
  SET_WIZARD_STEP = 'SET_WIZARD_STEP',
  RESET_STATE = 'RESET_STATE',
  SET_WORKSPACE_TEMPLATE_TYPE = 'SET_WORKSPACE_TEMPLATE_TYPE',
  SET_MANAGE_CATEGORY = 'SET_MANAGE_CATEGORY',
  IMPORT_FILES = 'IMPORT_FILES',
  IMPORT_HTTPS = 'IMPORT_HTTPS'
}

export interface TemplateItem {
  value: string
  displayName?: string
  description?: string
  tagList?: string[]
  IsArtefact?: boolean
  opts?: {
    upgradeable?: string
    mintable?: boolean
    burnable?: boolean
    pausable?: boolean
  }
  templateType?: TemplateType
}

export type TemplateType = {
  type: 'git' | 'plugin'
  url: string
  branch?: string
  name?: string
  endpoint?: string
  params?: string[]
  forceCreateNewWorkspace?: boolean
  desktopCompatible?: boolean
  disabled?: boolean
}
export interface TemplateCategory {
  name: string
  description?: string
  hasOptions?: boolean
  IsArtefact?: boolean
  tooltip?: string
  onClick?: () => void
  onClickLabel?: string
  items: TemplateItem[]
}

export type TemplateRepository = TemplateCategory[]

export type MetadataType = Record<string, MetadataItem>

export type MetadataItem =
{
    type: 'git'
    url: string
    branch?: string
    forceCreateNewWorkspace: boolean
  }
| {
    type: 'plugin'
    name: string
    endpoint?: string
    params?: string[]
    forceCreateNewWorkspace?: boolean
    desktopCompatible?: boolean
    disabled?: boolean;
  }

export interface TemplateExplorerProps {
  plugin?: any
}

export interface TopCardProps {
  title: string
  description: string
  icon: string
  onClick: () => void
  importWorkspace: boolean
}

export enum ContractWizardAction {
  CONTRACT_TYPE_UPDATED = 'CONTRACT_TYPE_UPDATED',
  CONTRACT_OPTIONS_UPDATE = 'CONTRACT_OPTIONS_UPDATE',
  CONTRACT_ACCESS_CONTROL_UPDATE = 'CONTRACT_ACCESS_CONTROL_UPDATE',
  CONTRACT_UPGRADABILITY_UPDATE = 'CONTRACT_UPGRADABILITY_UPDATE',
  CONTRACT_CODE_UPDATE = 'CONTRACT_CODE_UPDATE',
  CONTRACT_IMPORT_UPDATE = 'CONTRACT_IMPORT_UPDATE',
  INITIALIZE_AS_GIT_REPO_UPDATE = 'INITIALIZE_AS_GIT_REPO_UPDATE',
  TOKEN_NAME_UPDATE = 'TOKEN_NAME_UPDATE',
  CONTRACT_NAME_UPDATE = 'CONTRACT_NAME_UPDATE',
  CONTRACT_TAG_UPDATE = 'CONTRACT_TAG_UPDATE'
}

export interface ContractTypeStrategy {
  contractType: ContractType
  contractOptions: {
    mintable?: boolean
    burnable?: boolean
    pausable?: boolean
  }
  contractAccessControl: AccessControlType
  contractUpgradability: {
    uups?: boolean
    transparent?: boolean
  }
  contractCode: string
  contractImport?: string
  initializeAsGitRepo: boolean
  contractName?: string
  tokenName?: string
}

export type AccessControlType = 'ownable' | 'roles' | 'managed' | ''
export type ContractType = 'erc20' | 'erc721' | 'erc1155'

export interface ContractOptions {mintable: boolean, burnable: boolean, pausable: boolean}
export interface ContractUpgradability {uups: boolean, transparent: boolean}

export interface ModifyContractProps {
  tokenName: string
  updateTokenName: (tokenName: string) => void
  strategy: ContractTypeStrategy & {contractOptions: ContractOptions, contractUpgradability: ContractUpgradability}
  toggleContractOption: (key: keyof ContractOptions) => void
  switchAccessControl: (accessControl: AccessControlType) => void
  checkBoxDispatch: (value: {
    type: ContractWizardAction;
    payload: any;
}) => void
}

export interface CreateWorkspaceDeps {
  workspaceName: string,
  workspaceTemplateName: WorkspaceTemplate,
  opts?: { mintable?: boolean, burnable?: boolean, pausable?: boolean, uups?: boolean, transparent?: boolean },
  isEmpty?: boolean,
  cb?: (err: Error, result?: string | number | boolean | Record<string, any>) => void,
  isGitRepo?: boolean,
  createCommit?: boolean,
  contractContent?: string,
  contractName?: string,
}

type TemplateItemState = {
  value: string,
  displayName: string,
  tagList: string[],
  description: string
}
