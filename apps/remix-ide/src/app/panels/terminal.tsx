/* global Node, requestAnimationFrame */   // eslint-disable-line
import React from 'react' // eslint-disable-line
import { RemixUiTerminal, RemixUITerminalWrapper } from '@remix-ui/terminal' // eslint-disable-line
import { Plugin } from '@remixproject/engine'
import * as packageJson from '../../../../../package.json'
import { Registry } from '@remix-project/remix-lib'
import { PluginViewWrapper } from '@remix-ui/helper'
import vm from 'vm'
import EventManager from '../../lib/events'

import { CompilerImports } from '@remix-project/core-plugin' // eslint-disable-line
import { RemixUiXterminals } from '@remix-ui/xterm'
import { trackMatomoEvent } from '@remix-api'

const KONSOLES = []

function register(api) { KONSOLES.push(api) }

const profile = {
  displayName: 'Terminal',
  name: 'terminal',
  methods: ['log', 'logHtml', 'togglePanel', 'isPanelHidden', 'maximizePanel'],
  events: [],
  description: 'Remix IDE terminal',
  version: packageJson.version
}

export default class Terminal extends Plugin {
  fileImport: CompilerImports
  event: any
  globalRegistry: Registry
  element: HTMLDivElement
  eventsDecoder: any
  txListener: any
  _deps: { fileManager: any; editor: any; compilersArtefacts: any; offsetToLineColumnConverter: any }
  commandHelp: { 'remix.loadgist(id)': string; 'remix.loadurl(url)': string; 'remix.execute(filepath)': string; 'remix.exeCurrent()': string; 'remix.help()': string }
  blockchain: any
  vm: typeof vm
  _api: any
  _opts: any
  config: any
  version: string
  data: {
    lineLength: any // ????
    session: any[]; activeFilters: { commands: any; input: string }; filterFns: any
  }
  _view: { el: any; bar: any; input: any; term: any; journal: any; cli: any }
  _components: any
  _commands: any
  commands: any
  _JOURNAL: any[]
  _jobs: any[]
  _INDEX: any
  _shell: any
  dispatch: any
  terminalApi: any
  isHidden: boolean
  isMaximized: boolean
  constructor(opts, api) {
    super(profile)
    this.isMaximized = false
    this.fileImport = new CompilerImports()
    this.event = new EventManager()
    this.globalRegistry = Registry.getInstance()
    this.element = document.createElement('div')
    this.element.setAttribute('class', 'panel')
    this.element.setAttribute('id', 'terminal-view')
    this.element.setAttribute('data-id', 'terminalContainer-view')
    this.eventsDecoder = this.globalRegistry.get('eventsDecoder').api
    this.txListener = this.globalRegistry.get('txlistener').api
    this._deps = {
      fileManager: this.globalRegistry.get('filemanager').api,
      editor: this.globalRegistry.get('editor').api,
      compilersArtefacts: this.globalRegistry.get('compilersartefacts').api,
      offsetToLineColumnConverter: this.globalRegistry.get('offsettolinecolumnconverter').api
    }
    this.commandHelp = {
      'remix.loadgist(id)': 'Load a gist in the file explorer.',
      'remix.loadurl(url)': 'Load the given url in the file explorer. The url can be of type github, swarm, ipfs or raw http',
      'remix.execute(filepath)': 'Run the script specified by file path. If filepath is empty, script currently displayed in the editor is executed.',
      'remix.exeCurrent()': 'Run the script currently displayed in the editor',
      'remix.help()': 'Display this help message'
    }
    this.blockchain = opts.blockchain
    this.vm = vm
    this._api = api
    this._opts = opts
    this.config = this.globalRegistry.get('config').api
    this.version = packageJson.version
    this.data = {
      lineLength: opts.lineLength || 80, // ????
      session: [],
      activeFilters: { commands: {}, input: '' },
      filterFns: {}
    }
    this._view = { el: null, bar: null, input: null, term: null, journal: null, cli: null }
    this._components = {}
    this._commands = {}
    this.commands = {}
    this._JOURNAL = []
    this._jobs = []
    this._INDEX = {}
    this._INDEX.all = []
    this._INDEX.allMain = []
    this._INDEX.commands = {}
    this._INDEX.commandsMain = {}
    if (opts.shell) this._shell = opts.shell // ???
    register(this)
    this.event.register('debuggingRequested', async (hash: any) => {
      // TODO should probably be in the run module
      if (!await this._opts.appManager.isActive('debugger')) await this._opts.appManager.activatePlugin('debugger')
      this.call('menuicons', 'select', 'debugger')
      this.call('debugger', 'debug', hash)
    })
    this.dispatch = null

  }

  onActivation() {
    this.renderComponent()

    // Listen for file changes - auto-restore terminal panel if maximized when main panel is used
    this.on('fileManager', 'currentFileChanged', () => {
      if (this.isMaximized) {
        this.maximizePanel() // This will toggle and restore the panel
      }
    })

    // Listen for tab/app switches - auto-restore terminal panel if maximized
    this.on('tabs', 'switchApp', () => {
      if (this.isMaximized) {
        this.maximizePanel() // This will toggle and restore the panel
      }
    })

    // Initialize isHidden state from panelStates in localStorage
    const panelStatesStr = window.localStorage.getItem('panelStates')
    const panelStates = panelStatesStr ? JSON.parse(panelStatesStr) : {}

    if (panelStates.bottomPanel) {
      this.isHidden = panelStates.bottomPanel.isHidden || false
      // Apply d-none class to hide the terminal on reload if it was hidden
      if (this.isHidden) {
        const terminalPanel = document.querySelector('.terminal-wrap')
        terminalPanel?.classList.add('d-none')
        trackMatomoEvent(this, { category: 'topbar', action: 'terminalPanel', name: 'hiddenOnLoad', isClick: false })
      }
    } else {
      // Initialize with default state if not found
      this.isHidden = true
      panelStates.bottomPanel = {
        isHidden: this.isHidden,
        pluginProfile: this.profile
      }
      window.localStorage.setItem('panelStates', JSON.stringify(panelStates))
      // Apply d-none class to hide the terminal on initial load
      const terminalPanel = document.querySelector('.terminal-wrap')
      terminalPanel?.classList.add('d-none')
    }
  }

