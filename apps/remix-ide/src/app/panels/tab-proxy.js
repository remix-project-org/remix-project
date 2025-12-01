import React from 'react' // eslint-disable-line
import { Plugin } from '@remixproject/engine'
import { TabsUI } from '@remix-ui/tabs'
import { PluginViewWrapper, getPathIcon } from '@remix-ui/helper'
const EventEmitter = require('events')

const profile = {
  name: 'tabs',
  methods: ['focus'],
  kind: 'other'
}

export default class TabProxy extends Plugin {
  constructor (fileManager, editor) {
    super(profile)
    this.event = new EventEmitter()
    this.fileManager = fileManager
    this.editor = editor
    this.data = {}
    this._view = {}
    this._handlers = {}
    this.loadedTabs = []
    this.dispatch = null
    this.themeQuality = 'dark'
    this.maximize = false
  }

  async onActivation () {
    this.on('theme', 'themeChanged', (theme) => {
      this.themeQuality = theme.quality
      // update invert for all icons
      this.renderComponent()
    })

    this.on('fileManager', 'filesAllClosed', () => {
      this.call('manager', 'activatePlugin', 'home')
      this.focus('home')
    })

    this.on('fileManager', 'fileRemoved', (name) => {
      const workspace = this.fileManager.currentWorkspace()

      if (this.fileManager.mode === 'browser') {
        name = name.startsWith(workspace + '/') ? name : workspace + '/' + name
        // If deleted file is not current file and not an active tab in editor,
        // ensure current file is active in the editor
        if (this.fileManager.currentFile() && name !== this.fileManager.currentFile()) {
          const currentFile = this.fileManager.currentFile()
          const currentFileTabPath = currentFile.startsWith(workspace + '/') ? currentFile : workspace + '/' + currentFile
          this.removeTab(name, { name: currentFileTabPath })
        } else this.removeTab(name)
      } else {
        name = name.startsWith(this.fileManager.mode + '/') ? name : this.fileManager.mode + '/' + name
        this.removeTab(name)
      }
    })

    this.on('fileManager', 'fileClosed', (name) => {
      const workspace = this.fileManager.currentWorkspace()
      if (this.fileManager.mode === 'browser') {
        name = name.startsWith(workspace + '/') ? name : workspace + '/' + name
        let tabIndex = this.loadedTabs.findIndex(tab => tab.name === name)

        // If tab doesn't exist, check if tab is opened because of abrupt disconnection with remixd
        if (tabIndex === -1) {
          const nameArray = name.split('/')
          nameArray.shift()
          name = 'localhost' + '/' + nameArray.join('/')
          tabIndex = this.loadedTabs.findIndex(tab => tab.name === name)
          if(tabIndex !== -1) this.removeTab(name)
        } else this.removeTab(name)
      } else {
        name = name.startsWith(this.fileManager.mode + '/') ? name : this.fileManager.mode + '/' + name
        this.removeTab(name)
      }
    })

    this.on('fileManager', 'currentFileChanged', (file) => {
      const workspace = this.fileManager.currentWorkspace()

      if (this.fileManager.mode === 'browser') {
        const workspacePath = workspace + '/' + file

        if (this._handlers[workspacePath]) {
          this.tabsApi.activateTab(workspacePath)
          return
        }
        this.addTab(workspacePath, '', async () => {
          await this.fileManager.open(file)
          this.event.emit('openFile', file)
          this.emit('openFile', file)
        },
        async () => {
          await this.fileManager.closeFile(file)
          this.event.emit('closeFile', file)
          this.emit('closeFile', file)
        })
        this.tabsApi.activateTab(workspacePath)
      } else {
        const path = file.startsWith(this.fileManager.mode + '/') ? file : this.fileManager.mode + '/' + file

        if (this._handlers[path]) {
          this.tabsApi.activateTab(path)
          return
        }
        this.addTab(path, '', async () => {
          await this.fileManager.open(file)
          this.event.emit('openFile', file)
          this.emit('openFile', file)
        },
        async () => {
          await this.fileManager.closeFile(file)
          this.event.emit('closeFile', file)
          this.emit('closeFile', file)
        })
        this.tabsApi.activateTab(path)
      }
    })

    this.on('fileManager', 'fileRenamed', (oldName, newName, isFolder) => {
      const workspace = this.fileManager.currentWorkspace()

      if (this.fileManager.mode === 'browser') {
        if (isFolder) {
          for (const tab of this.loadedTabs) {
            if (tab.name.indexOf(workspace + '/' + oldName + '/') === 0) {
              const newTabName = workspace + '/' + newName + tab.name.slice(workspace + '/' + oldName.length, tab.name.length)
              this.renameTab(tab.name, newTabName)
            }
          }
          return
        }
        // should change the tab title too
        this.renameTab(workspace + '/' + oldName, workspace + '/' + newName)
      } else {
        if (isFolder) {
          for (const tab of this.loadedTabs) {
            if (tab.name.indexOf(this.fileManager.mode + '/' + oldName + '/') === 0) {
              const newTabName = this.fileManager.mode + '/' + newName + tab.name.slice(this.fileManager.mode + '/' + oldName.length, tab.name.length)
              this.renameTab(tab.name, newTabName)
            }
          }
          return
        }
        // should change the tab title too
        this.renameTab(this.fileManager.mode + '/' + oldName, this.fileManager.mode + '/' + newName)
      }
    })

    this.on('fileManager', 'openDiff', (commit) => {
      const hash = commit.hashModified? commit.hashModified.substring(0,6): 'Working Tree'
      const name =  `${commit.path} (${hash})`
      this.addTab(name, name, async () => {
        await this.fileManager.diff(commit)
        this.event.emit('openDiff', commit)
        this.emit('openDiff', commit)
      },
      async () => {
        this.removeTab(name)
        await this.fileManager.closeDiff(commit)
        this.event.emit('closeDiff', commit)
        this.emit('closeDiff', commit)
      })
      this.tabsApi.activateTab(name)
    })

    this.on('manager', 'pluginActivated', ({ name, location, displayName, icon, description, show = true }) => {
      if (location === 'mainPanel') {
        this.addTab(
          name,
          displayName,
          () => this.emit('switchApp', name),
          () => {
            if (name === 'home' && this.loadedTabs.length === 1 && this.loadedTabs[0].id === "home") {
              const files = Object.keys(this.editor.sessions)
              files.forEach(filepath => this.editor.discard(filepath))
            }
            this.emit('closeApp', name)
            this.call('manager', 'deactivatePlugin', name)
          },
          icon,
          description,
          show
        )
        show && this.switchTab(name)
      }
    })

    this.on('manager', 'pluginDeactivated', (profile) => {
      this.removeTab(profile.name)
    })

    this.on('fileDecorator', 'fileDecoratorsChanged', async (items) => {
      this.tabsApi.setFileDecorations(items)
    })

    try {
      this.themeQuality = (await this.call('theme', 'currentTheme') ).quality
    } catch (e) {
      console.log('theme plugin has an issue: ', e)
    }
    this.renderComponent()
  }

