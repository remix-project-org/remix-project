export interface PluginProfile {
  name: string
  displayName: string
  description: string
  keywords?: string[]
  icon?: string
  url?: string
  methods?: string[]
  events?: string[]
  version?: string
}

export interface StatusBarInterface {
  htmlElement: HTMLDivElement
  events: EventEmitter
  filePanelPlugin: FilePanelType
  dispatch: React.Dispatch<any>
  setDispatch(dispatch: React.Dispatch<any>): void
}

type NavigatorUAData = {
  brands: Record<string, string>
  fullVersion: string
  mobile: boolean
  platform: string
  getHighEntropyValues: (options: string[]) => Promise<Record<string, {
    wow64: boolean,
    uaFullVersion: string,
    platformVersion: string,
    model: string,
    fullVersionList: Record<string, string>[]
    formFactor: string,
    bitness: string,
    architecture: string,
    platform: string,
    mobile: boolean,
    brands: Record<string, string>
  }>>
  toJson: () => string
}

export interface RemixNavigator extends Navigator {
  userAgentData: NavigatorUAData
}

export interface IRemixAppManager {
  actives: string[]
  pluginsDirectory: string
  event: EventEmitter
  pluginLoader: PluginLoader
  canActivatePlugin(from: any, to: any): Promise<boolean>
  canDeactivatePlugin(from: any, to: any): Promise<boolean>
  canDeactivate(from: any, to: any): Promise<boolean>
  deactivatePlugin(name: string): Promise<void>
  canCall(from: string, to: string, method: string, message: string): Promise<boolean>
  onPluginActivated(plugin: any): void
  onPluginDeactivated(plugin: any): void
  getAll(): Profile<any>[]
  getIds(): string[]
  isDependent(name: string): boolean
  isRequired(name: string): boolean
  registeredPlugins(): Promise<any[]>
  registerContextMenuItems(): Promise<void>
}

export type PluginNames = 'manager' |
  'config' |
  'compilerArtefacts' |
  'compilerMetadata' |
  'compilerloader' |
  'contextualListener' |
  'editor' |
  'offsetToLineColumnConverter' |
  'network' |
  'theme' |
  'locale' |
  'fileManager' |
  'contentImport' |
  'blockchain' |
  'web3Provider' |
  'scriptRunner' |
  'scriptRunnerBridge' |
  'fetchAndCompile' |
  'mainPanel' |
  'hiddenPanel' |
  'sidePanel' |
  'menuicons' |
  'filePanel' |
  'terminal' |
  'statusBar' |
  'settings' |
  'pluginManager' |
  'tabs' |
  'udapp' |
  'dgitApi' |
  'solidity' |
  'solidity-logic' |
  'gistHandler' |
  'layout' |
  'notification' |
  'permissionhandler' |
  'walkthrough' |
  'storage' |
  'restorebackupzip' |
  'link-libraries' |
  'deploy-libraries' |
  'openzeppelin-proxy' |
  'hardhat-provider' |
  'ganache-provider' |
  'foundry-provider' |
  'basic-http-provider' |
  'vm-custom-fork' |
  'vm-mainnet-fork' |
  'vm-sepolia-fork' |
  'vm-paris' |
  'vm-london' |
  'vm-berlin' |
  'vm-shanghai' |
  'compileAndRun' |
  'search' |
  'recorder' |
  'fileDecorator' |
  'codeParser' |
  'codeFormatter' |
  'solidityumlgen' |
  'compilationDetails' |
  'vyperCompilationDetails' |
  'contractflattener' |
  'solidity-script' |
  'home' |
  'doc-viewer' |
  'doc-gen' |
  'remix-templates' |
  'remixAID' |
  'solhint' |
  'dgit' |
  'rightSidePanel' |
  'pluginStateLogger' |
  'environmentExplorer' |
  'templateSelection' |
  'matomo' |
  'walletconnect' |
  'popupPanel' |
  'remixAI' |
  'remixAID' |
  'remixaiassistant' |
  'doc-gen' |
  'doc-viewer' |
  'contract-verification' |
  'vyper' |
  'solhint' |
  'circuit-compiler' |
  'learneth'