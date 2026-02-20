import { Plugin } from '@remixproject/engine'
import { Profile } from '@remixproject/plugin-utils'
import { EventEmitter } from 'events'
import { QueryParams } from '@remix-project/remix-lib'

const profile: Profile = {
  name: 'layout',
  description: 'layout',
  methods: ['minimize', 'minimizeSidePanel', 'maximiseSidePanel', 'resetSidePanel', 'maximizeTerminal', 'maximiseRightSidePanel', 'resetRightSidePanel']
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
  panels: panels
  enhanced: { [key: string]: boolean }
  maximized: { [key: string]: {
    maximized: boolean
    coeff?: number
  } }
  constructor () {
    super(profile)
    this.maximized = {
      // 'remixaiassistant': true
      'LearnEth': {
        maximized: true,
        coeff: undefined
      },
    }
    this.enhanced = {
      'dgit': true,
      'remixaiassistant': true,
      'quick-dapp-v2': true
    }
    this.event = new EventEmitter()
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
    this.on('tabs', 'switchApp', (name: string) => {
      this.call('mainPanel', 'showContent', name)
      this.panels.editor.active = false
      this.panels.main.active = true
      this.event.emit('change', null)
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
    this.on('sidePanel', 'focusChanged', async (name) => {
      const current = await this.call('sidePanel', 'currentFocus')
      if (this.enhanced[current]) {
        this.event.emit('enhancesidepanel')
      }

      if (this.maximized[current] && this.maximized[current].maximized) {
        this.event.emit('maximisesidepanel', this.maximized[current].coeff)
      }

      if (!this.enhanced[current] && (!this.maximized[current] || !this.maximized[current].maximized)) {
        this.event.emit('resetsidepanel')
      }
    })

    this.on('rightSidePanel', 'pinnedPlugin', async (name) => {
      const current = await this.call('rightSidePanel', 'currentFocus')
      if (this.enhanced[current]) {
        this.event.emit('enhanceRightSidePanel')
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
      if (this.enhanced[current]) {
        this.event.emit('enhanceRightSidePanel')
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
}
