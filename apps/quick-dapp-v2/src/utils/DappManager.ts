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
    return await this.plugin.call('filePanel', 'getCurrentWorkspace');
  }

  private cachedWorkspaces: { name: string }[] | null = null;

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
    await (this.plugin as any).call('filePanel', 'switchToWorkspace', { name: workspaceName, isLocalhost: false });
  }

  private async focusPlugin(): Promise<void> {
    try {
      await this.plugin.call('manager', 'activatePlugin', 'quick-dapp-v2');
      // @ts-ignore
      await this.plugin.call('tabs', 'focus', 'quick-dapp-v2');
    } catch (e) {
      console.warn('[DappManager] Failed to focus plugin:', e);
    }
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
          await this.switchToWorkspace(workspaceName);

          let content;
          try {
            content = await this.plugin.call('fileManager', 'readFile', CONFIG_FILENAME);
          } catch (err) {
            continue;
          }

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

            configs.push(this.sanitizeConfig(config));

          }
        } catch (e) {
          console.warn(`[DappManager] Failed to read config for workspace ${workspaceName}`, e);
        }
      }

      if (currentWorkspace && currentWorkspace.name) {
        try {
          await this.switchToWorkspace(currentWorkspace.name);
        } catch (e) {
          console.warn('[DappManager] Failed to switch back to original workspace', e);
        }
      }

      await this.focusPlugin();

      return (configs || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch (e) {
      console.error('[DappManager] Critical error loading dapps:', e);
      await this.focusPlugin();
      return [];
    }
  }

  async createDapp(name: string, contractData: any, isBaseMiniApp: boolean = false): Promise<DappConfig> {
    const id = uuidv4();
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${id.slice(0, 6)}`;
    const workspaceName = `${DAPP_WORKSPACE_PREFIX}${slug}`;
    const timestamp = Date.now();

    await this.plugin.call('filePanel', 'createWorkspace', workspaceName, true);

    await this.switchToWorkspace(workspaceName);

    await this.focusPlugin();

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
      status: 'draft',
      createdAt: timestamp,
      updatedAt: timestamp,
      config: {
        title: name,
        details: 'Generated by AI',
        isBaseMiniApp: isBaseMiniApp
      }
    };

    await this.saveConfig(workspaceName, initialConfig);

    await this.plugin.call('fileManager', 'mkdir', 'src');

    if (isBaseMiniApp) {
      try {
        await this.plugin.call('fileManager', 'mkdir', '.well-known');

        const manifestContent = {
          "accountAssociation": {
            "header": "",
            "payload": "",
            "signature": ""
          },
          "miniapp": {
            "version": "1",
            "name": name,
            "homeUrl": "https://CHANGE_ME_TO_IPFS_URL",
            "iconUrl": "https://github.com/remix-project-org.png",
            "splashImageUrl": "https://github.com/remix-project-org.png",
            "splashBackgroundColor": "#000000",
            "subtitle": "Base Mini App",
            "description": "Generated by Remix Quick Dapp",
            "screenshotUrls": [
              "https://github.com/remix-project-org.png"
            ],
            "primaryCategory": "social",
            "tags": ["remix", "base-mini-app"],
            "heroImageUrl": "https://github.com/remix-project-org.png",
            "tagline": "Built on Base",
            "ogTitle": name,
            "ogDescription": "Check out this mini app",
            "ogImageUrl": "https://github.com/remix-project-org.png",
          }
        };

        await this.plugin.call('fileManager', 'writeFile', '.well-known/farcaster.json', JSON.stringify(manifestContent, null, 2));
      } catch (e) {
        console.error('[DappManager] Failed to create .well-known folder or file', e);
      }
    }

    await this.focusPlugin();

    return initialConfig;
  }

  async saveConfig(workspaceName: string, config: DappConfig): Promise<void> {
    const currentWorkspace = await this.getCurrentWorkspace();

    if (currentWorkspace.name !== workspaceName) {
      await this.switchToWorkspace(workspaceName);
    }

    config.updatedAt = Date.now();
    const sanitized = this.sanitizeConfig(config);
    const content = JSON.stringify(sanitized, null, 2);
    await this.plugin.call('fileManager', 'writeFile', CONFIG_FILENAME, content);

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
        await this.plugin.call('fileManager', 'writeFile', fullPath, content);
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
    const currentWorkspace = await this.getCurrentWorkspace();

    if (currentWorkspace.name === workspaceName) {
      const workspaces = await this.getWorkspaces();
      const otherWorkspace = workspaces.find((ws) => ws.name !== workspaceName);
      if (otherWorkspace) {
        await this.switchToWorkspace(otherWorkspace.name);
      }
    }

    await this.plugin.call('filePanel', 'deleteWorkspace', workspaceName);

    await this.focusPlugin();
  }

  async deleteAllDapps(): Promise<void> {
    const dapps = await this.getDapps();
    for (const dapp of dapps) {
      await this.deleteDapp(dapp.workspaceName);
    }
    await this.focusPlugin();
  }

  async getDappConfig(workspaceName: string): Promise<DappConfig | null> {
    const currentWorkspace = await this.getCurrentWorkspace();

    try {
      if (currentWorkspace.name !== workspaceName) {
        await this.switchToWorkspace(workspaceName);
      }

      const content = await this.plugin.call('fileManager', 'readFile', CONFIG_FILENAME);

      if (currentWorkspace.name !== workspaceName) {
        await this.switchToWorkspace(currentWorkspace.name);
        await this.focusPlugin();
      }

      if (content) {
        const config = JSON.parse(content);
        config.workspaceName = workspaceName;
        config.slug = workspaceName;
        return this.sanitizeConfig(config);
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

      await this.plugin.call('fileManager', 'writeFile', CONFIG_FILENAME, JSON.stringify(sanitizedConfig, null, 2));

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