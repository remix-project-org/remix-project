import { Plugin } from '@remixproject/engine'
import { Profile } from '@remixproject/plugin-utils'
import { EventEmitter } from 'events'
import { QueryParams } from '@remix-project/remix-lib'

const profile: Profile = {
  name: 'layout',
  description: 'layout',
  methods: ['minimize', 'minimizeSidePanel', 'maximiseSidePanel', 'resetSidePanel', 'maximizeTerminal', 'maximiseRightSidePanel', 'resetRightSidePanel', 'showAIChatMaximized', 'restoreFromAIChatMaximized']
}

interface panelState {
  active: boolean
  plugin: Plugin
  minimized?: boolean
}
interface panels {
  tabs: panelState
  editor: panelState
  main: panelState
  bottomBar: panelState
  terminal: panelState
}

export type PanelConfiguration = {
  minimizeterminal: boolean,
  minimizesidepanel: boolean,
  embed: boolean
}

export class Layout extends Plugin {
  event: any
  // @ts-ignore
  panels: panels
  enhanced: { [key: string]: boolean | { coeff?: number } }
  preAIChatMaximizedState: { editorActive: boolean, mainActive: boolean, mainFocus: string | null } | null = null
  maximized: { [key: string]: {
    maximized: boolean
    coeff?: number
  } }
  constructor () {
    super(profile)
    this.maximized = {
      'remixaiassistant': {
        maximized: true,
        coeff: undefined
      },
      'LearnEth': {
        maximized: true,
        coeff: undefined
      },
    }
    this.enhanced = {
      'dgit': true,
      'remixaiassistant': true,
      'quick-dapp-v2': true,
      'udapp': true
    }
    this.event = new EventEmitter()
  }

  private isEnhancedPanel(name: string) {
    return Boolean(this.enhanced[name])
  }

  private getEnhancedCoeff(name: string, defaultCoeff = 0.25) {
    const config = this.enhanced[name]
    if (!config) return undefined
    if (typeof config === 'object' && typeof config.coeff === 'number') return config.coeff
    return defaultCoeff
  }

  async onActivation (): Promise<void> {
    this.on('fileManager', 'currentFileChanged', () => {
      this.panels.editor.active = true
      this.panels.main.active = false
      this.event.emit('change', null)
    })
    this.on('fileManager', 'openDiff', () => {
      this.panels.editor.active = true
      this.panels.main.active = false
      this.event.emit('change', null)
    })
    this.on('tabs', 'openFile', () => {
      this.panels.editor.active = true
      this.panels.main.active = false
      this.event.emit('change', null)
    })
    this.on('tabs', 'switchApp', async (name: string) => {
      // 'switchApp' fires for every tab switch, including file tabs, but showContent
      // only knows about plugins rendered in mainPanel (e.g. quick-dapp). Skip anything else.
      const targetProfile = await this.call('manager', 'getProfile', name)
      if (targetProfile && targetProfile.location === 'mainPanel') {
        this.call('mainPanel', 'showContent', name)
        this.panels.editor.active = false
        this.panels.main.active = true
        this.event.emit('change', null)
      }
    })
    this.on('tabs', 'closeApp', (name: string) => {
      this.panels.editor.active = true
      this.panels.main.active = false
      this.event.emit('change', null)
    })
    this.on('tabs', 'openDiff', () => {
      this.panels.editor.active = true
      this.panels.main.active = false
      this.event.emit('change', null)
    })
    this.on('manager', 'activate', (profile: Profile) => {
      switch (profile.name) {
      case 'filePanel':
        this.call('menuicons', 'select', 'filePanel')
        break
      }
    })
    this.on('sidePanel', 'focusChanged', async (name: any) => {
      const current = await this.call('sidePanel', 'currentFocus')
      const isMaxed = await this.call('rightSidePanel', 'isRightSidePanelMaximized')
      if (isMaxed) {
        this.enhanced[current] = false
      } else {
        if (this.isEnhancedPanel(current)) {
          this.event.emit('enhancesidepanel', this.getEnhancedCoeff(current))
        }
      }

      if (this.maximized[current] && this.maximized[current].maximized) {
        this.event.emit('maximisesidepanel', this.maximized[current].coeff)
      }

      if (!this.enhanced[current] && (!this.maximized[current] || !this.maximized[current].maximized)) {
        this.event.emit('resetsidepanel')
      }
    })

    this.on('rightSidePanel', 'pinnedPlugin', async (name: any) => {
      const current = await this.call('rightSidePanel', 'currentFocus')
      if (this.isEnhancedPanel(current)) {
        this.event.emit('enhanceRightSidePanel', this.getEnhancedCoeff(current))
      }

      if (this.maximized[current] && this.maximized[current].maximized) {
        this.event.emit('maximiseRightSidePanel', this.maximized[current].coeff)
      }

      if (!this.enhanced[current] && (!this.maximized[current] || !this.maximized[current].maximized)) {
        this.event.emit('resetRightSidePanel')
      }
    })

    this.on('rightSidePanel', 'rightSidePanelShown', async () => {
      const current = await this.call('rightSidePanel', 'currentFocus')
      if (this.isEnhancedPanel(current)) {
        this.event.emit('enhanceRightSidePanel', this.getEnhancedCoeff(current))
      }

      if (this.maximized[current] && this.maximized[current].maximized) {
        this.event.emit('maximiseRightSidePanel', this.maximized[current].coeff)
      }

      if (!this.enhanced[current] && (!this.maximized[current] || !this.maximized[current].maximized)) {
        this.event.emit('resetRightSidePanel')
      }
    })

    document.addEventListener('keypress', e => {
      if (e.shiftKey && e.ctrlKey) {
        if (e.code === 'KeyF') {
          // Ctrl+Shift+F
          this.call('menuicons', 'select', 'filePanel')
        } else if (e.code === 'KeyA') {
          // Ctrl+Shift+A
          this.call('menuicons', 'select', 'pluginManager')
        }
        e.preventDefault()
      }
    })
    const queryParams = new QueryParams()
    const params = queryParams.get() as PanelConfiguration
    if (params.minimizeterminal || params.embed) {
      this.panels.terminal.minimized = true
      this.event.emit('change', this.panels)
      this.emit('change', this.panels)
    }
    if (params.minimizesidepanel || params.embed) {
      this.event.emit('minimizesidepanel')
    }
  }