  focus (name) {
    this.emit('switchApp', name)
    const tabIndex = this.loadedTabs.findIndex(tab => tab.name === name)
    if (tabIndex !== -1) {
      this.loadedTabs[tabIndex].show = true
    }
    this.tabsApi.activateTab(name)
  }

  switchTab (tabName) {
    if (this._handlers[tabName]) {
      this._handlers[tabName].switchTo()
      this.tabsApi.activateTab(tabName)
    }
  }

  switchNextTab () {
    const active = this.tabsApi.active()
    if (active && this._handlers[active]) {
      const handlers = Object.keys(this._handlers)
      let i = handlers.indexOf(active)
      if (i >= 0) {
        i = handlers[i + 1] ? i + 1 : 0
        this.switchTab(handlers[i])
      }
    }
  }

  switchPreviousTab () {
    const active = this.tabsApi.active()
    if (active && this._handlers[active]) {
      const handlers = Object.keys(this._handlers)
      let i = handlers.indexOf(active)
      if (i >= 0) {
        i = handlers[i - 1] ? i - 1 : handlers.length - 1
        this.switchTab(handlers[i])
      }
    }
  }

  renameTab (oldName, newName) {
    // The new tab is being added by FileManager
    this.removeTab(oldName)
  }

  /**
   *
   * @param {string} name
   * @param {string} title
   * @param {Function} switchTo
   * @param {Function} close
   * @param {string} icon
   * @param {string} description
   * @returns
   */
  addTab (name, title, switchTo, close, icon, description = '', show = true) {
    if (this._handlers[name]) return this.renderComponent()

    if ((name.endsWith('.vy') && icon === undefined) || title.includes('Vyper')) {
      icon = 'assets/img/vyperLogo2.webp'
    }
    if (title === 'Solidity Compile Details') {
      icon = 'assets/img/solidity.webp'
    }



    var slash = name.split('/')
    const tabPath = slash.reverse()
    const tempTitle = []

    if (!title) {
      for (let i = 0; i < tabPath.length; i++) {
        tempTitle.push(tabPath[i])
        const formatPath = [...tempTitle].reverse()
        const index = this.loadedTabs.findIndex(({ title }) => title === formatPath.join('/'))

        if (index === -1) {
          title = formatPath.join('/')
          const titleLength = formatPath.length
          this.loadedTabs.push({
            id: name,
            name,
            title,
            icon,
            tooltip: name,
            iconClass: getPathIcon(name),
            show
          })
          formatPath.shift()
          if (formatPath.length > 0) {
            const index = this.loadedTabs.findIndex(({ title }) => title === formatPath.join('/'))
            if (index > -1) {
              const duplicateTabName = this.loadedTabs[index].name
              const duplicateTabTooltip = this.loadedTabs[index].description
              const duplicateTabPath = duplicateTabName.split('/')
              const duplicateTabFormatPath = [...duplicateTabPath].reverse()
              const duplicateTabTitle = duplicateTabFormatPath.slice(0, titleLength).reverse().join('/')
              this.loadedTabs[index] = {
                id: duplicateTabName,
                name: duplicateTabName,
                title: duplicateTabTitle,
                icon,
                tooltip: duplicateTabTooltip || duplicateTabTitle,
                iconClass: getPathIcon(duplicateTabName),
                show
              }
            }
          }
          break
        }
      }
    } else {
      this.loadedTabs.push({
        id: name,
        name,
        title,
        icon,
        tooltip: description || title,
        iconClass: getPathIcon(name),
        show
      })
    }

    this.renderComponent()
    this._handlers[name] = { switchTo, close }
  }

