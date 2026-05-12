'use strict'
import { RunTab, makeUdapp } from './app/udapp'
import { RemixEngine } from './remixEngine'
import { RemixAppManager } from './remixAppManager'
import { ResolutionIndexPlugin } from '@remix-project/core-plugin'
import { LocaleModule } from './app/tabs/locale-module'
import { NetworkModule } from './app/tabs/network-module'
import { Web3ProviderModule } from './app/tabs/web3-provider'
import { CompileAndRun } from './app/tabs/compile-and-run'
import { PluginStateLogger } from './app/tabs/state-logger'
import { SidePanel } from './app/components/side-panel'
import { HiddenPanel } from './app/components/hidden-panel'
import { RightSidePanel } from './app/components/right-side-panel'
import { PopupPanel } from './app/components/popup-panel'
import { OverlayPanel } from './app/components/overlay-panel'
import { LandingPage } from './app/ui/landing-page/landing-page'
import { MainPanel } from './app/components/main-panel'
import { PermissionHandlerPlugin } from './app/plugins/permission-handler-plugin'
import { AstWalker } from '@remix-project/remix-astwalker'
import { LinkLibraries, DeployLibraries, OpenZeppelinProxy } from '@remix-project/core-plugin'
import { CodeParser } from './app/plugins/parser/code-parser'
import { SolidityScript } from './app/plugins/solidity-script'
import { StatusBar } from './app/components/status-bar'
import { Topbar } from './app/components/top-bar'
import { ThemeModule } from './app/tabs/theme-module'
import { VerticalIcons } from './app/components/vertical-icons'
import { RemixAIAssistant } from './app/plugins/remix-ai-assistant'
import { QuickDappV2 } from './app/plugins/quick-dapp-v2'
import { SolidityUmlGen } from './app/plugins/solidity-umlgen'
import { VyperCompilationDetailsPlugin } from './app/plugins/vyper-compilation-details'
import { ContractFlattener } from './app/plugins/contractFlattener'

import { WalkthroughService } from './walkthroughService'

import { OffsetToLineColumnConverter, CompilerMetadata, CompilerArtefacts, FetchAndCompile, CompilerImports, GistHandler, AmpPlugin, ChartJsPlugin } from '@remix-project/core-plugin'

import { Registry, AppLifecycle, LifecyclePlugin, all } from '@remix-project/remix-lib'
import { ConfigPlugin } from './app/plugins/config'
import { StoragePlugin } from './app/plugins/storage'
import { StorageMonitorPlugin } from './app/plugins/storage-monitor'
import { Layout } from './app/panels/layout'
import { NotificationPlugin } from './app/plugins/notification'
import { Blockchain } from './blockchain/blockchain'
import { MergeVMProvider, LondonVMProvider, BerlinVMProvider, ShanghaiVMProvider, CancunVMProvider, PectraVMProvider, FusakaVMProvider } from '@remix-ui/run-tab-environment'
import { MainnetForkVMProvider, SepoliaForkVMProvider, CustomForkVMProvider, HardhatProvider, GanacheProvider, FoundryProvider, ExternalHttpProvider, BaseProvider } from '@remix-ui/run-tab-environment'
import { EnvironmentExplorer } from './app/providers/environment-explorer'
import { FileDecorator } from './app/plugins/file-decorator'
import { TransactionSimulator } from './app/plugins/transaction-simulator'
import { CodeFormat } from './app/plugins/code-format'
import { CompilationDetailsPlugin } from './app/plugins/compile-details'
import { AuthPlugin } from './app/plugins/auth-plugin'
import { InvitationManagerPlugin } from './app/plugins/invitation-manager-plugin'
import { MembershipRequestPlugin } from './app/plugins/membership-request-plugin'
import { BetaCornerWidgetPlugin } from './app/plugins/beta-corner-widget-plugin'
import { NudgePlugin } from './app/plugins/nudge-plugin'
import { HelpPlugin } from '@remix-ui/modal-help'
import { AccountPlugin } from './app/plugins/account-plugin'
import { RemixGuidePlugin } from './app/plugins/remixGuide'
import { TemplatesPlugin } from './app/plugins/remix-templates'
import { fsPlugin } from './app/plugins/electron/fsPlugin'
import { isoGitPlugin } from './app/plugins/electron/isoGitPlugin'
import { electronConfig } from './app/plugins/electron/electronConfigPlugin'
import { electronTemplates } from './app/plugins/electron/templatesPlugin'
import { xtermPlugin } from './app/plugins/electron/xtermPlugin'
import { ripgrepPlugin } from './app/plugins/electron/ripgrepPlugin'
import { compilerLoaderPlugin, compilerLoaderPluginDesktop } from './app/plugins/electron/compilerLoaderPlugin'
import { appUpdaterPlugin } from './app/plugins/electron/appUpdaterPlugin'
import { RemixAIPlugin } from './app/plugins/remixAIPlugin'
import { SlitherHandleDesktop } from './app/plugins/electron/slitherPlugin'
import { SlitherHandle } from './app/files/slither-handle'
import { FoundryHandle } from './app/files/foundry-handle'
import { FoundryHandleDesktop } from './app/plugins/electron/foundryPlugin'
import { HardhatHandle } from './app/files/hardhat-handle'
import { HardhatHandleDesktop } from './app/plugins/electron/hardhatPlugin'
import { circomPlugin } from './app/plugins/electron/circomElectronPlugin'
import { GitHubAuthHandler } from './app/plugins/electron/gitHubAuthHandler'
import { DesktopAuthHandler as DesktopAuthHandlerPlugin } from './app/plugins/electron/desktopAuthHandler'
import { GitPlugin } from './app/plugins/git'
import { Matomo } from './app/plugins/matomo'
import { DesktopClient } from './app/plugins/desktop-client'
import { DesktopHost } from './app/plugins/electron/desktopHostPlugin'
import { WalletConnect } from './app/plugins/walletconnect'
import { AIDappGenerator } from './app/plugins/ai-dapp-generator'
import { IndexedDbCachePlugin } from './app/plugins/IndexedDbCache'
import { NotificationCenterPlugin } from './app/plugins/notification-center'
import { FeedbackPlugin } from './app/plugins/feedback'
import { EnvironmentPlugin } from './app/udapp/udappEnv'
import { DeployPlugin } from './app/udapp/udappDeploy'
import { DeployedContractsPlugin } from './app/udapp/udappDeployedContracts'
import { TransactionsPlugin } from './app/udapp/udappTransactions'

