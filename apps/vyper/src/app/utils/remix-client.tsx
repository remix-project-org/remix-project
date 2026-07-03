import { HighlightPosition, CompilationResult, RemixApi, customAction } from '@remixproject/plugin-api'
import { Api, Status } from '@remixproject/plugin-utils'
import { createClient } from '@remixproject/plugin-webview'
import { PluginClient } from '@remixproject/plugin'
import { Contract, compileContract } from './compiler'
import { ExampleContract } from '../components/VyperResult'
import EventEmitter from 'events'
import { CustomRemixApi } from '@remix-api'
import { endpointUrls } from '@remix-endpoints-helper'
export class RemixClient extends PluginClient<any, CustomRemixApi> {
  private client = createClient<Api, Readonly<RemixApi>>(this)
  compilerUrl: string = endpointUrls.vyper2
  compilerOutput: any
  eventEmitter = new EventEmitter()

  constructor() {
    super()
    this.compilerOutput = {}
  }

  loaded() {
    return this.client.onload()
  }

  /** Emit an event when file changed */
  async onFileChange(cb: (contract: string) => any) {
    this.client.on('fileManager', 'currentFileChanged', async (name: string) => {
      cb(name)
    })
  }

  /** Emit an event when file changed */
  async onNoFileSelected(cb: () => any) {
    this.client.on('fileManager', 'noFileSelected', async () => {
      cb()
    })
  }

  resetCompilerState() {
    this.compilerOutput = {}
    this.eventEmitter.emit('resetCompilerState', {})
  }

  async vyperCompileCustomAction(action?: customAction) {
    //read selected contract from file explorer and create contract type
    const contract = await this.getContract()
    //compile contract
    await compileContract(contract.name, this.compilerUrl)
  }

  /** Load Ballot contract example into the file manager */
  async loadContract({ name, address }: ExampleContract) {
    try {
      const content = await this.client.call('contentImport', 'resolve', address)
      await this.client.call('fileManager', 'setFile', content.cleanUrl, content.content)
      await this.client.call('fileManager', 'switchFile', content.cleanUrl)
    } catch (err) {
      console.log(err)
    }
  }

  async askGpt(message: string) {
    if (message.length === 0) {
      this.client.call('terminal', 'log', { type: 'log', value: 'kindly send a proper message so I can respond please' })
      return
    }
    try {
      // TODO: remove! no formatting required since already handled on server
      const file = await this.client.call('fileManager', 'getCurrentFile')
      const content = await this.client.call('fileManager', 'readFile', file)
      const messageAI = `Vyper code: ${content}\n error message: ${message}\n explain why the error occurred and how to fix it.`

      await this.client.plugin.call('popupPanel', 'showPopupPanel', true)
      await this.client.plugin.call('menuicons', 'select', 'remixaiassistant')
      setTimeout(async () => {
        await (this.client.plugin as any).call('remixAI', 'chatPipe', 'error_explaining', messageAI, undefined, undefined, { source: 'vyper', presetId: 'error-explain' })
      }, 500)
    } catch (err) {
      console.error('unable to askGpt')
      console.error(err)
    }
  }

  async cloneVyperRepo(count?: number) {

    try {
      // @ts-ignore
      this.call('notification', 'toast', 'cloning Vyper repository...')
      await this.call(
        'dgitApi',
        'clone',
        { url: 'https://github.com/vyperlang/vyper', token: null, branch: 'master', singleBranch: false, workspaceName: 'vyper' },
      )

      await this.call(
        'dgitApi',
        'checkout',
        {
          ref:'v0.4.0',
          force: true,
          refresh: true,
        }
      )

      this.call(
        // @ts-ignore
        'notification',
        'toast',
        'Vyper repository cloned, the workspace Vyper has been created.'
      )
    } catch (e) {
      // @ts-ignore
      this.call('notification', 'toast', e.message)
    }
  }

  /** Update the status of the plugin in remix */
  changeStatus(status: Status) {
    this.client.emit('statusChanged', status)
  }

  checkActiveTheme() {
    const active = this.client.call('theme', 'currentTheme')
    if (active === 'dark') {
      return 'monokai' as any
    }
  }

  /** Highlight a part of the editor */
  async highlight(lineColumnPos: HighlightPosition, name: string, message: string) {
    await this.client.call('editor', 'highlight', lineColumnPos, name)
    /*
    column: -1
      row: -1
      text: "browser/Untitled1.sol: Warning: SPDX license identifier not provided in source file. Before publishing, consider adding a comment containing "SPDX-License-Identifier: <SPDX-License>" to each source file. Use "SPDX-License-Identifier: UNLICENSED" for non-open-source code. Please see https://spdx.org for more information.↵"
      type: "warning"
    */
    const annotation = {
      column: 0,
      row: lineColumnPos.start.line,
      type: 'error',
      text: message
    }
    await this.client.call('editor', 'addAnnotation', annotation, name)
  }

  /** Remove current Highlight */
  async discardHighlight() {
    await this.client.call('editor', 'discardHighlight')
    await this.client.call('editor', 'clearAnnotations')
  }

  /** Get the name of the current contract */
  async getContractName(): Promise<string> {
    await this.client.onload()
    return this.client.call('fileManager', 'getCurrentFile')
  }

  /** Get the current contract file */
  async getContract(): Promise<Contract> {
    const name = await this.getContractName()
    if (!name) throw new Error('No contract selected yet')
    const content = await this.client.call('fileManager', 'getFile', name)
    return {
      name,
      content
    }
  }

  /** Emit an event to Remix with compilation result */
  compilationFinish(title: string, content: string, data: CompilationResult) {
    this.client.emit('compilationFinished', title, content, 'vyper', data)
  }
}

export const remixClient = new RemixClient()