  removeTab (name, currentFileTab) {
    delete this._handlers[name]
    let previous = currentFileTab
    if(!this.loadedTabs.find(tab => tab.name === name)) return // prevent removing tab that doesn't exist
    this.loadedTabs = this.loadedTabs.filter((tab, index) => {
      if (!previous && tab.name === name) {
        previous = this.getPreviousVisibleTab(index)
        if (!previous) previous = this.getNextVisibleTab(index)
      }
      return tab.name !== name
    })
    this.renderComponent()
    if (previous) this.switchTab(previous.name)
  }

  getPreviousVisibleTab (index) {
    for (let i = index - 1; i >= 0; i--) {
      if (this.loadedTabs[i].show) return this.loadedTabs[i]
    }
    return null
  }

  getNextVisibleTab (index) {
    for (let i = index + 1; i < this.loadedTabs.length; i++) {
      if (this.loadedTabs[i].show) return this.loadedTabs[i]
    }
    return null
  }

  addHandler (type, fn) {
    this.handlers[type] = fn
  }

  setDispatch (dispatch) {
    this.dispatch = dispatch
    this.renderComponent()
  }

  updateComponent(state) {
    return <TabsUI
      plugin={state.plugin}
      tabs={state.loadedTabs}
      onSelect={state.onSelect}
      onClose={state.onClose}
      onZoomIn={state.onZoomIn}
      onZoomOut={state.onZoomOut}
      onReady={state.onReady}
      themeQuality={state.themeQuality}
      maximize={this.maximize}
    />
  }

  renderComponent () {
    const onSelect = (index) => {
      if (this.loadedTabs[index]) {
        const name = this.loadedTabs[index].name
        if (this._handlers[name]) this._handlers[name].switchTo()
        this.emit('tabCountChanged', this.loadedTabs.length)
      }
    }

    const onClose = (index) => {
      if (this.loadedTabs[index]) {
        const name = this.loadedTabs[index].name
        if (this._handlers[name]) this._handlers[name].close()
        this.emit('tabCountChanged', this.loadedTabs.length)
      }
    }

    const onZoomIn = () => this.editor.editorFontSize(1)
    const onZoomOut = () => this.editor.editorFontSize(-1)

    const onReady = (api) => {
      this.tabsApi = api
    }

    this.dispatch({
      plugin: this,
      loadedTabs: this.loadedTabs,
      onSelect,
      onClose,
      onZoomIn,
      onZoomOut,
      onReady,
      themeQuality: this.themeQuality
    })
  }

  renderTabsbar () {
    return <div><PluginViewWrapper plugin={this} /></div>
  }
}