import { TemplatesSelectionPlugin } from './app/plugins/templates-selection/templates-selection-plugin'

import isElectron from 'is-electron'

import * as remixLib from '@remix-project/remix-lib'

import { QueryParams } from '@remix-project/remix-lib'
import { SearchPlugin } from './app/tabs/search'
import { ScriptRunnerBridgePlugin } from './app/plugins/script-runner-bridge'
import { ElectronProvider } from './app/files/electronProvider'
import { IframePlugin } from '@remixproject/engine-web'
import { endpointUrls } from '@remix-endpoints-helper'

const Storage = remixLib.Storage
import RemixDProvider from './app/files/remixDProvider'
import Config from './config'

import FileManager from './app/files/fileManager'
import FileProvider from "./app/files/fileProvider"
import { appPlatformTypes } from '@remix-ui/app'
import { MatomoEvent } from '@remix-api'

import DGitProvider from './app/files/dgitProvider'
import WorkspaceFileProvider from './app/files/workspaceFileProvider'
import { createWorkspaceProviderProxy } from './app/files/workspaceProviderProxy'

import { PluginManagerComponent } from './app/components/plugin-manager-component'

import CompileTab from './app/tabs/compile-tab'
import SettingsTab from './app/tabs/settings-tab'
import AnalysisTab from './app/tabs/analysis-tab'
import DebuggerTab from './app/tabs/debugger-tab'
import TestTab from './app/tabs/test-tab'
import Filepanel from './app/panels/file-panel'
import Editor from './app/editor/editor'
import Terminal from './app/panels/terminal'
import TabProxy from './app/panels/tab-proxy.js'
import BottomBarPanel from './app/components/bottom-bar-panel'
import { TemplateExplorerModalPlugin } from './app/plugins/template-explorer-modal'
import { SkillsExplorerModalPlugin } from './app/plugins/skills-explorer-modal'
import { TxRunnerPlugin } from './app/plugins/txRunnerPlugin'

// Tracking now handled by this.track() method using MatomoManager

export class platformApi {
  get name() {
    return isElectron() ? appPlatformTypes.desktop : appPlatformTypes.web
  }
  isDesktop() {
    return isElectron()
  }
}

type Components = {
  filesProviders: {
    browser?: any
    localhost?: any
    workspace?: any
    electron?: any
  }
}

class AppComponent {
  appManager: RemixAppManager
  queryParams: QueryParams
  private _components: Components
  panels: any
  workspace: any
  engine: RemixEngine
  matomoConfAlreadySet: any
  matomoCurrentSetting: any
  showMatomo: boolean
  walkthroughService: WalkthroughService
  platform: 'desktop' | 'web'
  gistHandler: GistHandler
  themeModule: ThemeModule
  localeModule: LocaleModule
  notification: NotificationPlugin
  layout: Layout
  mainview: any
  menuicons: VerticalIcons
  sidePanel: SidePanel
  hiddenPanel: HiddenPanel
  rightSidePanel: RightSidePanel
  popupPanel: PopupPanel
  overlayPanel: OverlayPanel
  statusBar: StatusBar
  topBar: Topbar
  templateExplorerModal: TemplateExplorerModalPlugin
  skillExplorerModal: SkillsExplorerModalPlugin
  remixAiAssistant: RemixAIAssistant
  settings: SettingsTab
  authPlugin: AuthPlugin
  invitationManager: InvitationManagerPlugin
  membershipRequest: MembershipRequestPlugin
  betaCornerWidget: BetaCornerWidgetPlugin
  nudgePlugin: NudgePlugin
  helpPlugin: HelpPlugin
  accountPlugin: AccountPlugin
  lifecycle: AppLifecycle
  lifecyclePlugin: LifecyclePlugin
  params: any
  desktopClientMode: boolean

