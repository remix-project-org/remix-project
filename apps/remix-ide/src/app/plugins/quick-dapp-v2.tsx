import React from 'react'
import { ViewPlugin } from '@remixproject/engine-web'
import * as packageJson from '../../../../../package.json'
import { PluginViewWrapper } from '@remix-ui/helper'
import { RemixUiQuickDappV2 } from '@remix-ui/quick-dapp-v2'
import { EventEmitter } from 'events'

const profile = {
  name: 'quick-dapp-v2',
  displayName: 'Quick Dapp V2',
  icon: 'assets/img/quickdappv2.webp',
  description: 'Edit & deploy a Dapp',
  kind: 'quick-dapp-v2',
  location: 'mainPanel',
  documentation: '',
  version: packageJson.version,
  maintainedBy: 'Remix',
  permission: true,
  events: [],
  methods: ['edit', 'clearInstance', 'startAiLoading', 'createDapp', 'openDapp', 'updateDapp', 'consumePendingCreateDapp']
}

export class QuickDappV2 extends ViewPlugin {
  element: HTMLDivElement
  dispatch: React.Dispatch<any> = () => {}
  event: any
  private listenersRegistered: boolean = false
  private pendingCreateDapp: any = null

  constructor() {
    super(profile)
    this.event = new EventEmitter()
    this.element = document.createElement('div')
    this.element.setAttribute('id', 'quick-dapp-v2')
  }

  getProfile() {
    return profile
  }

  async onActivation() {
    if (this.listenersRegistered) return
    this.listenersRegistered = true

    this.on('ai-dapp-generator', 'dappGenerated', async (data: any) => {
      this.event.emit('dappGenerated', data)
    })

    this.on('ai-dapp-generator', 'dappGenerationError', (data: any) => {
      this.event.emit('dappGenerationError', data)
    })

    this.on('filePanel', 'workspaceDeleted', (workspaceName: string) => {
      this.event.emit('workspaceDeleted', workspaceName)
    })

    this.on('ai-dapp-generator', 'generationProgress', (data: any) => {
      this.event.emit('generationProgress', data)
    })
  }

  onDeactivation() {
    this.listenersRegistered = false
  }

  private async isQuickDappEnabled(): Promise<boolean> {
    try {
      const enabled = await this.call('auth', 'getAppConfigValue', 'quickdapp.enabled', true)
      return enabled !== false
    } catch {
      return true
    }
  }

  setDispatch(dispatch: React.Dispatch<any>) {
    this.dispatch = dispatch
    this.renderComponent()
  }

  renderComponent() {
    this.dispatch({})
  }

  render() {
    return (
      <div id="quick-dapp-v2" data-id="quick-dapp-v2">
        <PluginViewWrapper plugin={this} />
      </div>
    )
  }

  updateComponent(_state: any) {
    return (
      <RemixUiQuickDappV2 plugin={this} />
    )
  }

  async edit(params: {
    address?: string;
    abi?: any[];
    network?: string;
    name?: string;
    devdoc?: any;
    methodIdentifiers?: any;
    solcVersion?: string;
    htmlTemplate?: string;
    pages?: any;
  }): Promise<void> {
    if (!(await this.isQuickDappEnabled())) {
      this.call('notification', 'toast', 'QuickDapp is coming soon. Stay tuned!')
      return
    }
    this.event.emit('edit', params)
  }

  clearInstance(): void {
    this.event.emit('clearInstance')
  }

  startAiLoading(): void {
    this.event.emit('startAiLoading')
  }

  async createDapp(payload: any): Promise<void> {
    console.log('[QuickDappPlugin:createDapp] CALLED, payload keys=', payload ? Object.keys(payload) : 'null');
    if (!(await this.isQuickDappEnabled())) {
      console.log('[QuickDappPlugin:createDapp] BLOCKED: quickdapp disabled');
      this.call('notification', 'toast', 'QuickDapp is coming soon. Stay tuned!')
      return
    }
    const listenerCount = this.event.listenerCount('createDapp');
    console.log('[QuickDappPlugin:createDapp] listenerCount=', listenerCount);
    if (listenerCount > 0) {
      this.event.emit('createDapp', payload)
    } else {
      console.log('[QuickDappPlugin:createDapp] NO LISTENERS, storing as pending');
      this.pendingCreateDapp = payload
    }
  }

  consumePendingCreateDapp(): any {
    const payload = this.pendingCreateDapp
    this.pendingCreateDapp = null
    return payload
  }

  async openDapp(slug: string): Promise<boolean> {
    this.event.emit('openDapp', slug)
    return true
  }

  async updateDapp(
    slug: string,
    address: string,
    prompt: string | any[],
    files: any,
    image: string | null,
    abi: any[] = [],
    chainId: string | number = 1
  ): Promise<void> {
    try {
      this.event.emit('dappUpdateStart', { slug })
      await this.call('ai-dapp-generator', 'updateDapp', address, prompt, files, image, slug, abi, chainId)
    } catch (e: any) {
      console.error('[QuickDappV2] updateDapp failed:', e)
      this.event.emit('dappGenerationError', { slug, error: e.message })
    }
  }
}
