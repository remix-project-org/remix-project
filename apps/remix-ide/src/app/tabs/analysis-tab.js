import React from 'react' // eslint-disable-line
import { ViewPlugin } from '@remixproject/engine-web'
import { EventEmitter } from 'events'
import {RemixUiStaticAnalyser} from '@remix-ui/static-analyser' // eslint-disable-line
import * as packageJson from '../../../../../package.json'
import {Registry} from '@remix-project/remix-lib'
import { PluginViewWrapper } from '@remix-ui/helper'

var EventManager = require('../../lib/events')

const profile = {
  name: 'solidityStaticAnalysis',
  displayName: 'Solidity Analyzers',
  methods: ['analyze'],
  events: [],
  icon: 'assets/img/staticAnalysis.webp',
  description: 'Analyze your code using Remix, Solhint and Slither.',
  kind: 'analysis',
  location: 'sidePanel',
  documentation: 'https://remix-ide.readthedocs.io/en/latest/static_analysis.html',
  version: packageJson.version,
  maintainedBy: 'Remix'
}

export default class AnalysisTab extends ViewPlugin {
  constructor () {
    super(profile)
    this.event = new EventManager()
    this.events = new EventEmitter()
    this.registry = Registry.getInstance()
    this.element = document.createElement('div')
    this.element.setAttribute('id', 'staticAnalyserView')
    this._components = {}
    this._components.registry = this.registry
    this._deps = {
      offsetToLineColumnConverter: this.registry.get(
        'offsettolinecolumnconverter').api
    }
    this.dispatch = null
    this.hints = []
    this.basicEnabled = false
    this.solhintEnabled = false
    this.slitherEnabled = false
  }

  async onActivation () {
    this.renderComponent()
    const isSolidityActive = await this.call('manager', 'isActive', 'solidity')
    if (!isSolidityActive) {
      await this.call('manager', 'activatePlugin', 'solidity')
    }

    this.event.register('staticAnaysisWarning', (count) => {
      let payloadType = ''
      const error = this.hints?.find(hint => hint.type === 'error')
      if (error && this.solhintEnabled) {
        payloadType = 'error'
      } else {
        payloadType = 'warning'
      }

      if (count > 0) {
        this.emit('statusChanged', { key: count, title: payloadType === 'error' ? `You have ${count} problem${count === 1 ? '' : 's'}` : `You have ${count} warnings`, type: payloadType })
      } else if (count === 0) {
        this.emit('statusChanged', { key: 'succeed', title: 'no warnings or errors', type: 'success' })
      } else {
        // count ==-1 no compilation result
        this.emit('statusChanged', { key: 'none' })
      }
    })
  }

  analyze () {
    this.emit('analyze')
  }

  setDispatch (dispatch) {
    this.dispatch = dispatch
    this.renderComponent()
  }

  render () {
    return <div id='staticAnalyserView'><PluginViewWrapper plugin={this} /></div>
  }

  updateComponent(state) {
    return  <RemixUiStaticAnalyser
      registry={state.registry}
      analysisModule={state.analysisModule}
      event={state.event}
    />
  }

  renderComponent () {
    this.dispatch && this.dispatch({
      registry: this.registry,
      analysisModule: this,
      event: this.event
    })
  }
}

module.exports = AnalysisTab