  // Tracking method that uses the global MatomoManager instance
  track(event: MatomoEvent) {
    try {
      const matomoManager = window._matomoManagerInstance
      if (matomoManager && matomoManager.trackEvent) {
        matomoManager.trackEvent(event)
      }
    } catch (error) {
      console.debug('Tracking error:', error)
    }
  }
  constructor() {
    const PlatFormAPi = new platformApi()
    Registry.getInstance().put({
      api: PlatFormAPi,
      name: 'platform'
    })
    this.appManager = new RemixAppManager()
    this.lifecycle = new AppLifecycle({ debug: false })
    this.lifecyclePlugin = new LifecyclePlugin(this.lifecycle)
    Registry.getInstance().put({ api: this.lifecycle, name: 'lifecycle' })
    this.queryParams = new QueryParams()
    this.params = this.queryParams.get()
    this.desktopClientMode = this.params && this.params.activate && this.params.activate.split(',').includes('desktopClient')

    // Capture invite token from URL params or hash early, before any plugin strips it
    const urlParams = new URLSearchParams(window.location.search)
    let inviteToken = urlParams.get('invite') || urlParams.get('invite_token') || null
    if (!inviteToken) {
      const hashMatch = window.location.hash.match(/[#&]invite=([A-Za-z0-9_-]+)/)
      if (hashMatch) inviteToken = hashMatch[1]
    }
    if (inviteToken) {
      Registry.getInstance().put({ api: inviteToken, name: 'inviteToken' })

      // Clean invite params from URL now that they're stored in the Registry
      urlParams.delete('invite')
      urlParams.delete('invite_token')
      const newSearch = urlParams.toString()

      // Remove invite=TOKEN from hash, then ensure remaining hash is well-formed
      let cleanHash = window.location.hash
        .replace(/([#&])invite=[A-Za-z0-9_-]+&?/, '$1') // remove invite param
        .replace(/[#&]$/, '') // trim trailing # or &
      if (cleanHash && !cleanHash.startsWith('#')) cleanHash = '#' + cleanHash

      const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + cleanHash
      window.history.replaceState(null, '', newUrl)
    }

    this._components = {} as Components
    // setup storage
    const configStorage = new Storage('config-v0.8:')

    // load app config
    const config = new Config(configStorage)
    Registry.getInstance().put({ api: config, name: 'config' })

    // load file system
    this._components.filesProviders = {}
    this._components.filesProviders.browser = new FileProvider('browser')
    Registry.getInstance().put({
      api: this._components.filesProviders.browser,
      name: 'fileproviders/browser'
    })
    this._components.filesProviders.localhost = new RemixDProvider(this.appManager)
    Registry.getInstance().put({
      api: this._components.filesProviders.localhost,
      name: 'fileproviders/localhost'
    })
    // Wrap the workspace provider in a transparent proxy so the object
    // reference in this slot NEVER changes.  Cloud mode toggles the
    // proxy's internal delegate instead of swapping the object.
    this._components.filesProviders.workspace = createWorkspaceProviderProxy(
      new WorkspaceFileProvider()
    )
    Registry.getInstance().put({
      api: this._components.filesProviders.workspace,
      name: 'fileproviders/workspace'
    })

    this._components.filesProviders.electron = new ElectronProvider(this.appManager)
    Registry.getInstance().put({
      api: this._components.filesProviders.electron,
      name: 'fileproviders/electron'
    })

    Registry.getInstance().put({
      api: this._components.filesProviders,
      name: 'fileproviders'
    })

  }

  async run() {
    // APP_MANAGER
    const appManager = this.appManager
    const pluginLoader = this.appManager.pluginLoader
    this.panels = {}
    this.workspace = pluginLoader.get()
    if (pluginLoader.current === 'queryParams') {
      this.workspace.map((workspace) => {
        this.track({ category: 'App', action: 'queryParams-activated', name: workspace, isClick: false })
      })
    }
    this.engine = new RemixEngine()
    this.engine.register(appManager)

    // Check if we should show the Matomo consent dialog using the MatomoManager
    const matomoManager = (window as any)._matomoManagerInstance;
    const configApi = Registry.getInstance().get('config').api;
    this.showMatomo = matomoManager ? matomoManager.shouldShowConsentDialog(configApi) : false;

    // Store config values for backwards compatibility
    this.matomoConfAlreadySet = configApi.exists('settings/matomo-perf-analytics');
    this.matomoCurrentSetting = configApi.get('settings/matomo-perf-analytics');

    if (this.showMatomo) {
      this.track({ category: 'MatomoManager', action: 'showConsentDialog', isClick: false });
    }

    this.walkthroughService = new WalkthroughService()

    this.platform = isElectron() ? 'desktop' : 'web'

    const hosts = ['127.0.0.1:8080', '192.168.0.101:8080', 'localhost:8080']
    // workaround for Electron support
    if (!isElectron() && !hosts.includes(window.location.host)) {
      // Oops! Accidentally trigger refresh or bookmark.
      window.onbeforeunload = function () {
        return 'Are you sure you want to leave?'
      }
    }

    this.templateExplorerModal = new TemplateExplorerModalPlugin()
    this.skillExplorerModal = new SkillsExplorerModalPlugin()
    // SERVICES
    // ----------------- gist service ---------------------------------
    this.gistHandler = new GistHandler()
    // ----------------- theme service ---------------------------------
    this.themeModule = new ThemeModule()
    // ----------------- locale service ---------------------------------
    this.localeModule = new LocaleModule()
    Registry.getInstance().put({ api: this.themeModule, name: 'themeModule' })
    Registry.getInstance().put({ api: this.localeModule, name: 'localeModule' })

    // ----------------- editor service ----------------------------
    const editor = new Editor() // wrapper around ace editor
    Registry.getInstance().put({ api: editor, name: 'editor' })
    editor.event.register('requiringToSaveCurrentfile', (currentFile) => {
      fileManager.saveCurrentFile()
      if (currentFile.endsWith('.circom')) this.appManager.activatePlugin(['circuit-compiler'])
    })

    // ----------------- cache plugin ----------------------------
    const indexedDbCache = new IndexedDbCachePlugin()

    // ----------------- fileManager service ----------------------------
    const fileManager = new FileManager(editor, appManager)
    Registry.getInstance().put({ api: fileManager, name: 'filemanager' })
    // ----------------- dGit provider ---------------------------------
    const dGitProvider = new DGitProvider()

    // ----------------- Storage plugin ---------------------------------
    const storagePlugin = new StoragePlugin()

    // ----------------- Storage Monitor plugin ---------------------------------
    const storageMonitor = new StorageMonitorPlugin()

    // ------- FILE DECORATOR PLUGIN ------------------
    const fileDecorator = new FileDecorator()

    // ------- TRANSACTION SIMULATOR PLUGIN ------------------
    const transactionSimulator = new TransactionSimulator()

    // ------- CODE FORMAT PLUGIN ------------------
    const codeFormat = new CodeFormat()

    //----- search
    const search = new SearchPlugin()

    //---------------- Script Runner UI Plugin -------------------------
    const scriptRunnerUI = new ScriptRunnerBridgePlugin(this.engine)

    //---- templates
    const templates = new TemplatesPlugin()

    //---- git
    const git = new GitPlugin()

    //---- matomo
    const matomo = new Matomo()

    //---- AI DApp Generator
    const aiDappGenerator = new AIDappGenerator()

    //---------------- Solidity UML Generator -------------------------
    const solidityumlgen = new SolidityUmlGen(appManager)

    // ----------------- Compilation Details ----------------------------
    const compilationDetails = new CompilationDetailsPlugin(appManager)
    const vyperCompilationDetails = new VyperCompilationDetailsPlugin(appManager)

    // ----------------- Remix Guide ----------------------------
    const remixGuide = new RemixGuidePlugin(appManager)

    // ----------------- ContractFlattener ----------------------------
    const contractFlattener = new ContractFlattener()

    // ----------------- AI --------------------------------------
    const remixAI = new RemixAIPlugin()
    const quickDappV2 = new QuickDappV2()
    this.remixAiAssistant = new RemixAIAssistant()

    // ----------------- import content service ------------------------
    const contentImport = new CompilerImports()
    // ----------------- resolution index service ----------------------
    const resolutionIndex = new ResolutionIndexPlugin()

    const blockchain = new Blockchain(Registry.getInstance().get('config').api)

    // ----------------- amp (thegraph) ------------------------
    const amp = new AmpPlugin()

    // ----------------- vega (generate visualization) ------------------------
    // const vega = new VegaPlugin()

    // ----------------- chart (generate visualization) ------------------------
    const chartjs = new ChartJsPlugin()

    // ----------------- compilation metadata generation service ---------
    const compilerMetadataGenerator = new CompilerMetadata()
    // ----------------- compilation result service (can keep track of compilation results) ----------------------------
    const compilersArtefacts = new CompilerArtefacts() // store all the compilation results (key represent a compiler name)
    Registry.getInstance().put({
      api: compilersArtefacts,
      name: 'compilersartefacts'
    })

    // service which fetch contract artifacts from sourve-verify, put artifacts in remix and compile it
    const fetchAndCompile = new FetchAndCompile()
    // ----------------- network service (resolve network id / name) -----
    const networkModule = new NetworkModule(blockchain)
    // ----------------- represent the current selected web3 provider ----
    const web3Provider = new Web3ProviderModule(blockchain)
    const vmProviderCustomFork = new CustomForkVMProvider(blockchain)
    const vmProviderMainnetFork = new MainnetForkVMProvider(blockchain)
    const vmProviderSepoliaFork = new SepoliaForkVMProvider(blockchain)
    const vmProviderShanghai = new ShanghaiVMProvider(blockchain)
    const vmProviderCancun = new CancunVMProvider(blockchain)
    const vmProviderPectra = new PectraVMProvider(blockchain)
    const vmProviderFusaka = new FusakaVMProvider(blockchain)
    const vmProviderMerge = new MergeVMProvider(blockchain)
    const vmProviderBerlin = new BerlinVMProvider(blockchain)
    const vmProviderLondon = new LondonVMProvider(blockchain)
    const hardhatProvider = new HardhatProvider(blockchain)
    const ganacheProvider = new GanacheProvider(blockchain)
    const foundryProvider = new FoundryProvider(blockchain)
    const externalHttpProvider = new ExternalHttpProvider(blockchain)
    const baseSepoliaChainId = 84532
    const baseMainnetChainId = 8453
    const baseProviderSepolia = new BaseProvider(baseSepoliaChainId)
    const baseProvider = new BaseProvider(baseMainnetChainId)

    const environmentExplorer = new EnvironmentExplorer()
    // ----------------- convert offset to line/column service -----------
    const offsetToLineColumnConverter = new OffsetToLineColumnConverter()
    Registry.getInstance().put({
      api: offsetToLineColumnConverter,
      name: 'offsettolinecolumnconverter'
    })
    // ----------------- run script after each compilation results -----------
    const compileAndRun = new CompileAndRun()
    // -------------------Terminal----------------------------------------
    makeUdapp(blockchain, (domEl) => terminal.logHtml(domEl))
    const terminal = new Terminal(
      { appManager, blockchain },
      {
        getPosition: (event) => {
          const limitUp = 36
          const limitDown = 20
          const height = window.innerHeight
          let newpos = event.pageY < limitUp ? limitUp : event.pageY
          newpos = newpos < height - limitDown ? newpos : height - limitDown
          return height - newpos
        }
      }
    )

    const codeParser = new CodeParser(new AstWalker())
    const solidityScript = new SolidityScript()

    this.notification = new NotificationPlugin()
    const notificationCenter = new NotificationCenterPlugin()

    const configPlugin = new ConfigPlugin()
    this.layout = new Layout()

    const permissionHandler = new PermissionHandlerPlugin()
    // ----------------- run script after each compilation results -----------
    const pluginStateLogger = new PluginStateLogger()

    const templateSelection = new TemplatesSelectionPlugin()

    const templateExplorerModal = this.templateExplorerModal
    const skillExplorerModal = this.skillExplorerModal

    const walletConnect = new WalletConnect()

    const udappEnvPlugin = new EnvironmentPlugin()
    const udappDeployPlugin = new DeployPlugin()
    const udappDeployedContractsPlugin = new DeployedContractsPlugin()
    const udappTransactionsPlugin = new TransactionsPlugin()
    const txRunnerPlugin = new TxRunnerPlugin()

    this.engine.register([
      this.lifecyclePlugin,
      txRunnerPlugin,
      permissionHandler,
      this.layout,
      this.notification,
      notificationCenter,
      this.gistHandler,
      configPlugin,
      blockchain,
      contentImport,
      resolutionIndex,
      this.themeModule,
      this.localeModule,
      this.remixAiAssistant,
      editor,
      fileManager,
      compilerMetadataGenerator,
      compilersArtefacts,
      networkModule,
      offsetToLineColumnConverter,
      codeParser,
      fileDecorator,
      transactionSimulator,
      codeFormat,
      terminal,
      web3Provider,
      compileAndRun,
      fetchAndCompile,
      dGitProvider,
      storagePlugin,
      storageMonitor,
      vmProviderShanghai,
      vmProviderCancun,
      vmProviderPectra,
      vmProviderFusaka,
      vmProviderMerge,
      vmProviderBerlin,
      vmProviderLondon,
      vmProviderSepoliaFork,
      vmProviderMainnetFork,
      vmProviderCustomFork,
      hardhatProvider,
      ganacheProvider,
      foundryProvider,
      externalHttpProvider,
      baseProvider,
      baseProviderSepolia,
      environmentExplorer,
      this.walkthroughService,
      search,
      solidityumlgen,
      compilationDetails,
      vyperCompilationDetails,
      remixGuide,
      contractFlattener,
      solidityScript,
      templates,
      git,
      pluginStateLogger,
      matomo,
      aiDappGenerator,
      templateSelection,
      scriptRunnerUI,
      remixAI,
      quickDappV2,
      walletConnect,
      amp,
      // vega,
      chartjs,
      indexedDbCache,
      udappEnvPlugin,
      udappDeployPlugin,
      udappDeployedContractsPlugin,
      udappTransactionsPlugin
    ])

    //---- fs plugin
    if (isElectron()) {
      const FSPlugin = new fsPlugin()
      this.engine.register([FSPlugin])
      const isoGit = new isoGitPlugin()
      this.engine.register([isoGit])
      const electronConfigPlugin = new electronConfig()
      this.engine.register([electronConfigPlugin])
      const templatesPlugin = new electronTemplates()
      this.engine.register([templatesPlugin])
      const xterm = new xtermPlugin()
      this.engine.register([xterm])
      const ripgrep = new ripgrepPlugin()
      this.engine.register([ripgrep])
      const circom = new circomPlugin()
      this.engine.register([circom])
      const appUpdater = new appUpdaterPlugin()
      this.engine.register([appUpdater])
      const desktopHost = new DesktopHost()
      this.engine.register([desktopHost])
      const githubAuthHandler = new GitHubAuthHandler()
      this.engine.register([githubAuthHandler])
      const desktopAuthHandler = new DesktopAuthHandlerPlugin()
      this.engine.register([desktopAuthHandler])
    } else {
      //---- desktop client
      const desktopClient = new DesktopClient(blockchain)
      this.engine.register([desktopClient])
    }

    const compilerloader = isElectron() ? new compilerLoaderPluginDesktop() : new compilerLoaderPlugin()
    this.engine.register([compilerloader])

    // slither analyzer plugin (remixd / desktop)
    const slitherPlugin = isElectron() ? new SlitherHandleDesktop() : new SlitherHandle()
    this.engine.register([slitherPlugin])

    //foundry plugin
    const foundryPlugin = isElectron() ? new FoundryHandleDesktop() : new FoundryHandle()
    this.engine.register([foundryPlugin])

    // hardhat plugin
    const hardhatPlugin = isElectron() ? new HardhatHandleDesktop() : new HardhatHandle()
    this.engine.register([hardhatPlugin])

    // LAYOUT & SYSTEM VIEWS
    const appPanel = new MainPanel()
    Registry.getInstance().put({ api: this.mainview, name: 'mainview' })
    const tabProxy = new TabProxy(fileManager, editor)
    this.engine.register([appPanel, tabProxy])

    // those views depend on app_manager
    this.menuicons = new VerticalIcons()
    this.sidePanel = new SidePanel()
    this.hiddenPanel = new HiddenPanel()
    this.rightSidePanel = new RightSidePanel()
    this.popupPanel = new PopupPanel()
    this.overlayPanel = new OverlayPanel()

    const pluginManagerComponent = new PluginManagerComponent(appManager, this.engine)
    const filePanel = new Filepanel(appManager, contentImport)
    this.statusBar = new StatusBar(filePanel, this.menuicons)
    this.topBar = new Topbar(filePanel, git, this.desktopClientMode)
    const landingPage = new LandingPage(appManager, this.menuicons, fileManager, filePanel, contentImport)
    this.settings = new SettingsTab(Registry.getInstance().get('config').api, editor)//, appManager)
    this.accountPlugin = new AccountPlugin()

    const bottomBarPanel = new BottomBarPanel()

    this.engine.register([this.menuicons, landingPage, this.hiddenPanel, this.sidePanel, this.statusBar, filePanel, pluginManagerComponent, this.settings, this.rightSidePanel, this.popupPanel, this.overlayPanel, bottomBarPanel])

    // CONTENT VIEWS & DEFAULT PLUGINS
    const openZeppelinProxy = new OpenZeppelinProxy(blockchain)
    const linkLibraries = new LinkLibraries(blockchain)
    const deployLibraries = new DeployLibraries(blockchain)
    const compileTab = new CompileTab(Registry.getInstance().get('config').api, Registry.getInstance().get('filemanager').api)
    const run = new RunTab(
      blockchain,
      this.engine
    )
    const analysis = new AnalysisTab()
    const debug = new DebuggerTab()
    const test = new TestTab(
      Registry.getInstance().get('filemanager').api,
      Registry.getInstance().get('offsettolinecolumnconverter').api,
      filePanel,
      compileTab,
      appManager,
      contentImport
    )

    this.authPlugin = new AuthPlugin()
    this.invitationManager = new InvitationManagerPlugin()
    this.membershipRequest = new MembershipRequestPlugin()
    this.betaCornerWidget = new BetaCornerWidgetPlugin()
    this.nudgePlugin = new NudgePlugin({ debug: false })
    this.helpPlugin = new HelpPlugin()
    const feedbackPlugin = new FeedbackPlugin()

    this.engine.register([
      compileTab as any,
      run,
      debug as any,
      analysis,
      test,
      filePanel.remixdHandle,
      filePanel.truffleHandle,
      linkLibraries,
      deployLibraries,
      openZeppelinProxy,
      this.authPlugin,
      this.invitationManager,
      this.membershipRequest,
      this.betaCornerWidget,
      this.nudgePlugin,
      this.helpPlugin,
      this.accountPlugin,
      feedbackPlugin
    ])
    this.engine.register([templateExplorerModal, skillExplorerModal, this.topBar])

    this.layout.panels = {
      tabs: { plugin: tabProxy, active: true },
      editor: { plugin: editor, active: true },
      main: { plugin: appPanel, active: false },
      bottomBar: { plugin: bottomBarPanel, active: true },
      terminal: { plugin: terminal, active: true, minimized: false }
    }
  }

  async activate() {
    // Boot the lifecycle state machine
    this.lifecycle.send({ type: 'BOOT' })

    try {
      this.engine.register(await this.appManager.registeredPlugins())
    } catch (e) {
      console.log("couldn't register iframe plugins", e.message)
    }

    // Signal that all plugins are registered with the engine
    this.lifecycle.send({ type: 'PLUGINS_REGISTERED' })

    // Activate lifecycle plugin first so other plugins can call it
    await this.appManager.activatePlugin(['lifecycle'])
    if (isElectron()) {
      await this.appManager.activatePlugin(['fs'])
    }
    await this.appManager.activatePlugin(['txRunner'])
    await this.appManager.activatePlugin(['layout'])
    await this.appManager.activatePlugin(['notification'])
    await this.appManager.activatePlugin(['editor'])
    await this.appManager.activatePlugin([
      'permissionhandler',
      'theme',
      'locale',
      'fileManager',
      'compilerMetadata',
      'compilerArtefacts',
      'network',
      'web3Provider',
      'offsetToLineColumnConverter',
      'pluginStateLogger',
      'matomo',
      'ai-dapp-generator',
      'indexedDbCache'
    ])

    await this.appManager.activatePlugin(['mainPanel', 'menuicons', 'tabs'])
    await this.appManager.activatePlugin(['topbar', 'templateexplorermodal', 'skillsexplorermodal'])
    await this.appManager.activatePlugin(['statusBar'])
    // await this.appManager.activatePlugin(['remix-template-explorer-modal'])
    await this.appManager.activatePlugin(['bottomBar'])
    await this.appManager.activatePlugin(['sidePanel']) // activating  host plugin separately
    await this.appManager.activatePlugin(['rightSidePanel'])
    await this.appManager.activatePlugin(['popupPanel'])
    await this.appManager.activatePlugin(['overlay'])
    await this.appManager.activatePlugin(['home'])
    await this.appManager.activatePlugin(['settings', 'config'])
    await this.appManager.activatePlugin([
      'hiddenPanel',
      'pluginManager',
      'codeParser',
      'codeFormatter',
      'fileDecorator',
      'transactionSimulator',
      'terminal',
      'blockchain',
      'fetchAndCompile',
      'contentImport',
      'gistHandler',
      'compilerloader',
      'remixAI',
      'remixaiassistant'
    ])

    await this.appManager.activatePlugin(['auth'])
    await this.appManager.activatePlugin(['invitationManager'])
    await this.appManager.activatePlugin(['membershipRequest'])
    await this.appManager.activatePlugin(['betaCornerWidget'])
    await this.appManager.activatePlugin(['nudgePlugin'])
    await this.appManager.activatePlugin(['account'])
    await this.appManager.activatePlugin(['notificationCenter'])
    await this.appManager.activatePlugin(['feedback'])
    await this.appManager.activatePlugin(['settings'])

    await this.appManager.activatePlugin(['storage', 'storageMonitor', 'search', 'compileAndRun', 'dgitApi', 'dgit', 'helpPlugin'])
    await this.appManager.activatePlugin(['solidity-script', 'remix-templates'])

    if (isElectron()) {
      await this.appManager.activatePlugin(['isogit', 'electronconfig', 'electronTemplates', 'xterm', 'ripgrep', 'appUpdater', 'slither', 'foundry', 'hardhat', 'circom', 'githubAuthHandler']) // 'remixAID'
    }

    // ─── Lifecycle event bridges ────────────────────────────────────
    // Forward plugin events into the lifecycle state machine so guards can react to them.

    this.appManager.on(
      'filePanel',
      'workspaceInitializationCompleted',
      async () => {
        this.lifecycle.send({ type: 'WORKSPACE_INITIALIZED' })
      }
    )

    // Workspace initialized guard: create DOM marker for E2E tests + register context menus
    this.lifecycle.when('WORKSPACE_INITIALIZED', async () => {
      const loadedElement = document.createElement('span')
      loadedElement.setAttribute('data-id', 'workspaceloaded')
      document.body.appendChild(loadedElement)
      await this.appManager.registerContextMenuItems()
    })

    await this.appManager.activatePlugin(['solidity-script'])
    await this.appManager.activatePlugin(['filePanel'])

    // Forward editor mount into lifecycle
    this.appManager.on('editor', 'editorMounted', () => {
      this.lifecycle.send({ type: 'EDITOR_MOUNTED' })
    })

    // Editor mounted guard: preload prettifier
    this.lifecycle.when('EDITOR_MOUNTED', () => {
      this.appManager.call('codeFormatter', 'preloadPrettier').catch((e) => {
        console.log('Failed to preload code formatter:', e)
      })
    })

    // App loaded guard: fires when both editor is mounted AND workspace is initialized
    this.lifecycle.when(all('EDITOR_MOUNTED', 'WORKSPACE_INITIALIZED'), () => {
      this.lifecycle.send({ type: 'APP_LOADED' })
      const loadedElement = document.createElement('span')
      loadedElement.setAttribute('data-id', 'apploaded')
      document.body.appendChild(loadedElement)

      // Fire lifecycle event into nudge engine so context-aware rules can activate
      this.appManager.call('nudgePlugin', 'fire', 'lifecycle:APP_LOADED').catch(() => {})
    })

    // Editor mounted: activate workspace plugins, then signal readiness
    this.lifecycle.when('EDITOR_MOUNTED', () => {
      if (Array.isArray(this.workspace)) {
        this.appManager
          .activatePlugin(this.workspace)
          .then(() => {
            this.lifecycle.send({ type: 'WORKSPACE_PLUGINS_ACTIVATED' })
          })
          .catch((e) => {
            console.error(e)
            // Signal anyway so query param handling isn't permanently blocked
            this.lifecycle.send({ type: 'WORKSPACE_PLUGINS_ACTIVATED' })
          })
      } else {
        this.lifecycle.send({ type: 'WORKSPACE_PLUGINS_ACTIVATED' })
      }
    })

    // Query params & UI restoration: wait for workspace ready + plugins activated
    // This guarantees the filesystem, file tree, and workspace plugins are all
    // initialized before we run any query-param-driven actions.
    this.lifecycle.when(all('WORKSPACE_PLUGINS_ACTIVATED', 'WORKSPACE_INITIALIZED'), async () => {
      // Restore pinned plugin
      const lastPinned = localStorage.getItem('pinnedPlugin')
      if (lastPinned) {
        try {
          this.appManager.call('sidePanel', 'pinView', JSON.parse(lastPinned))
        } catch (e) {
          console.error('Failed to restore pinned plugin:', e)
        }
      }

      try {
        if (this.params.deactivate) {
          await this.appManager.deactivatePlugin(this.params.deactivate.split(','))
        }
      } catch (e) {
        console.log(e)
      }

      if (this.params.code && (!this.params.activate || this.params.activate.split(',').includes('solidity'))) {
        this.menuicons.select('solidity')
      } else {
        if (this.appManager.pluginLoader.current === 'queryParams' && this.workspace.length > 0) {
          this.menuicons.select(this.workspace[this.workspace.length - 1])
        } else {
          this.appManager.call('tabs', 'focus', 'home')
        }
      }

      if (this.params.call) {
        const callDetails = this.params.call.split('//')
        if (callDetails.length > 1) {
          this.appManager.call('notification', 'toast', `initiating ${callDetails[0]} and calling "${callDetails[1]}" ...`)
          this.track({ category: 'App', action: 'queryParams-calls', name: this.params.call, isClick: false })
          //@ts-ignore
          await this.appManager.call(...callDetails).catch(console.error)
        }
      }

      if (this.params.calls) {
        const calls = this.params.calls.split('///')
        for (const call of calls) {
          this.track({ category: 'App', action: 'queryParams-calls', name: call, isClick: false })
          const callDetails = call.split('//')
          if (callDetails.length > 1) {
            this.appManager.call('notification', 'toast', `initiating ${callDetails[0]} and calling "${callDetails[1]}" ...`)
            try {
              //@ts-ignore
              await this.appManager.call(...callDetails)
            } catch (e) {
              console.error(e)
            }
          }
        }
      }
    })

    this.appManager.on('rightSidePanel', 'pinnedPlugin', (pluginProfile) => {
      localStorage.setItem('pinnedPlugin', JSON.stringify(pluginProfile))
    })

    this.appManager.on('rightSidePanel', 'unPinnedPlugin', () => {
      localStorage.setItem('pinnedPlugin', '')
    })

    // activate solidity plugin
    this.appManager.activatePlugin(['solidity', 'udapp', 'deploy-libraries', 'link-libraries', 'openzeppelin-proxy', 'scriptRunnerBridge', 'resolutionIndex'])

    if (isElectron()) {
      this.appManager.activatePlugin(['desktopHost'])
    }
    // await this.appManager.activatePlugin(['compilerArtefacts'])
    await this.appManager.activatePlugin(['udappEnv'])
    await this.appManager.activatePlugin(['udappDeploy'])
    await this.appManager.activatePlugin(['udappDeployedContracts'])
    await this.appManager.activatePlugin(['udappTransactions'])
  }
}

export default AppComponent
