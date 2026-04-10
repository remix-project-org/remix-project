import { v4 as uuidv4 } from 'uuid';
import { PluginClient } from '@remixproject/plugin';
import { DappConfig } from '../types/dapp';

const DAPP_WORKSPACE_PREFIX = 'dapp-';
const CONFIG_FILENAME = 'dapp.config.json';

export class DappManager {
  private plugin: PluginClient;

  constructor(plugin: PluginClient) {
    this.plugin = plugin;
  }

  private normalizeLogo(logo: any): string | null {
    if (!logo) return null;

    if (typeof logo === 'string') {
      if (logo === '[object Object]') return null;
      return logo;
    }

    if (logo && logo.type === 'Buffer' && Array.isArray(logo.data)) {
      try {
        const base64 = btoa(
          new Uint8Array(logo.data).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        return `data:image/jpeg;base64,${base64}`;
      } catch (e) {
        console.warn('[DappManager] Failed to convert Buffer logo', e);
        return null;
      }
    }

    if (logo instanceof ArrayBuffer || logo instanceof Uint8Array || (logo as any).buffer) {
      try {
        const buffer = logo instanceof ArrayBuffer ? logo : (logo as any).buffer || logo;
        const base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        return `data:image/jpeg;base64,${base64}`;
      } catch (e) {
        return null;
      }
    }

    return null;
  }

  private sanitizeConfig(config: DappConfig): DappConfig {
    if (config.config && config.config.logo) {
      config.config.logo = this.normalizeLogo(config.config.logo) as string | undefined;
    }
    return config;
  }

  private async getCurrentWorkspace(): Promise<{ name: string; isLocalhost: boolean }> {
    const workspace = await this.plugin.call('filePanel', 'getCurrentWorkspace');
    if (!workspace || !workspace.name) {
      return { name: 'default_workspace', isLocalhost: false };
    }
    return workspace;
  }

  private cachedWorkspaces: { name: string }[] | null = null;

  /**
   * Invalidates the workspace cache. Call this when workspaces are added/deleted
   * to ensure getDapps() returns fresh data.
   */
  invalidateCache(): void {
    this.cachedWorkspaces = null;
  }

  private async getWorkspaces(): Promise<{ name: string }[]> {
    try {
      const workspaces = await (this.plugin as any).call('filePanel', 'getWorkspacesForPlugin');

      if (workspaces && Array.isArray(workspaces) && workspaces.length > 0) {
        const result = workspaces.map((ws: any) => ({
          name: typeof ws === 'string' ? ws : (ws.name || ws)
        })).filter(ws => ws.name && ws.name !== 'null' && ws.name !== null);

        this.cachedWorkspaces = result;
        return result;
      }
    } catch (e) {
      // API call failed, will try cache
    }

    if (this.cachedWorkspaces && this.cachedWorkspaces.length > 0) {
      return this.cachedWorkspaces;
    }

    return [];
  }

  private async switchToWorkspace(workspaceName: string): Promise<void> {
    if (!workspaceName || workspaceName === 'null') {
      console.warn('[DappManager] Attempted to switch to null/invalid workspace, ignoring');
      return;
    }
    await (this.plugin as any).call('filePanel', 'switchToWorkspace', { name: workspaceName, isLocalhost: false });
  }

  private async focusPlugin(): Promise<void> {
    try {
      // @ts-ignore
      await this.plugin.call('tabs', 'focus', 'quick-dapp-v2');
    } catch (e) {
      console.warn('[DappManager] Failed to focus plugin:', e);
    }
  }

  private async collectSolidityFiles(
    entryFilePath: string,
    collected: Map<string, string> = new Map()
  ): Promise<Map<string, string>> {
    if (collected.has(entryFilePath)) {
      return collected;
    }

    try {
      const content = await this.plugin.call('fileManager', 'readFile', entryFilePath);
      collected.set(entryFilePath, content);

      const importRegex = /import\s+(?:.*\s+from\s+)?["'](\.[^"']+)["']/g;
      let match;

      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];

        const entryDir = entryFilePath.substring(0, entryFilePath.lastIndexOf('/')) || '.';
        const resolvedPath = this.resolvePath(entryDir, importPath);

        await this.collectSolidityFiles(resolvedPath, collected);
      }
    } catch (e) {
      console.warn(`[DappManager] Failed to read ${entryFilePath}:`, e);
    }