  minimize (name: string, minimized:boolean): void {
    // @ts-ignore
    this.panels[name].minimized = minimized
    this.event.emit('change', this.panels)
    this.emit('change', this.panels)
  }

  async minimizeSidePanel () {
    this.event.emit('minimizesidepanel')
  }

  async maximiseSidePanel (coeff?: number) {
    const current = await this.call('sidePanel', 'currentFocus')
    this.maximized[current] = {
      maximized: true,
      coeff
    }
    this.event.emit('maximisesidepanel', coeff)
  }

  async maximiseRightSidePanel (coeff?: number) {
    const current = await this.call('rightSidePanel', 'currentFocus')
    this.maximized[current] = {
      maximized: true,
      coeff
    }
    this.event.emit('maximiseRightSidePanel', coeff)
  }

  async maximizeTerminal() {
    this.panels.terminal.minimized = false
    this.event.emit('change', this.panels)
    this.emit('change', this.panels)
  }

  async resetSidePanel () {
    const current = await this.call('sidePanel', 'currentFocus')
    this.enhanced[current] = false
    this.event.emit('resetsidepanel')
  }

  async resetRightSidePanel () {
    const current = await this.call('rightSidePanel', 'currentFocus')
    this.enhanced[current] = false
    this.event.emit('resetRightSidePanel')
  }

  /**
   * Swap the center/main panel over to a `mainPanel`-hosted view and hide the
   * file-tabs bar, so the takeover doesn't read as "just another tab". Distinct
   * from the generic `tabs/switchApp` handling above (which never touches
   * `panels.tabs`) because every other `location: 'mainPanel'` plugin (e.g.
   * quick-dapp-v2) must keep showing the tab bar as usual.
   */
  async showAIChatMaximized (hostName: string) {
    const mainPanel = this.panels.main.plugin as any
    this.preAIChatMaximizedState = {
      editorActive: this.panels.editor.active,
      mainActive: this.panels.main.active,
      mainFocus: mainPanel.currentFocus()
    }
    await this.call('mainPanel', 'showContent', hostName)
    this.panels.editor.active = false
    this.panels.tabs.active = false
    this.panels.main.active = true
    this.event.emit('change', null)
  }

  // Puts the center panel back the way it was before maximizing (e.g. the Home
  // tab, which is itself a mainPanel view), falling back to the editor.
  async restoreFromAIChatMaximized () {
    const prev = this.preAIChatMaximizedState
    this.preAIChatMaximizedState = null
    // If something already switched to the editor meanwhile (opening a file
    // triggers this restore), keep the editor rather than jumping back.
    const restoreMain = !this.panels.editor.active && prev && prev.mainActive && prev.mainFocus
    if (restoreMain) await this.call('mainPanel', 'showContent', prev.mainFocus)
    this.panels.editor.active = !restoreMain
    this.panels.main.active = !!restoreMain
    this.panels.tabs.active = true
    this.event.emit('change', null)
  }
}