  onDeactivation() {
    this.off('scriptRunnerBridge', 'log')
    this.off('scriptRunnerBridge', 'info')
    this.off('scriptRunnerBridge', 'warn')
    this.off('scriptRunnerBridge', 'error')
  }

  logHtml(html) {
    // Unhide terminal panel if it's hidden when a log is added
    if (this.isHidden) {
      this.showPanel()
    }
    this.terminalApi.logHtml(html)
  }

  log(message, type) {
    // Unhide terminal panel if it's hidden when a log is added
    if (this.isHidden) {
      this.showPanel()
    }
    this.terminalApi.log(message, type)
  }

  showPanel() {
    const terminalPanel = document.querySelector('.terminal-wrap')
    this.isHidden = false
    terminalPanel?.classList.remove('d-none')
    trackMatomoEvent(this, { category: 'topbar', action: 'terminalPanel', name: 'shownOnLog', isClick: false })
    this.emit('terminalPanelShown')

    // Persist the state
    const panelStates = JSON.parse(window.localStorage.getItem('panelStates') || '{}')
    panelStates.bottomPanel = {
      isHidden: this.isHidden,
      pluginProfile: this.profile
    }
    window.localStorage.setItem('panelStates', JSON.stringify(panelStates))
  }

  togglePanel() {
    const terminalPanel = document.querySelector('.terminal-wrap')
    if (this.isHidden) {
      this.isHidden = false
      terminalPanel?.classList.remove('d-none')
      trackMatomoEvent(this, { category: 'topbar', action: 'terminalPanel', name: 'shownOnToggleIconClick', isClick: false })
      this.emit('terminalPanelShown')
    } else {
      this.isHidden = true

      // If terminal was hidden when maximized, restore the main panel
      if (this.isMaximized) {
        const mainView = document.querySelector('.mainview')
        if (mainView) {
          const wraps = mainView.querySelectorAll('[class*="-wrap"]')
          wraps.forEach((wrap: HTMLElement) => {
            if (!wrap.classList.contains('terminal-wrap')) {
              wrap.classList.remove('d-none')
            }
          })
        }
        terminalPanel?.classList.remove('maximized')
        this.isMaximized = false
        this.renderComponent()
      }

      terminalPanel?.classList.add('d-none')
      trackMatomoEvent(this, { category: 'topbar', action: 'terminalPanel', name: 'hiddenOnToggleIconClick', isClick: false })
      this.emit('terminalPanelHidden')
    }
    // Persist the hidden state and plugin profile to panelStates
    const panelStates = JSON.parse(window.localStorage.getItem('panelStates') || '{}')
    panelStates.bottomPanel = {
      isHidden: this.isHidden,
      pluginProfile: this.profile
    }
    window.localStorage.setItem('panelStates', JSON.stringify(panelStates))
  }

  isPanelHidden() {
    return this.isHidden
  }

  async maximizePanel() {
    if (!this.isMaximized) {
      // Hide all main panel content except terminal
      const mainView = document.querySelector('.mainview')
      if (mainView) {
        // Find all child elements with -wrap class except terminal-wrap
        const wraps = mainView.querySelectorAll('[class*="-wrap"]')
        wraps.forEach((wrap: HTMLElement) => {
          if (!wrap.classList.contains('terminal-wrap')) {
            wrap.classList.add('d-none')
          } else {
            // Add maximized class to terminal-wrap
            wrap.classList.add('maximized')
          }
        })
      }

      this.isMaximized = true
      trackMatomoEvent(this, { category: 'topbar', action: 'terminalPanel', name: 'maximized', isClick: false })
      this.emit('terminalPanelMaximized')
    } else {
      // Show all main panel content
      const mainView = document.querySelector('.mainview')
      if (mainView) {
        // Find all child elements with -wrap class and show them
        const wraps = mainView.querySelectorAll('[class*="-wrap"]')
        wraps.forEach((wrap: HTMLElement) => {
          wrap.classList.remove('d-none')
          // Remove maximized class from terminal-wrap
          if (wrap.classList.contains('terminal-wrap')) {
            wrap.classList.remove('maximized')
          }
        })
      }

      this.isMaximized = false
      trackMatomoEvent(this, { category: 'topbar', action: 'terminalPanel', name: 'restored', isClick: false })
      this.emit('terminalPanelRestored')
    }
    this.renderComponent()
  }

  setDispatch(dispatch) {
    this.dispatch = dispatch
  }

  render() {
    return <div id='terminal-view' className='panel' data-id='terminalContainer-view'><PluginViewWrapper plugin={this} /></div>
  }

  updateComponent(state) {
    return (
      <>
        <RemixUITerminalWrapper
          plugin={state.plugin}
          onReady={state.onReady}
          visible={true}
          isMaximized={this.isMaximized}
          maximizePanel={this.maximizePanel.bind(this)}
        />
      </>)
  }

  renderComponent() {
    const onReady = (api) => { this.terminalApi = api }
    this.dispatch({
      plugin: this,
      onReady: onReady
    })
  }

  scroll2bottom() {
    setTimeout(function () {
      // do nothing.
    }, 0)
  }
}

