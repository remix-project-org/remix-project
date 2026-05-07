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
  methods: ['edit', 'clearInstance', 'startAiLoading', 'createDapp', 'createDappWorkspace', 'openDapp', 'consumePendingCreateDapp', 'listDapps']
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

    // Listen to remixAI events from DApp MCP tools
    this.on('remixAI', 'dappGenerated', async (data: any) => {
      console.log('[QuickDapp] dappGenerated received', { slug: data?.slug, isUpdate: data?.isUpdate })
      this.event.emit('dappGenerated', data)
    })

    this.on('remixAI', 'dappGenerationError', (data: any) => {
      console.log('[QuickDapp] dappGenerationError received', { slug: data?.slug })
      this.event.emit('dappGenerationError', data)
    })

    this.on('filePanel', 'workspaceDeleted', (workspaceName: string) => {
      console.log('[QuickDapp] workspaceDeleted:', workspaceName)
      this.event.emit('workspaceDeleted', workspaceName)
    })

    this.on('remixAI', 'generationProgress', (data: any) => {
      console.log('[QuickDapp] generationProgress:', data?.status, data?.slug)
      this.event.emit('generationProgress', data)
    })

    this.on('remixAI', 'dappUpdateStart', (data: any) => {
      console.log('[QuickDapp] dappUpdateStart:', data?.slug)
      this.event.emit('dappUpdateStart', data)
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

  /**
   * Create a DApp workspace — callable from MCP handlers.
   * Returns the workspace slug so the handler can write files into it.
   */
  async createDappWorkspace(payload: {
    contractName: string;
    address: string;
    abi: any[];
    chainId: string | number;
    networkName?: string;
    sourceFilePath?: string;
    isBaseMiniApp?: boolean;
  }): Promise<{ slug: string; workspaceName: string }> {
    const DAPP_WORKSPACE_PREFIX = 'dapp-';

    // ── Payload validation ──
    if (!payload.address || typeof payload.address !== 'string' || !payload.address.startsWith('0x')) {
      throw new Error(`createDappWorkspace: Invalid contract address: ${payload.address}`);
    }
    if (!Array.isArray(payload.abi) || payload.abi.length === 0) {
      throw new Error(`createDappWorkspace: ABI must be a non-empty array`);
    }
    if (payload.chainId === undefined || payload.chainId === null || String(payload.chainId) === 'undefined') {
      console.warn('[QuickDapp] chainId undefined, defaulting to vm-osaka');
      payload.chainId = 'vm-osaka';
    }

    const name = payload.contractName || 'Untitled';
    const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${id.slice(0, 6)}`;
    const workspaceName = `${DAPP_WORKSPACE_PREFIX}${slug}`;
    const timestamp = Date.now();

    console.log('[QuickDapp] createDappWorkspace called', { contractName: payload.contractName, address: payload.address });


    let sourceWorkspaceName = 'default_workspace';
    try {
      const currentWs = await this.call('filePanel', 'getCurrentWorkspace');
      sourceWorkspaceName = currentWs?.name || 'default_workspace';
    } catch (e) { /* fallback */ }

    // ── Guard: Block DApp creation from within a DApp workspace ──
    if (sourceWorkspaceName.startsWith(DAPP_WORKSPACE_PREFIX)) {
      throw new Error(
        'Cannot create a DApp from within a DApp workspace. ' +
        'Please switch to the original contract workspace first.'
      );
    }

    // ── Auto-pin in source workspace (before switching) ──
    // Saves pin + dapp-mapping so the contract stays visible in the source workspace
    try {
      const pinnedData = {
        name: payload.contractName,
        address: payload.address,
        abi: payload.abi,
        filePath: payload.sourceFilePath ? `${sourceWorkspaceName}/${payload.sourceFilePath}` : '',
        pinnedAt: timestamp
      };

      // Pin contract in source workspace
      const pinPath = `.deploys/pinned-contracts/${payload.chainId}/${payload.address}.json`;
      try { await this.call('fileManager', 'mkdir', '.deploys'); } catch (_) {}
      try { await this.call('fileManager', 'mkdir', '.deploys/pinned-contracts'); } catch (_) {}
      try { await this.call('fileManager', 'mkdir', `.deploys/pinned-contracts/${payload.chainId}`); } catch (_) {}
      await this.call('fileManager', 'writeFile', pinPath, JSON.stringify(pinnedData, null, 2));
      console.log('[QuickDapp] Contract pinned in source workspace:', pinPath);

      // Save dapp-mapping for "Go to DApp" navigation
      const dappMappingPath = `.deploys/dapp-mappings/${payload.address}_${workspaceName}.json`;
      const dappMapping = {
        address: payload.address,
        dappWorkspace: workspaceName,
        sourceWorkspace: sourceWorkspaceName,
        chainId: payload.chainId,
        createdAt: timestamp
      };
      try { await this.call('fileManager', 'mkdir', '.deploys/dapp-mappings'); } catch (_) {}
      await this.call('fileManager', 'writeFile', dappMappingPath, JSON.stringify(dappMapping, null, 2));
      console.log('[QuickDapp] Dapp mapping saved:', dappMappingPath);
    } catch (e) {
      console.warn('[QuickDapp] Auto-pin in source workspace failed (non-critical):', e);
    }

    // Capture VM state if on VM provider
    let vmStateSnapshot: string | null = null;
    const vmProviderName = payload.chainId && String(payload.chainId).startsWith('vm-')
      ? String(payload.chainId) : null;
    if (vmProviderName) {
      try {
        try {
          await Promise.race([
            this.call('blockchain' as any, 'dumpState'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
          ]);
        } catch (_) {}
        await new Promise(r => setTimeout(r, 100));
        const statePath = `.states/${vmProviderName}/state.json`;
        const stateExists = await this.call('fileManager', 'exists', statePath);
        if (stateExists) {
          vmStateSnapshot = await this.call('fileManager', 'readFile', statePath) as string;
        }
      } catch (e) {
        console.warn('[QuickDapp] VM state capture failed (non-critical):', e);
      }
    }


    await this.call('filePanel', 'createWorkspace', workspaceName, true);
    await this.call('filePanel' as any, 'switchToWorkspace', { name: workspaceName, isLocalhost: false });
    await new Promise(r => setTimeout(r, 300));


    const initialConfig = {
      _warning: 'DO NOT EDIT THIS FILE MANUALLY. MANAGED BY QUICK DAPP.',
      id,
      slug: workspaceName,
      name,
      workspaceName,
      contract: {
        address: payload.address,
        name: payload.contractName,
        abi: payload.abi,
        chainId: payload.chainId,
        networkName: payload.networkName || 'Unknown Network'
      },
      sourceWorkspace: {
        name: sourceWorkspaceName,
        filePath: payload.sourceFilePath || ''
      },
      status: 'creating',
      processingStartedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      config: {
        title: name,
        details: 'Generated by AI',
        isBaseMiniApp: payload.isBaseMiniApp || false
      }
    };

    await this.call('fileManager', 'writeFile', 'dapp.config.json', JSON.stringify(initialConfig, null, 2));
    try { await this.call('fileManager', 'mkdir', 'src'); } catch (_) {}


    if (vmStateSnapshot && vmProviderName) {
      try {
        try { await this.call('fileManager', 'mkdir', '.states'); } catch (_) {}
        try { await this.call('fileManager', 'mkdir', `.states/${vmProviderName}`); } catch (_) {}
        await this.call('fileManager', 'writeFile', `.states/${vmProviderName}/state.json`, vmStateSnapshot);
      } catch (e) {
        console.warn('[QuickDapp] VM state restore failed (non-critical):', e);
      }
    }

    // Pin contract in dapp workspace
    try {
      const pinnedPath = `.deploys/pinned-contracts/${payload.chainId}/${payload.address}.json`;
      try { await this.call('fileManager', 'mkdir', '.deploys'); } catch (_) {}
      try { await this.call('fileManager', 'mkdir', '.deploys/pinned-contracts'); } catch (_) {}
      try { await this.call('fileManager', 'mkdir', `.deploys/pinned-contracts/${payload.chainId}`); } catch (_) {}
      const pinnedData = {
        name: payload.contractName,
        address: payload.address,
        abi: payload.abi,
        filePath: payload.sourceFilePath ? `${sourceWorkspaceName}/${payload.sourceFilePath}` : '',
        pinnedAt: Date.now()
      };
      await this.call('fileManager', 'writeFile', pinnedPath, JSON.stringify(pinnedData, null, 2));
      console.log('[QuickDapp] Contract pinned in dapp workspace:', pinnedPath);


      try {
        const existingContracts = await this.call('udappDeployedContracts' as any, 'getDeployedContracts');
        const alreadyExists = existingContracts?.some?.(
          (c: any) => c.address?.toLowerCase() === payload.address?.toLowerCase()
        );
        if (!alreadyExists) {
          await this.call(
            'udappDeployedContracts' as any, 'addInstance',
            payload.address,
            payload.abi,
            payload.contractName,
            null,
            pinnedData.pinnedAt
          );
        }
      } catch (_) {
        // Non-critical: UI will refresh on next workspace switch
      }
    } catch (e) {
      console.warn('[QuickDapp] Contract pin in dapp workspace failed (non-critical):', e);
    }

    console.log('[QuickDapp] createDappWorkspace done', { slug: workspaceName });
    return { slug: workspaceName, workspaceName };
  }

  async openDapp(slug: string): Promise<boolean> {
    this.event.emit('openDapp', slug)
    return true
  }

  /**
   * List all existing DApp workspaces with their config.
   * Callable from MCP handlers so the AI agent can discover existing DApps.
   */
  async listDapps(): Promise<Array<{
    slug: string;
    workspaceName: string;
    name: string;
    contractAddress: string;
    contractName: string;
    chainId: string | number;
    status: string;
    createdAt: number;
  }>> {
    console.log('[QuickDapp] listDapps called')
    try {
      const allWorkspaces = await this.call('filePanel', 'getWorkspacesForPlugin')
      if (!allWorkspaces || !Array.isArray(allWorkspaces)) {
        console.log('[QuickDapp] No workspaces found')
        return []
      }

      const dappWorkspaces = allWorkspaces
        .map((ws: any) => typeof ws === 'string' ? ws : ws.name)
        .filter((name: string) => name && name.startsWith('dapp-'))

      console.log('[QuickDapp] Found', dappWorkspaces.length, 'dapp workspaces')

      const results: any[] = []
      for (const wsName of dappWorkspaces) {
        try {
          const hasConfig = await this.call('filePanel' as any, 'existsInWorkspace', wsName, 'dapp.config.json')
          if (!hasConfig) continue

          const content = await this.call('filePanel' as any, 'readFileFromWorkspace', wsName, 'dapp.config.json')
          if (!content) continue

          const config = JSON.parse(content)
          results.push({
            slug: wsName,
            workspaceName: wsName,
            name: config.name || 'Untitled',
            contractAddress: config.contract?.address || 'unknown',
            contractName: config.contract?.name || 'unknown',
            chainId: config.contract?.chainId || 'unknown',
            status: config.status || 'unknown',
            createdAt: config.createdAt || 0
          })
        } catch (e) {
          console.warn('[QuickDapp] Failed to read config for', wsName, e)
        }
      }

      console.log('[QuickDapp] listDapps returned', results.length, 'dapps')
      return results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    } catch (e) {
      console.error('[QuickDapp] listDapps failed:', e)
      return []
    }
  }

}
