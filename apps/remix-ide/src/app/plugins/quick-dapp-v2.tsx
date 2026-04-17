import React from 'react'
import { ViewPlugin } from '@remixproject/engine-web'
import * as packageJson from '../../../../../package.json'
import { PluginViewWrapper } from '@remix-ui/helper'
import { RemixUiQuickDappV2, DappManager } from '@remix-ui/quick-dapp-v2'
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
  methods: ['edit', 'clearInstance', 'startAiLoading', 'createDapp', 'openDapp', 'updateDapp', 'consumePendingCreateDapp', 'listDapps', 'getDappStatus', 'getDappFiles']
}

export class QuickDappV2 extends ViewPlugin {
  element: HTMLDivElement
  dispatch: React.Dispatch<any> = () => {}
  event: any
  private listenersRegistered: boolean = false
  private pendingCreateDapp: any = null
  private _dappManager: DappManager | null = null

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
    if (!(await this.isQuickDappEnabled())) {
      this.call('notification', 'toast', 'QuickDapp is coming soon. Stay tuned!')
      return
    }
    if (this.event.listenerCount('createDapp') > 0) {
      this.event.emit('createDapp', payload)
    } else {
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

  /**
   * Lazily instantiated DappManager for plugin-level API access.
   * The same class is also instantiated inside the React component,
   * but this instance is for MCP tool use (listDapps, getDappStatus, etc.).
   */
  private getDappManager(): DappManager {
    if (!this._dappManager) {
      this._dappManager = new DappManager(this as any)
    }
    return this._dappManager
  }

  /**
   * List all DApps in the workspace. Called by MCP dapp_list tool.
   * Returns a simplified array with key info (no full ABI to avoid large payloads).
   */
  async listDapps(): Promise<any[]> {
    try {
      const dappManager = this.getDappManager()
      const dapps = await dappManager.getDapps()
      return (dapps || []).map((dapp: any) => ({
        slug: dapp.slug,
        name: dapp.name,
        status: dapp.status,
        contractName: dapp.contract?.name,
        contractAddress: dapp.contract?.address,
        chainId: dapp.contract?.chainId,
        networkName: dapp.contract?.networkName,
        isBaseMiniApp: dapp.config?.isBaseMiniApp || false,
        ipfsCid: dapp.deployment?.ipfsCid,
        ensDomain: dapp.deployment?.ensDomain,
        createdAt: dapp.createdAt,
        updatedAt: dapp.updatedAt,
      }))
    } catch (e: any) {
      console.error('[QuickDappV2] listDapps failed:', e)
      return []
    }
  }

  /**
   * Get detailed status of a specific DApp. Called by MCP dapp_get_status and dapp_update tools.
   * Returns address, abi, chainId, current files, and deployment info.
   */
  async getDappStatus(slug: string): Promise<any> {
    try {
      const dappManager = this.getDappManager()
      const config = await dappManager.getDappConfig(slug)
      if (!config) {
        return { found: false }
      }

      let files: Record<string, string> = {}
      try {
        files = await this.getDappFiles(slug)
      } catch (e) {
        console.warn('[QuickDappV2] getDappFiles failed for getDappStatus:', e)
      }

      return {
        found: true,
        slug: config.slug,
        name: config.name,
        status: config.status,
        address: config.contract?.address,
        abi: config.contract?.abi,
        chainId: config.contract?.chainId,
        networkName: config.contract?.networkName,
        isBaseMiniApp: config.config?.isBaseMiniApp || false,
        ipfsCid: config.deployment?.ipfsCid,
        gatewayUrl: config.deployment?.gatewayUrl,
        ensDomain: config.deployment?.ensDomain,
        files,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      }
    } catch (e: any) {
      console.error('[QuickDappV2] getDappStatus failed:', e)
      return { found: false, error: e.message }
    }
  }

  /**
   * Read all files from a DApp workspace.
   * Uses workspace-switch-and-restore pattern since
   * there is no cross-workspace readdir API available.
   */
  async getDappFiles(slug: string): Promise<Record<string, string>> {
    const files: Record<string, string> = {}
    try {
      const workspaceName = slug

      let currentWorkspace: { name: string; isLocalhost: boolean }
      try {
        currentWorkspace = await this.call('filePanel' as any, 'getCurrentWorkspace')
      } catch (e) {
        currentWorkspace = { name: 'default_workspace', isLocalhost: false }
      }

      const needSwitch = currentWorkspace.name !== workspaceName

      if (needSwitch) {
        await (this as any).call('filePanel', 'switchToWorkspace', { name: workspaceName, isLocalhost: false })
        await new Promise(resolve => setTimeout(resolve, 200))
      }

      await this.readDappFilesRecursive('', files)

      if (needSwitch) {
        await (this as any).call('filePanel', 'switchToWorkspace', { name: currentWorkspace.name, isLocalhost: false })
        await new Promise(resolve => setTimeout(resolve, 200))
        try {
          await this.call('tabs' as any, 'focus', 'quick-dapp-v2')
        } catch (e) { /* best-effort */ }
      }
    } catch (e: any) {
      console.warn('[QuickDappV2] getDappFiles failed:', e)
    }
    return files
  }

  /**
   * Recursively read files from the CURRENTLY ACTIVE workspace.
   * Must be called after switching to the target workspace.
   */
  private async readDappFilesRecursive(
    dirPath: string,
    result: Record<string, string>
  ): Promise<void> {
    try {
      const entries = await this.call('fileManager' as any, 'readdir', dirPath || '/')
      if (!entries) return

      for (const [entryPath, entryData] of Object.entries(entries)) {
        const basename = entryPath.split('/').pop() || ''
        if (
          basename.startsWith('.') ||
          basename === 'dapp.config.json' ||
          basename === 'preview.png' ||
          basename === 'node_modules'
        ) {
          continue
        }

        if ((entryData as any)?.isDirectory) {
          await this.readDappFilesRecursive(entryPath, result)
        } else {
          try {
            const content = await this.call('fileManager' as any, 'readFile', entryPath)
            if (content !== null && content !== undefined) {
              result[entryPath] = content
            }
          } catch (readErr) {
            // Skip files that can't be read (binary, etc.)
          }
        }
      }
    } catch (e) {
      console.warn(`[QuickDappV2] readDappFilesRecursive failed for "${dirPath}":`, e)
    }
  }
}