    return collected;
  }

  private resolvePath(basePath: string, relativePath: string): string {
    const baseParts = basePath.split('/').filter(p => p && p !== '.');
    const relativeParts = relativePath.split('/');

    for (const part of relativeParts) {
      if (part === '..') {
        baseParts.pop();
      } else if (part !== '.') {
        baseParts.push(part);
      }
    }

    return baseParts.join('/');
  }

  async getDapps(): Promise<DappConfig[]> {
    try {
      const workspaces = await this.getWorkspaces();
      if (!workspaces || !Array.isArray(workspaces)) {
        return [];
      }

      const currentWorkspace = await this.getCurrentWorkspace();

      const configs: DappConfig[] = [];

      const targetWorkspaces = [...workspaces];

      if (currentWorkspace && currentWorkspace.name && !targetWorkspaces.find(w => w.name === currentWorkspace.name)) {
        targetWorkspaces.push({ name: currentWorkspace.name });
      }

      for (const ws of targetWorkspaces) {
        const workspaceName = ws.name;
        if (!workspaceName) continue;

        try {
          const hasConfig = await (this.plugin as any).call('filePanel', 'existsInWorkspace', workspaceName, CONFIG_FILENAME);
          if (!hasConfig) continue;

          let content;
          try {
            content = await (this.plugin as any).call('filePanel', 'readFileFromWorkspace', workspaceName, CONFIG_FILENAME);
          } catch (err) {
            continue;
          }

          if (content) {
            const config = JSON.parse(content);
            config.workspaceName = workspaceName;
            config.slug = workspaceName;

            try {
              const hasPreview = await (this.plugin as any).call('filePanel', 'existsInWorkspace', workspaceName, 'preview.png');
              if (hasPreview) {
                const previewContent = await (this.plugin as any).call('filePanel', 'readFileFromWorkspace', workspaceName, 'preview.png');
                if (previewContent) {
                  config.thumbnailPath = previewContent;
                }
              }
            } catch (e) {}

            configs.push(this.sanitizeConfig(config));

          }
        } catch (e) {
          console.warn(`[DappManager] Failed to read config for workspace ${workspaceName}`, e);
        }
      }

      const uniqueConfigs = configs.filter((config, index, self) =>
        index === self.findIndex((c) => c.id === config.id)
      );

      return (uniqueConfigs || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch (e) {
      console.error('[DappManager] Critical error loading dapps:', e);
      return [];
    }
  }

  async createDapp(name: string, contractData: any, isBaseMiniApp: boolean = false): Promise<DappConfig> {
    if (!name || name.trim() === '') {
      name = contractData?.name || 'UnnamedContract';
    }

    const id = uuidv4();
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${id.slice(0, 6)}`;
    const workspaceName = `${DAPP_WORKSPACE_PREFIX}${slug}`;
    const timestamp = Date.now();

    const sourceWorkspaceInfo = await this.getCurrentWorkspace();
    const sourceWorkspaceName = sourceWorkspaceInfo.name;

    // Block creating DApps from within a dapp workspace.
    if (sourceWorkspaceName.startsWith(DAPP_WORKSPACE_PREFIX)) {
      throw new Error(
        'Cannot create a DApp from within a DApp workspace. ' +
        'Please switch to the original contract workspace first.'
      );
    }

    if (contractData.sourceFilePath && contractData.sourceFilePath.includes('/')) {
      const parts = contractData.sourceFilePath.split('/');
      const possibleWorkspace = parts[0];

      if (possibleWorkspace !== sourceWorkspaceName) {
        try {
          const wsExists = await (this.plugin as any).call('filePanel', 'workspaceExists', possibleWorkspace);
          if (wsExists) {
            await this.switchToWorkspace(possibleWorkspace);
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        } catch (e) {
          console.warn(`[DappManager] Could not switch to workspace "${possibleWorkspace}":`, e);
        }
      }
    }

    const currentWs = await this.getCurrentWorkspace();
    if (currentWs.name !== sourceWorkspaceName) {
      await this.switchToWorkspace(sourceWorkspaceName);
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    await this.autoPinInstance(
      contractData.address,
      contractData.name,
      contractData.abi,
      contractData.sourceFilePath || '',
      contractData.chainId,
      workspaceName
    );

    // Preserve VM state: the VM reads .states/{provider}/state.json per workspace.
    // Without copying, switching to a new workspace resets the VM and loses deployed contracts.
    let vmStateSnapshot: string | null = null;
    const vmProviderName = contractData.chainId && String(contractData.chainId).startsWith('vm-')
      ? String(contractData.chainId) : null;
    if (vmProviderName) {
      try {
        // Flush the latest in-memory state to disk first (with timeout to prevent hang)
        try {
          await Promise.race([
            (this.plugin as any).call('blockchain', 'dumpState'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('dumpState timeout')), 2000))
          ]);
        } catch (_) { /* non-critical: dumpState may timeout */ }
        await new Promise(resolve => setTimeout(resolve, 100));

        const statePath = `.states/${vmProviderName}/state.json`;
        const stateExists = await (this.plugin as any).call('fileManager', 'exists', statePath);
        if (stateExists) {
          vmStateSnapshot = await this.plugin.call('fileManager', 'readFile', statePath) as string;
        }
      } catch (e) {
        console.warn('[DappManager] Could not capture VM state (non-critical):', e);
      }
    }

    // [DISABLED] Collect contract source files (with imports) before switching workspace
    // Temporarily commented out per feedback — do not delete
    // let contractSourceFiles: Map<string, string> = new Map();
    // if (contractData.sourceFilePath) {
    //   try {
    //     contractSourceFiles = await this.collectSolidityFiles(contractData.sourceFilePath);
    //   } catch (e) {
    //     console.warn('[DappManager] Failed to collect contract files (non-critical):', e);
    //   }
    // }

    await this.plugin.call('filePanel', 'createWorkspace', workspaceName, true);

    await this.switchToWorkspace(workspaceName);
    await new Promise(resolve => setTimeout(resolve, 300));

    const initialConfig: DappConfig = {
      _warning: "DO NOT EDIT THIS FILE MANUALLY. MANAGED BY QUICK DAPP.",
      id,
      slug: workspaceName,
      name,
      workspaceName,
      contract: {
        address: contractData.address,
        name: contractData.name,
        abi: contractData.abi,
        chainId: contractData.chainId,
        networkName: contractData.networkName || 'Unknown Network'
      },
      sourceWorkspace: {
        name: sourceWorkspaceName,
        filePath: contractData.sourceFilePath || ''
      },
      status: 'creating',
      processingStartedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      config: {
        title: name,
        details: 'Generated by AI',
        isBaseMiniApp: isBaseMiniApp
      }
    };

    await this.saveConfig(workspaceName, initialConfig);

    try {
      await this.plugin.call('fileManager', 'mkdir', 'src');
    } catch (e) {
      // ignore if src folder already exists
    }

    // Notify user about the new workspace
    try {
      // @ts-ignore
      await this.plugin.call('notification', 'modal', {
        id: 'quick-dapp-workspace-created',
        title: 'Workspace Created',
        message: `A new workspace '${workspaceName}' has been created for your DApp.\n\nAll generated files will be stored in this workspace.`,
        modalType: 'alert',
        okLabel: 'OK',
      });
    } catch (e) { /* non-critical */ }

    // [DISABLED] Copy contract source files to the dapp workspace, preserving folder structure
    // Temporarily commented out per feedback — do not delete
    // if (contractSourceFiles.size > 0) {
    //   for (const [filePath, content] of contractSourceFiles) {
    //     try {
    //       const parts = filePath.split('/');
    //       for (let i = 1; i < parts.length; i++) {
    //         const dir = parts.slice(0, i).join('/');
    //         try { await this.plugin.call('fileManager', 'mkdir', dir); } catch (_) {}
    //       }
    //       await this.plugin.call('fileManager', 'writeFile', filePath, content);
    //     } catch (e) {
    //       console.warn(`[DappManager] Failed to copy ${filePath}:`, e);
    //     }
    //   }
    // }

    // Restore VM state in the new DApp workspace.
    if (vmStateSnapshot && vmProviderName) {
      const foldersToWrite = [vmProviderName];
      try {
        try { await this.plugin.call('fileManager', 'mkdir', '.states'); } catch (_) {}
        for (const folder of foldersToWrite) {
          try { await this.plugin.call('fileManager', 'mkdir', `.states/${folder}`); } catch (_) {}
          await (this.plugin as any).call(
            'fileManager', 'writeFile',
            `.states/${folder}/state.json`,
            vmStateSnapshot,
            { silent: true }
          );
        }
      } catch (e) {
        console.warn('[DappManager] Failed to restore VM state (non-critical):', e);
      }
    }

    // Pin contract instance in the dapp workspace so it appears in Deployed Contracts
    try {
      const pinnedContractData = {
        name: contractData.name,
        address: contractData.address,
        abi: contractData.abi,
        filePath: contractData.sourceFilePath
          ? `${sourceWorkspaceName}/${contractData.sourceFilePath}`
          : '',
        pinnedAt: Date.now()
      };
      const pinnedChainId = contractData.chainId;
      const pinnedPath = `.deploys/pinned-contracts/${pinnedChainId}/${contractData.address}.json`;

      try { await this.plugin.call('fileManager', 'mkdir', '.deploys'); } catch (_) {}
      try { await this.plugin.call('fileManager', 'mkdir', '.deploys/pinned-contracts'); } catch (_) {}
      try { await this.plugin.call('fileManager', 'mkdir', `.deploys/pinned-contracts/${pinnedChainId}`); } catch (_) {}

      await (this.plugin as any).call(
        'fileManager', 'writeFile',
        pinnedPath,
        JSON.stringify(pinnedContractData, null, 2),
        { silent: true }
      );
      console.log('[DappManager] Contract pinned in dapp workspace:', pinnedPath);

      // Notify the Deployed Contracts UI so it shows immediately without workspace switch
      try {
        const existingContracts = await (this.plugin as any).call(
          'udappDeployedContracts', 'getDeployedContracts'
        );
        const alreadyExists = existingContracts?.some?.(
          (c: any) => c.address?.toLowerCase() === contractData.address?.toLowerCase()
        );
        if (!alreadyExists) {
          await (this.plugin as any).call(
            'udappDeployedContracts', 'addInstance',
            contractData.address,
            contractData.abi,
            contractData.name,
            null,
            pinnedContractData.pinnedAt
          );
        }
      } catch (_) {
        // Non-critical: UI will refresh on next workspace switch
      }
    } catch (e) {
      console.warn('[DappManager] Failed to pin contract in dapp workspace (non-critical):', e);
    }

    await this.focusPlugin();

    // Farcaster manifest (.well-known/farcaster.json) removed — Base App uses standard web app model (April 2026)

    await this.focusPlugin();

    return initialConfig;
  }

  /**
   * Auto-pins the contract instance in the current workspace before switching.
   * This saves the contract to .deploys/pinned-contracts/{chainId}/{address}.json
   * Also saves a dapp-mapping file for Go to DApp navigation.
   */
  private async autoPinInstance(
    address: string,
    name: string,
    abi: any[],
    filePath: string,
    chainId: number | string,
    dappWorkspace: string
  ): Promise<void> {
    try {
      if (!chainId) {
        return;
      }

      const workspace = await this.getCurrentWorkspace();

      const objToSave = {
        name,
        address,
        abi,
        filePath: filePath ? `${workspace.name}/${filePath}` : '',
        pinnedAt: Date.now()
      };

      const savePath = `.deploys/pinned-contracts/${chainId}/${address}.json`;

      await (this.plugin as any).call(
        'fileManager',
        'writeFile',
        savePath,
        JSON.stringify(objToSave, null, 2),
        { silent: true }
      );

      const dappMappingPath = `.deploys/dapp-mappings/${address}_${dappWorkspace}.json`;
      const dappMapping = {
        address,
        dappWorkspace,
        sourceWorkspace: workspace.name,
        chainId,
        createdAt: Date.now()
      };
      await (this.plugin as any).call(
        'fileManager',
        'writeFile',
        dappMappingPath,
        JSON.stringify(dappMapping, null, 2),
        { silent: true }
      );
    } catch (e) {
      console.warn('[DappManager] Failed to auto-pin instance:', e);
    }

  }

  async saveConfig(workspaceName: string, config: DappConfig): Promise<void> {
    const currentWorkspace = await this.getCurrentWorkspace();

    if (currentWorkspace.name !== workspaceName) {
      await this.switchToWorkspace(workspaceName);
    }

    config.updatedAt = Date.now();
    const sanitized = this.sanitizeConfig(config);
    const content = JSON.stringify(sanitized, null, 2);
    await (this.plugin as any).call('fileManager', 'writeFile', CONFIG_FILENAME, content, { silent: true });

    if (currentWorkspace.name !== workspaceName) {
      await this.switchToWorkspace(currentWorkspace.name);
    }

    if (currentWorkspace.name !== workspaceName) {
      await this.focusPlugin();
    }
  }

  async saveGeneratedFiles(slug: string, pages: Record<string, string>) {
    const workspaceName = slug;
    const currentWorkspace = await this.getCurrentWorkspace();

    if (currentWorkspace.name !== workspaceName) {
      await this.switchToWorkspace(workspaceName);
    }

    if (!pages || Object.keys(pages).length === 0) {
      console.warn('[DEBUG-MANAGER] ⚠️ No pages to save.');
      return;
    }

    for (const [rawFilename, content] of Object.entries(pages)) {
      const safeParts = rawFilename.replace(/\\/g, '/')
        .split('/')
        .filter(part => part !== '..' && part !== '.' && part !== '');

      if (safeParts.length === 0) continue;

      const fullPath = safeParts.join('/');

      if (safeParts.length > 1) {
        const subFolders = safeParts.slice(0, -1);
        let currentPath = '';
        for (const folder of subFolders) {
          currentPath = currentPath ? `${currentPath}/${folder}` : folder;
          try {
            await this.plugin.call('fileManager', 'mkdir', currentPath);
          } catch (e) {}
        }
      }

      try {
        await (this.plugin as any).call('fileManager', 'writeFile', fullPath, content, { silent: true });
      } catch (e) {
        console.error(`[DEBUG-MANAGER] ❌ Failed to write ${fullPath}:`, e);
      }
    }

    if (currentWorkspace.name !== workspaceName) {
      await this.switchToWorkspace(currentWorkspace.name);
      await this.focusPlugin();
    }
  }

  async deleteDapp(workspaceName: string): Promise<void> {
    const t0 = Date.now();
    console.log(`[QuickDapp:delete] DappManager.deleteDapp START: ws="${workspaceName}"`);
    let dappConfig: DappConfig | null = null;
    try {
      const content = await (this.plugin as any).call(
        'filePanel', 'readFileFromWorkspace', workspaceName, CONFIG_FILENAME
      );
      if (content) {
        dappConfig = JSON.parse(content);
      }
      console.log(`[QuickDapp:delete] DappManager.deleteDapp config read: slug="${dappConfig?.slug}" sourceWs="${dappConfig?.sourceWorkspace?.name}" (${Date.now() - t0}ms)`);
    } catch (e) {
      console.warn('[QuickDapp:delete] DappManager.deleteDapp config read failed (proceeding):', e);
    }

    try {
      console.log(`[QuickDapp:delete] DappManager.deleteDapp calling filePanel.deleteWorkspace("${workspaceName}")...`);
      await this.plugin.call('filePanel', 'deleteWorkspace', workspaceName);
      console.log(`[QuickDapp:delete] DappManager.deleteDapp deleteWorkspace done (${Date.now() - t0}ms)`);
    } catch (e) {
      console.error('[QuickDapp:delete] DappManager.deleteDapp deleteWorkspace FAILED:', e);
    }

    const sourceWs = dappConfig?.sourceWorkspace?.name || 'default_workspace';
    try {
      await this.switchToWorkspace(sourceWs);
      console.log(`[QuickDapp:delete] DappManager.deleteDapp switched to "${sourceWs}" (${Date.now() - t0}ms)`);
    } catch (e) {
      try { await this.switchToWorkspace('default_workspace'); } catch {}
    }

    if (dappConfig?.sourceWorkspace?.name && dappConfig?.contract?.address) {
      const mappingPath = `.deploys/dapp-mappings/${dappConfig.contract.address}_${workspaceName}.json`;
      try {
        await (this.plugin as any).call('fileManager', 'remove', mappingPath);
        console.log(`[QuickDapp:delete] DappManager.deleteDapp mapping removed: ${mappingPath}`);
      } catch (e) {}
    }

    await this.focusPlugin();
    console.log(`[QuickDapp:delete] DappManager.deleteDapp END: total=${Date.now() - t0}ms`);
  }

  /**
   * Removes the dapp-mapping file from the source workspace after a DApp is deleted.
   * Uses cross-workspace check to minimize workspace switching.
   */
  private async cleanupDappMappings(
    sourceWorkspace: string,
    address: string,
    dappWorkspace: string
  ): Promise<void> {
    try {
      const mappingPath = `.deploys/dapp-mappings/${address}_${dappWorkspace}.json`;

      // Check if the mapping file exists without switching workspaces
      const exists = await (this.plugin as any).call(
        'filePanel', 'existsInWorkspace', sourceWorkspace, mappingPath
      );
      if (!exists) return;

      // File exists — need to switch to source workspace to remove it
      const currentWs = await this.getCurrentWorkspace();
      const needSwitch = currentWs.name !== sourceWorkspace;

      if (needSwitch) {
        await this.switchToWorkspace(sourceWorkspace);
      }

      await (this.plugin as any).call('fileManager', 'remove', mappingPath);

      if (needSwitch) {
        // Switch back only if the original workspace still exists (wasn't the deleted one)
        try {
          const wsExists = await (this.plugin as any).call(
            'filePanel', 'workspaceExists', currentWs.name
          );
          if (wsExists) {
            await this.switchToWorkspace(currentWs.name);
          }
        } catch (e) {
          // Original workspace gone, stay on source workspace
        }
      }
    } catch (e) {
      console.warn('[DappManager] Failed to cleanup dapp-mappings:', e);
    }
  }

  async deleteAllDapps(): Promise<void> {
    const t0 = Date.now();
    const dapps = await this.getDapps();
    const workspacesToDelete = dapps.map(dapp => dapp.workspaceName);
    console.log(`[QuickDapp:delete] DappManager.deleteAllDapps START: count=${workspacesToDelete.length} workspaces=[${workspacesToDelete}]`);

    const allWorkspaces = await this.getWorkspaces();
    const nonDappWorkspace = allWorkspaces.find(ws => !ws.name.startsWith(DAPP_WORKSPACE_PREFIX));
    console.log(`[QuickDapp:delete] DappManager.deleteAllDapps allWorkspaces=${allWorkspaces.length} nonDapp="${nonDappWorkspace?.name}"`);

    if (nonDappWorkspace) {
      console.log(`[QuickDapp:delete] DappManager.deleteAllDapps switching to "${nonDappWorkspace.name}"`);
      await this.switchToWorkspace(nonDappWorkspace.name);
    } else {
      try {
        console.log(`[QuickDapp:delete] DappManager.deleteAllDapps creating default_workspace`);
        await this.plugin.call('filePanel', 'createWorkspace', 'default_workspace', true);
        await this.switchToWorkspace('default_workspace');
      } catch (e) {
        console.warn('[QuickDapp:delete] DappManager.deleteAllDapps could not create default:', e);
      }
    }

    for (let i = 0; i < workspacesToDelete.length; i++) {
      const workspaceName = workspacesToDelete[i];
      try {
        console.log(`[QuickDapp:delete] DappManager.deleteAllDapps deleting [${i + 1}/${workspacesToDelete.length}] "${workspaceName}"...`);
        await this.plugin.call('filePanel', 'deleteWorkspace', workspaceName);
        console.log(`[QuickDapp:delete] DappManager.deleteAllDapps deleted [${i + 1}/${workspacesToDelete.length}] "${workspaceName}" (${Date.now() - t0}ms)`);
      } catch (e) {
        console.error(`[QuickDapp:delete] DappManager.deleteAllDapps FAILED [${i + 1}/${workspacesToDelete.length}] "${workspaceName}":`, e);
      }
    }

    await this.focusPlugin();
    console.log(`[QuickDapp:delete] DappManager.deleteAllDapps END: total=${Date.now() - t0}ms`);
  }

  async getDappConfig(workspaceName: string): Promise<DappConfig | null> {
    const currentWorkspace = await this.getCurrentWorkspace();

    try {
      if (currentWorkspace.name !== workspaceName) {
        await this.switchToWorkspace(workspaceName);
      }

      const content = await this.plugin.call('fileManager', 'readFile', CONFIG_FILENAME);

      if (content) {
        const config = JSON.parse(content);
        config.workspaceName = workspaceName;
        config.slug = workspaceName;

        try {
          const previewContent = await this.plugin.call('fileManager', 'readFile', 'preview.png');
          if (previewContent) {
            config.thumbnailPath = previewContent;
          }
        } catch (e) {}

        if (currentWorkspace.name !== workspaceName) {
          await this.switchToWorkspace(currentWorkspace.name);
          await this.focusPlugin();
        }

        return this.sanitizeConfig(config);
      }

      if (currentWorkspace.name !== workspaceName) {
        await this.switchToWorkspace(currentWorkspace.name);
        await this.focusPlugin();
      }
    } catch (e) {
      console.warn(`[DappManager] Failed to read config for ${workspaceName}`, e);

      if (currentWorkspace.name !== workspaceName) {
        try {
          await this.switchToWorkspace(currentWorkspace.name);
          await this.focusPlugin();
        } catch (switchErr) {}
      }
    }
    return null;
  }

  async updateDappConfig(workspaceName: string, updates: Partial<DappConfig>): Promise<DappConfig | null> {
    const currentWorkspace = await this.getCurrentWorkspace();

    try {
      if (currentWorkspace.name !== workspaceName) {
        await this.switchToWorkspace(workspaceName);
      }

      const content = await this.plugin.call('fileManager', 'readFile', CONFIG_FILENAME);

      if (!content) throw new Error('Config file not found');

      const currentConfig: DappConfig = JSON.parse(content);

      const newConfig: DappConfig = {
        ...currentConfig,
        ...updates,
        workspaceName,
        config: {
          ...currentConfig.config,
          ...(updates.config || {})
        },
        deployment: {
          ...currentConfig.deployment,
          ...(updates.deployment || {})
        },
        updatedAt: Date.now()
      };

      const sanitizedConfig = this.sanitizeConfig(newConfig);

      await (this.plugin as any).call('fileManager', 'writeFile', CONFIG_FILENAME, JSON.stringify(sanitizedConfig, null, 2), { silent: true });

      if (currentWorkspace.name !== workspaceName) {
        await this.switchToWorkspace(currentWorkspace.name);
        await this.focusPlugin();
      }

      if (currentWorkspace.name === workspaceName) {
        await this.focusPlugin();
      }

      return sanitizedConfig;

    } catch (e) {
      console.error('[DappManager] Failed to update config:', e);

      if (currentWorkspace.name !== workspaceName) {
        try {
          await this.switchToWorkspace(currentWorkspace.name);
          await this.focusPlugin();
        } catch (switchErr) {}
      }
      return null;
    }
  }

  async openDappWorkspace(workspaceName: string): Promise<void> {
    await this.switchToWorkspace(workspaceName);
    await this.focusPlugin();
  }
}