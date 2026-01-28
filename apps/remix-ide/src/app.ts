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
import { SolidityUmlGen } from './app/plugins/solidity-umlgen'
import { VyperCompilationDetailsPlugin } from './app/plugins/vyper-compilation-details'
import { ContractFlattener } from './app/plugins/contractFlattener'

import { WalkthroughService } from './walkthroughService'

import { OffsetToLineColumnConverter, CompilerMetadata, CompilerArtefacts, FetchAndCompile, CompilerImports, GistHandler, AmpPlugin, ChartJsPlugin } from '@remix-project/core-plugin'

import { Registry } from '@remix-project/remix-lib'
import { ConfigPlugin } from './app/plugins/config'
import { StoragePlugin } from './app/plugins/storage'
import { StorageMonitorPlugin } from './app/plugins/storage-monitor'
import { Layout } from './app/panels/layout'
import { NotificationPlugin } from './app/plugins/notification'
import { Blockchain } from './blockchain/blockchain'
import { MergeVMProvider, LondonVMProvider, BerlinVMProvider, ShanghaiVMProvider, CancunVMProvider, PectraVMProvider, FusakaVMProvider } from './app/providers/vm-provider'
import { MainnetForkVMProvider } from './app/providers/mainnet-vm-fork-provider'
import { SepoliaForkVMProvider } from './app/providers/sepolia-vm-fork-provider'
import { CustomForkVMProvider } from './app/providers/custom-vm-fork-provider'
import { HardhatProvider } from './app/providers/hardhat-provider'
import { GanacheProvider } from './app/providers/ganache-provider'
import { FoundryProvider } from './app/providers/foundry-provider'
import { ExternalHttpProvider } from './app/providers/external-http-provider'
import { EnvironmentExplorer } from './app/providers/environment-explorer'
import { FileDecorator } from './app/plugins/file-decorator'
import { TransactionSimulator } from './app/plugins/transaction-simulator'
import { CodeFormat } from './app/plugins/code-format'
import { CompilationDetailsPlugin } from './app/plugins/compile-details'
import { AuthPlugin } from './app/plugins/auth-plugin'
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
import { GitPlugin } from './app/plugins/git'
import { Matomo } from './app/plugins/matomo'
import { DesktopClient } from './app/plugins/desktop-client'
import { DesktopHost } from './app/plugins/electron/desktopHostPlugin'
import { WalletConnect } from './app/plugins/walletconnect'
import { AIDappGenerator } from './app/plugins/ai-dapp-generator'

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
import { Plugin } from '@remixproject/engine'
import BottomBarPanel from './app/components/bottom-bar-panel'
import { TemplateExplorerModalPlugin } from './app/plugins/template-explorer-modal'

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
  statusBar: StatusBar
  topBar: Topbar
  templateExplorerModal: TemplateExplorerModalPlugin
  settings: SettingsTab
  authPlugin: AuthPlugin
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
    this.queryParams = new QueryParams()
    this.params = this.queryParams.get()
    this.desktopClientMode = this.params && this.params.activate && this.params.activate.split(',').includes('desktopClient')
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
    this._components.filesProviders.workspace = new WorkspaceFileProvider()
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

    this.walkthroughService = new WalkthroughService(appManager)

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
    const remixAiAssistant = new RemixAIAssistant()

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
    makeUdapp(blockchain, compilersArtefacts, (domEl) => terminal.logHtml(domEl))
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

    const configPlugin = new ConfigPlugin()
    this.layout = new Layout()

    const permissionHandler = new PermissionHandlerPlugin()
    // ----------------- run script after each compilation results -----------
    const pluginStateLogger = new PluginStateLogger()

    const templateSelection = new TemplatesSelectionPlugin()

    const templateExplorerModal = this.templateExplorerModal

    const walletConnect = new WalletConnect()

    this.engine.register([
      permissionHandler,
      this.layout,
      this.notification,
      this.gistHandler,
      configPlugin,
      blockchain,
      contentImport,
      resolutionIndex,
      this.themeModule,
      this.localeModule,
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
      remixAiAssistant,
      walletConnect,
      amp,
      // vega,
      chartjs
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

    const pluginManagerComponent = new PluginManagerComponent(appManager, this.engine)
    const filePanel = new Filepanel(appManager, contentImport)
    this.statusBar = new StatusBar(filePanel, this.menuicons)
    this.topBar = new Topbar(filePanel, git, this.desktopClientMode)
    const landingPage = new LandingPage(appManager, this.menuicons, fileManager, filePanel, contentImport)
    this.settings = new SettingsTab(Registry.getInstance().get('config').api, editor)//, appManager)

    const bottomBarPanel = new BottomBarPanel()

    this.engine.register([this.menuicons, landingPage, this.hiddenPanel, this.sidePanel, this.statusBar, filePanel, pluginManagerComponent, this.settings, this.rightSidePanel, this.popupPanel, bottomBarPanel])

    // CONTENT VIEWS & DEFAULT PLUGINS
    const openZeppelinProxy = new OpenZeppelinProxy(blockchain)
    const linkLibraries = new LinkLibraries(blockchain)
    const deployLibraries = new DeployLibraries(blockchain)
    const compileTab = new CompileTab(Registry.getInstance().get('config').api, Registry.getInstance().get('filemanager').api)
    const run = new RunTab(
      blockchain,
      Registry.getInstance().get('config').api,
      Registry.getInstance().get('filemanager').api,
      Registry.getInstance().get('editor').api,
      filePanel,
      Registry.getInstance().get('compilersartefacts').api,
      networkModule,
      Registry.getInstance().get('fileproviders/browser').api,
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

    this.engine.register([
      compileTab,
      run,
      debug,
      analysis,
      test,
      filePanel.remixdHandle,
      filePanel.truffleHandle,
      linkLibraries,
      deployLibraries,
      openZeppelinProxy,
      run.recorder,
      this.authPlugin
    ])
    this.engine.register([templateExplorerModal, this.topBar])

    this.layout.panels = {
      tabs: { plugin: tabProxy, active: true },
      editor: { plugin: editor, active: true },
      main: { plugin: appPanel, active: false },
      bottomBar: { plugin: bottomBarPanel, active: true },
      terminal: { plugin: terminal, active: true, minimized: false }
    }
  }

  async activate() {

    try {
      this.engine.register(await this.appManager.registeredPlugins())
    } catch (e) {
      console.log("couldn't register iframe plugins", e.message)
    }
    if (isElectron()) {
      await this.appManager.activatePlugin(['fs'])
    }
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
      'ai-dapp-generator'
    ])

    await this.appManager.activatePlugin(['mainPanel', 'menuicons', 'tabs'])
    await this.appManager.activatePlugin(['topbar', 'templateexplorermodal'])
    await this.appManager.activatePlugin(['statusBar'])
    // await this.appManager.activatePlugin(['remix-template-explorer-modal'])
    await this.appManager.activatePlugin(['bottomBar'])
    await this.appManager.activatePlugin(['sidePanel']) // activating  host plugin separately
    await this.appManager.activatePlugin(['rightSidePanel'])
    await this.appManager.activatePlugin(['popupPanel'])
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
    await this.appManager.activatePlugin(['settings'])

    await this.appManager.activatePlugin(['walkthrough', 'storage', 'storageMonitor', 'search', 'compileAndRun', 'recorder', 'dgitApi', 'dgit'])
    await this.appManager.activatePlugin(['solidity-script', 'remix-templates'])

    if (isElectron()) {
      await this.appManager.activatePlugin(['isogit', 'electronconfig', 'electronTemplates', 'xterm', 'ripgrep', 'appUpdater', 'slither', 'foundry', 'hardhat', 'circom', 'githubAuthHandler']) // 'remixAID'
    }

    this.appManager.on(
      'filePanel',
      'workspaceInitializationCompleted',
      async () => {
        // for e2e tests
        const loadedElement = document.createElement('span')
        loadedElement.setAttribute('data-id', 'workspaceloaded')
        document.body.appendChild(loadedElement)
        await this.appManager.registerContextMenuItems()
      }
    )
    await this.appManager.activatePlugin(['solidity-script'])
    await this.appManager.activatePlugin(['filePanel'])

    // Set workspace after initial activation
    this.appManager.on('editor', 'editorMounted', () => {
      if (Array.isArray(this.workspace)) {
        this.appManager
          .activatePlugin(this.workspace)
          .then(async () => {
            try {
              if (this.params.deactivate) {
                await this.appManager.deactivatePlugin(this.params.deactivate.split(','))
              }
            } catch (e) {
              console.log(e)
            }
            if (this.params.code && (!this.params.activate || this.params.activate.split(',').includes('solidity'))) {
              // if code is given in url we focus on solidity plugin
              this.menuicons.select('solidity')
            } else {
              // If plugins are loaded from the URL params, we focus on the last one.
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
                // @todo(remove the timeout when activatePlugin is on 0.3.0)
                this.track({ category: 'App', action: 'queryParams-calls', name: this.params.call, isClick: false })
                //@ts-ignore
                await this.appManager.call(...callDetails).catch(console.error)
              }
            }

            if (this.params.calls) {
              const calls = this.params.calls.split('///')

              // call all functions in the list, one after the other
              for (const call of calls) {
                this.track({ category: 'App', action: 'queryParams-calls', name: call, isClick: false })
                const callDetails = call.split('//')
                if (callDetails.length > 1) {
                  this.appManager.call('notification', 'toast', `initiating ${callDetails[0]} and calling "${callDetails[1]}" ...`)

                  // @todo(remove the timeout when activatePlugin is on 0.3.0)
                  try {
                    //@ts-ignore
                    await this.appManager.call(...callDetails)
                  } catch (e) {
                    console.error(e)
                  }
                }
              }
            }
          }).then(async () => {
            const lastPinned = localStorage.getItem('pinnedPlugin')

            if (lastPinned) {
              this.appManager.call('sidePanel', 'pinView', JSON.parse(lastPinned))
            }
          })
          .catch((e) => {
            console.error(e)
          })
      }
      const loadedElement = document.createElement('span')
      loadedElement.setAttribute('data-id', 'apploaded')
      document.body.appendChild(loadedElement)
    })

    this.appManager.on('rightSidePanel', 'pinnedPlugin', (pluginProfile) => {
      localStorage.setItem('pinnedPlugin', JSON.stringify(pluginProfile))
    })

    this.appManager.on('rightSidePanel', 'unPinnedPlugin', () => {
      localStorage.setItem('pinnedPlugin', '')
    })

    // activate solidity plugin
    this.appManager.activatePlugin(['solidity', 'udapp', 'deploy-libraries', 'link-libraries', 'openzeppelin-proxy', 'scriptRunnerBridge', 'resolutionIndex'])

    if (isElectron()){
      this.appManager.activatePlugin(['desktopHost'])
    }
  }
}

export default AppComponent
