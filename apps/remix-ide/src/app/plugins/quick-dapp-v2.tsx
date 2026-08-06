import React from 'react'
import { ViewPlugin } from '@remixproject/engine-web'
import * as packageJson from '../../../../../package.json'
import {
  buildQuickDappContractConfigFields,
  createQuickDappContractSelection,
  normalizeQuickDappEnvironment,
  PluginViewWrapper,
  QuickDappContractInput
} from '@remix-ui/helper'
import { RemixUiQuickDappV2, getNetworkName } from '@remix-ui/quick-dapp-v2'
import { EventEmitter } from 'events'
import { remixAILogger } from '@remix/remix-ai-core'

const profile = {
  name: 'quick-dapp-v2',
  displayName: 'QuickDApp',
  icon: 'assets/img/quickdappv2.webp',
  description: 'Edit & deploy a Dapp',
  kind: 'quick-dapp-v2',
  location: 'mainPanel',
  documentation: '',
  version: packageJson.version,
  maintainedBy: 'Remix',
  permission: true,
  events: [],
  methods: ['edit', 'clearInstance', 'startAiLoading', 'createDapp', 'createDappWorkspace', 'createZkDapp', 'createZkDappWorkspace', 'openDapp', 'consumePendingCreateDapp', 'listDapps']
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
      remixAILogger.log('[QuickDapp] dappGenerated received', { slug: data?.slug, isUpdate: data?.isUpdate })
      this.event.emit('dappGenerated', data)
    })

    this.on('remixAI', 'dappGenerationError', (data: any) => {
      remixAILogger.log('[QuickDapp] dappGenerationError received', { slug: data?.slug })
      this.event.emit('dappGenerationError', data)
    })

    this.on('filePanel', 'workspaceDeleted', (workspaceName: string) => {
      remixAILogger.log('[QuickDapp] workspaceDeleted:', workspaceName)
      this.event.emit('workspaceDeleted', workspaceName)
    })

    this.on('remixAI', 'generationProgress', (data: any) => {
      remixAILogger.log('[QuickDapp] generationProgress:', data?.status, data?.slug)
      this.event.emit('generationProgress', data)
    })

    this.on('remixAI', 'dappUpdateStart', (data: any) => {
      remixAILogger.log('[QuickDapp] dappUpdateStart:', data?.slug)
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
   * Create a ZK DApp from a circom circuit.
   * Called from circuit-compiler when user clicks "Create ZK DApp".
   */
  async createZkDapp(payload: {
    circuitName: string;
    circuitPath: string;
    provingScheme: 'groth16';
    primeValue: 'bn128' | 'bls12381';
    signalInputs: string[];
    wasmPath: string;
    zkeyPath: string;
    verificationKey: Record<string, any>;
    zkVerifyNetwork?: 'testnet' | 'mainnet';
    userDescription?: string;
  }): Promise<void> {
    if (!(await this.isQuickDappEnabled())) {
      this.call('notification', 'toast', 'QuickDapp is coming soon. Stay tuned!')
      return
    }
    if (this.event.listenerCount('createZkDapp') > 0) {
      this.event.emit('createZkDapp', payload)
    } else {
      this.pendingCreateDapp = { ...payload, isZkDapp: true }
    }
  }

  /**
   * Create a ZK DApp workspace — callable from MCP handlers.
   * Returns the workspace slug so the handler can write files into it.
   */
  async createZkDappWorkspace(payload: {
    circuitName: string;
    circuitPath: string;
    provingScheme: 'groth16';
    primeValue: 'bn128' | 'bls12381';
    signalInputs: string[];
    wasmPath: string;
    zkeyPath: string;
    verificationKey: Record<string, any>;
    zkVerifyNetwork?: 'testnet' | 'mainnet';
    userDescription?: string;
  }): Promise<{ slug: string; workspaceName: string }> {
    const DAPP_WORKSPACE_PREFIX = 'dapp-';

    const name = payload.circuitName || 'ZkCircuit';
    const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
    const slug = `zk-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${id.slice(0, 6)}`;
    const workspaceName = `${DAPP_WORKSPACE_PREFIX}${slug}`;
    const timestamp = Date.now();

    let sourceWorkspaceName = 'default_workspace';
    try {
      const currentWs = await this.call('filePanel', 'getCurrentWorkspace');
      sourceWorkspaceName = currentWs?.name || 'default_workspace';
    } catch (e) { /* fallback */ }

    // Guard: Block DApp creation from within a DApp workspace
    if (sourceWorkspaceName.startsWith(DAPP_WORKSPACE_PREFIX)) {
      throw new Error(
        'Cannot create a ZK DApp from within a DApp workspace. ' +
        'Please switch to the original circuit workspace first.'
      );
    }

    // Read circuit artifacts before switching workspace
    let wasmContent: Uint8Array | null = null;
    let zkeyContent: Uint8Array | null = null;

    try {
      const wasmData = await this.call('fileManager', 'readFile', payload.wasmPath, { encoding: null });
      wasmContent = wasmData instanceof Uint8Array ? wasmData : new TextEncoder().encode(wasmData as string);
    } catch (e) {
      remixAILogger.warn('[QuickDapp] Failed to read wasm file:', e);
    }

    try {
      const zkeyData = await this.call('fileManager', 'readFile', payload.zkeyPath, { encoding: null });
      zkeyContent = zkeyData instanceof Uint8Array ? zkeyData : new TextEncoder().encode(zkeyData as string);
    } catch (e) {
      remixAILogger.warn('[QuickDapp] Failed to read zkey file:', e);
    }

    // Create the new workspace
    await this.call('filePanel', 'createWorkspace', workspaceName, true);
    await this.call('filePanel' as any, 'switchToWorkspace', { name: workspaceName, isLocalhost: false });
    await new Promise(r => setTimeout(r, 300));

    // Create zk folder and copy artifacts
    try { await this.call('fileManager', 'mkdir', 'zk'); } catch (_) {}

    if (wasmContent) {
      try {
        await this.call('fileManager', 'writeFile', 'zk/circuit.wasm', wasmContent);
      } catch (e) {
        remixAILogger.warn('[QuickDapp] Failed to write wasm file:', e);
      }
    }

    if (zkeyContent) {
      try {
        await this.call('fileManager', 'writeFile', 'zk/circuit.zkey', zkeyContent);
      } catch (e) {
        remixAILogger.warn('[QuickDapp] Failed to write zkey file:', e);
      }
    }

    // Write verification key
    try {
      await this.call('fileManager', 'writeFile', 'zk/verification_key.json', JSON.stringify(payload.verificationKey, null, 2));
    } catch (e) {
      remixAILogger.warn('[QuickDapp] Failed to write verification key:', e);
    }

    const initialConfig = {
      _warning: 'DO NOT EDIT THIS FILE MANUALLY. MANAGED BY QUICK DAPP.',
      id,
      slug: workspaceName,
      name,
      workspaceName,
      appKind: 'zk-circuit',
      zkCircuit: {
        circuitName: payload.circuitName,
        circuitPath: payload.circuitPath,
        provingScheme: payload.provingScheme,
        primeValue: payload.primeValue,
        signalInputs: payload.signalInputs,
        zkArtifacts: {
          wasmPath: 'zk/circuit.wasm',
          zkeyPath: 'zk/circuit.zkey',
          vkeyPath: 'zk/verification_key.json'
        },
        zkVerifyConfig: payload.zkVerifyNetwork ? { network: payload.zkVerifyNetwork } : undefined
      },
      sourceWorkspace: {
        name: sourceWorkspaceName,
        filePath: payload.circuitPath
      },
      status: 'creating',
      processingStartedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      config: {
        title: name,
        details: payload.userDescription || 'ZK DApp with in-browser proof generation and zkVerify verification'
      }
    };

    await this.call('fileManager', 'writeFile', 'dapp.config.json', JSON.stringify(initialConfig, null, 2));
    try { await this.call('fileManager', 'mkdir', 'src'); } catch (_) {}

    remixAILogger.log('[QuickDapp] createZkDappWorkspace done', { slug: workspaceName });
    return { slug: workspaceName, workspaceName };
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
    contracts?: QuickDappContractInput[];
    primaryContractId?: string;
    isBaseMiniApp?: boolean;
    graphContext?: any;
  }): Promise<{ slug: string; workspaceName: string }> {
    const DAPP_WORKSPACE_PREFIX = 'dapp-';

    // ── Payload validation ──
    if (!payload.address || typeof payload.address !== 'string' || !payload.address.startsWith('0x')) {
      throw new Error(`createDappWorkspace: Invalid contract address: ${payload.address}`);
    }
    if (!Array.isArray(payload.abi) || payload.abi.length === 0) {
      throw new Error(`createDappWorkspace: ABI must be a non-empty array`);
    }
    if (!payload.chainId || payload.chainId === '-' || String(payload.chainId) === 'undefined') {
      // AI may pass network.id ("-") instead of the provider name ("vm-osaka").
      // Resolve the actual provider to get a valid chainId.
      let resolved: string | null = null;
      try {
        resolved = await this.call('blockchain' as any, 'getProvider');
      } catch (_) {}
      remixAILogger.warn(`[QuickDapp] chainId invalid ("${payload.chainId}"), resolved from provider: "${resolved}"`);
      payload.chainId = resolved || 'vm-osaka';
    }

    const hasExplicitContracts = Array.isArray(payload.contracts) && payload.contracts.length > 0;
    const singleContractInput: QuickDappContractInput = {
      name: payload.contractName,
      address: payload.address,
      abi: payload.abi,
      chainId: payload.chainId,
      networkName: payload.networkName || getNetworkName(payload.chainId) || 'Unknown Network',
      sourceFilePath: payload.sourceFilePath
    };
    const contractSelection = hasExplicitContracts
      ? createQuickDappContractSelection(
        payload.contracts.map((contract) => ({
          ...contract,
          networkName: contract.networkName || getNetworkName(contract.chainId) || 'Unknown Network'
        })),
        payload.primaryContractId
      )
      : createQuickDappContractSelection([singleContractInput]);
    const isMultiContract = contractSelection.contracts.length > 1;

    if (isMultiContract) {
      const actualProvider = await this.call('blockchain' as any, 'getProvider') as string;
      const currentEnvironment = actualProvider?.startsWith('vm')
        ? actualProvider
        : await this.call('blockchain' as any, 'sendRpc', 'eth_chainId') as string;
      if (currentEnvironment === undefined ||
        normalizeQuickDappEnvironment(contractSelection.primary.chainId) !== normalizeQuickDappEnvironment(currentEnvironment)) {
        throw new Error('createDappWorkspace: Selected contracts do not match the current execution environment');
      }

      for (const contract of contractSelection.contracts) {
        const code = await this.call('blockchain' as any, 'getCode', contract.address) as string;
        if (!code || code === '0x' || code === '0x0') {
          throw new Error(`createDappWorkspace: No deployed code found at ${contract.address}`);
        }
      }
    }

    const primaryContract = contractSelection.primary;
    const name = primaryContract.name || 'Untitled';
    const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
    const slugSuffix = isMultiContract ? id.slice(-6) : id.slice(0, 6);
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${slugSuffix}`;
    const workspaceName = `${DAPP_WORKSPACE_PREFIX}${slug}`;
    const timestamp = Date.now();

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
    if (isMultiContract && await this.call('filePanel' as any, 'workspaceExists', workspaceName)) {
      throw new Error(`createDappWorkspace: Workspace already exists: ${workspaceName}`);
    }

    // Capture VM state if on VM provider
    let vmStateSnapshot: string | null = null;
    const vmProviderName = primaryContract.chainId && String(primaryContract.chainId).startsWith('vm-')
      ? String(primaryContract.chainId) : null;

    if (isMultiContract && vmProviderName) {
      const saveEvmState = await this.call('config' as any, 'getAppParameter', 'settings/save-evm-state');
      if (saveEvmState !== true) {
        throw new Error('createDappWorkspace: Enable "Save environment state" in Settings before creating a multi-contract DApp on Remix VM');
      }
    }

    if (vmProviderName && isMultiContract) {
      try {
        const capturedState = await Promise.race([
          this.call('blockchain' as any, 'getStateDetails'),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ]) as string;
        if (capturedState && capturedState.length > 2) vmStateSnapshot = capturedState;
      } catch (e) {
        remixAILogger.warn('[QuickDapp] Could not capture the selected contracts VM state:', e);
      }
    } else if (vmProviderName) {
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

        if (!vmStateSnapshot) {
          try {
            const directState = await Promise.race([
              this.call('blockchain' as any, 'getStateDetails'),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
            ]) as string;
            if (directState && directState.length > 2) {
              vmStateSnapshot = directState;
            }
          } catch (e2) {
            remixAILogger.warn('[QuickDapp] getStateDetails fallback also failed:', e2);
          }
        }
      } catch (e) {
        remixAILogger.warn('[QuickDapp] VM state capture failed (non-critical):', e);
      }
    }

    if (isMultiContract && vmProviderName && !vmStateSnapshot) {
      throw new Error('createDappWorkspace: Could not capture Remix VM state for all selected contracts');
    }

    const contractConfigFields = buildQuickDappContractConfigFields(contractSelection);
    const initialConfig = {
      _warning: 'DO NOT EDIT THIS FILE MANUALLY. MANAGED BY QUICK DAPP.',
      id,
      slug: workspaceName,
      name,
      workspaceName,
      appKind: 'contract',
      ...contractConfigFields,
      sourceWorkspace: {
        name: sourceWorkspaceName,
        filePath: primaryContract.sourceFilePath || ''
      },
      status: 'creating',
      processingStartedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      config: {
        title: name,
        details: 'Generated by AI',
        isBaseMiniApp: payload.isBaseMiniApp || false
      },
      dataSources: payload.graphContext ? {
        theGraph: [payload.graphContext]
      } : undefined
    };
    const initialConfigJson = JSON.stringify(initialConfig, null, 2);

    // Pin every selected contract, but keep a single primary mapping for navigation.
    const createdSourcePinPaths: string[] = [];
    const sourceMappingPath = `.deploys/dapp-mappings/${primaryContract.address}_${workspaceName}.json`;
    let sourceMappingCreated = false;
    let workspaceCreatedByThisCall = false;
    const rollbackMultiContractCreation = async () => {
      if (!isMultiContract) return;

      let sourceWorkspaceRestored = false;
      try {
        const currentWorkspace = await this.call('filePanel' as any, 'getCurrentWorkspace');
        if (currentWorkspace?.name !== sourceWorkspaceName) {
          await this.call('filePanel' as any, 'switchToWorkspace', { name: sourceWorkspaceName, isLocalhost: false });
        }
        sourceWorkspaceRestored = true;
      } catch (restoreError) {
        remixAILogger.warn('[QuickDapp] Could not switch back to the source workspace during rollback:', restoreError);
      }

      if (sourceWorkspaceRestored) {
        if (sourceMappingCreated) {
          try { await this.call('fileManager', 'remove', sourceMappingPath); } catch (_) {}
        }
        for (const pinPath of createdSourcePinPaths) {
          try { await this.call('fileManager', 'remove', pinPath); } catch (_) {}
        }
      }

      if (sourceWorkspaceRestored && workspaceCreatedByThisCall) {
        try {
          await this.call('filePanel' as any, 'deleteWorkspace', workspaceName);
        } catch (_) {}
      }
    };

    try { await this.call('fileManager', 'mkdir', '.deploys'); } catch (_) {}
    try { await this.call('fileManager', 'mkdir', '.deploys/pinned-contracts'); } catch (_) {}
    try { await this.call('fileManager', 'mkdir', '.deploys/dapp-mappings'); } catch (_) {}
    for (const contract of contractSelection.contracts) {
      try {
        const pinnedData = {
          name: contract.name,
          address: contract.address,
          abi: contract.abi,
          filePath: contract.sourceFilePath ? `${sourceWorkspaceName}/${contract.sourceFilePath}` : '',
          pinnedAt: timestamp
        };
        const pinPath = `.deploys/pinned-contracts/${contract.chainId}/${contract.address}.json`;
        try { await this.call('fileManager', 'mkdir', `.deploys/pinned-contracts/${contract.chainId}`); } catch (_) {}
        const preserveExistingPin = isMultiContract && await this.call('fileManager', 'exists', pinPath);
        if (!preserveExistingPin) {
          await this.call('fileManager', 'writeFile', pinPath, JSON.stringify(pinnedData, null, 2));
          if (isMultiContract) createdSourcePinPaths.push(pinPath);
        }

        if (contract.id === contractSelection.primaryContractId) {
          const dappMapping = {
            address: contract.address,
            dappWorkspace: workspaceName,
            sourceWorkspace: sourceWorkspaceName,
            chainId: contract.chainId,
            createdAt: timestamp
          };
          const preserveExistingMapping = isMultiContract && await this.call('fileManager', 'exists', sourceMappingPath);
          if (!preserveExistingMapping) {
            await this.call('fileManager', 'writeFile', sourceMappingPath, JSON.stringify(dappMapping, null, 2));
            if (isMultiContract) sourceMappingCreated = true;
          }
        }
      } catch (e) {
        if (isMultiContract) {
          await rollbackMultiContractCreation();
          throw new Error(`createDappWorkspace: Could not pin ${contract.address} in the source workspace: ${e?.message || e}`);
        }
        remixAILogger.warn(`[QuickDapp] Auto-pin failed for ${contract.address} (non-critical):`, e);
      }
    }

    try {
      await this.call('filePanel', 'createWorkspace', workspaceName, true);
      workspaceCreatedByThisCall = true;
      await this.call('filePanel' as any, 'switchToWorkspace', { name: workspaceName, isLocalhost: false });
      await new Promise(r => setTimeout(r, 300));
      await this.call('fileManager', 'writeFile', 'dapp.config.json', initialConfigJson);
    } catch (e) {
      await rollbackMultiContractCreation();
      throw e;
    }
    try { await this.call('fileManager', 'mkdir', 'src'); } catch (_) {}

    if (vmStateSnapshot && vmProviderName) {
      try {
        try { await this.call('fileManager', 'mkdir', '.states'); } catch (_) {}
        try { await this.call('fileManager', 'mkdir', `.states/${vmProviderName}`); } catch (_) {}
        await this.call('fileManager', 'writeFile', `.states/${vmProviderName}/state.json`, vmStateSnapshot);

        // Explicitly reload VM state into memory.
        await this.call('blockchain' as any, 'loadContext', vmProviderName);

        if (isMultiContract) {
          for (const contract of contractSelection.contracts) {
            const code = await this.call('blockchain' as any, 'getCode', contract.address) as string;
            if (!code || code === '0x' || code === '0x0') {
              throw new Error(`No restored bytecode found at ${contract.address}`);
            }
          }
        }
      } catch (e) {
        if (isMultiContract) {
          await rollbackMultiContractCreation();
          throw new Error(`createDappWorkspace: Could not restore all selected Remix VM contracts: ${e?.message || e}`);
        }
        remixAILogger.warn('[QuickDapp] VM state restore failed (non-critical):', e);
      }
    }

    try { await this.call('fileManager', 'mkdir', '.deploys'); } catch (_) {}
    try { await this.call('fileManager', 'mkdir', '.deploys/pinned-contracts'); } catch (_) {}
    const existingContracts = await this.call('udappDeployedContracts' as any, 'getDeployedContracts').catch(() => null) as any[] | null;
    const knownAddresses = new Set((existingContracts || []).map((contract: any) => contract.address?.toLowerCase()));
    for (const contract of contractSelection.contracts) {
      const pinnedData = {
        name: contract.name,
        address: contract.address,
        abi: contract.abi,
        filePath: contract.sourceFilePath ? `${sourceWorkspaceName}/${contract.sourceFilePath}` : '',
        pinnedAt: Date.now()
      };
      try {
        const pinnedPath = `.deploys/pinned-contracts/${contract.chainId}/${contract.address}.json`;
        try { await this.call('fileManager', 'mkdir', `.deploys/pinned-contracts/${contract.chainId}`); } catch (_) {}
        await this.call('fileManager', 'writeFile', pinnedPath, JSON.stringify(pinnedData, null, 2));
      } catch (e) {
        if (isMultiContract) {
          await rollbackMultiContractCreation();
          throw new Error(`createDappWorkspace: Could not pin ${contract.address} in the DApp workspace: ${e?.message || e}`);
        }
        remixAILogger.warn(`[QuickDapp] DApp workspace pin failed for ${contract.address} (non-critical):`, e);
        continue;
      }
      if (existingContracts && !knownAddresses.has(contract.address.toLowerCase())) {
        try {
          await this.call(
            'udappDeployedContracts' as any, 'addInstance',
            contract.address,
            contract.abi,
            contract.name,
            null,
            pinnedData.pinnedAt
          );
          knownAddresses.add(contract.address.toLowerCase());
        } catch (e) {
          remixAILogger.warn(`[QuickDapp] DApp workspace contract UI refresh failed for ${contract.address} (non-critical):`, e);
        }
      }
    }

    remixAILogger.log('[QuickDapp] createDappWorkspace done', { slug: workspaceName });
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
    remixAILogger.log('[QuickDapp] listDapps called')
    try {
      const allWorkspaces = await this.call('filePanel', 'getWorkspacesForPlugin')
      if (!allWorkspaces || !Array.isArray(allWorkspaces)) {
        remixAILogger.log('[QuickDapp] No workspaces found')
        return []
      }

      const dappWorkspaces = allWorkspaces
        .map((ws: any) => typeof ws === 'string' ? ws : ws.name)
        .filter((name: string) => name && name.startsWith('dapp-'))

      remixAILogger.log('[QuickDapp] Found', dappWorkspaces.length, 'dapp workspaces')

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
          remixAILogger.warn('[QuickDapp] Failed to read config for', wsName, e)
        }
      }

      remixAILogger.log('[QuickDapp] listDapps returned', results.length, 'dapps')
      return results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    } catch (e) {
      remixAILogger.error('[QuickDapp] listDapps failed:', e)
      return []
    }
  }

}
