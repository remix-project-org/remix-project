import { DebuggerUI } from '@remix-ui/debugger-ui' // eslint-disable-line
import { DebuggerApiMixin } from '@remix-ui/debugger-ui'
import { ViewPlugin } from '@remixproject/engine-web'
import * as packageJson from '../../../../../package.json'
import React from 'react' // eslint-disable-line
import { bleach } from '@remix-ui/helper'
import { compilationFinishedToastMsg, compilingToastMsg, notFoundToastMsg, sourceVerificationNotAvailableToastMsg } from '@remix-ui/helper'
const css = require('./styles/debugger-tab-styles')

const profile = {
  name: 'debugger',
  displayName: 'Debugger',
  methods: ['debug', 'getTrace', 'decodeLocalVariable', 'decodeStateVariable', 'globalContext'],
  events: [],
  icon: 'assets/img/debuggerLogo.webp',
  description: 'Debug transactions',
  kind: 'debugging',
  location: 'sidePanel',
  documentation: 'https://remix-ide.readthedocs.io/en/latest/debugger.html',
  version: packageJson.version,
  maintainedBy: 'Remix'
}

export default class DebuggerTab extends DebuggerApiMixin(ViewPlugin) {
  constructor () {
    super(profile)
    this.el = document.createElement('div')
    this.el.setAttribute('id', 'debugView')
    this.el.classList.add(css.debuggerTabView)
    this.initDebuggerApi()
  }

  render () {
    this.on('fetchAndCompile', 'compiling', (settings) => {
      settings = JSON.stringify(settings, null, '\t')
      this.call('notification', 'toast', compilingToastMsg(settings))
    })

    this.on('fetchAndCompile', 'compilationFailed', (data) => {
      this.call('notification', 'toast', compilationFinishedToastMsg())
    })

    this.on('fetchAndCompile', 'notFound', (contractAddress) => {
      this.call('notification', 'toast', notFoundToastMsg(contractAddress))
    })

    this.on('fetchAndCompile', 'sourceVerificationNotAvailable', () => {
      this.call('notification', 'toast', sourceVerificationNotAvailableToastMsg())
    })
    const onReady = (api) => { this.api = api }
    return <div className="overflow-hidden px-1" id='debugView'><DebuggerUI debuggerAPI={this} onReady={onReady} /></div>
  }

  showMessage (title, message) {
    try {
      this.call('notification', 'alert', {
        id: 'debuggerTabShowMessage',
        title,
        message: bleach.sanitize(message)
      })
    } catch (e) {
      console.log(e)
    }
  }

  async decodeLocalVariable (variableId) {
    if (!this.debuggerBackend) return null
    return await this.debuggerBackend.debugger.decodeLocalVariableByIdAtCurrentStep(this.debuggerBackend.step_manager.currentStepIndex, variableId)
  }

  async decodeStateVariable (variableId) {
    if (!this.debuggerBackend) return null
    return await this.debuggerBackend.debugger.decodeStateVariableByIdAtCurrentStep(this.debuggerBackend.step_manager.currentStepIndex, variableId)
  }

  async globalContext () {
    if (this.api?.globalContext) {
      const { tx, block } = await this.api.globalContext()
      const blockContext = {
        'chainid': tx.chainId,
        'coinbase': block.miner,
        'difficulty': block.difficulty,
        'gaslimit': block.gasLimit,
        'number': block.number,
        'timestamp': block.timestamp,
      }
      if (block.baseFeePerGas) {
        blockContext['basefee'] = BigInt(block.baseFeePerGas).toString(10) + ` Wei (${block.baseFeePerGas})`
      }
      const msg = {
        'sender': tx.from,
        'sig': tx.input.substring(0, 10),
        'value': tx.value + ' Wei'
      }

      const txOrigin = {
        'origin': tx.from
      }

      return {
        block: blockContext,
        msg,
        tx: txOrigin
      }
    } else {
      return {
        block: null,
        msg: null,
        tx: null
      }
    }
  }
}
