import { PluginClient } from '@remixproject/plugin';
import { createClient } from '@remixproject/plugin-webview';
import { EventEmitter } from 'events';
import { DappManager } from './utils/DappManager';
import { initInstance, emptyInstance, setAiLoading, openDapp as openDappAction } from './actions';

const getNetworkName = (chainId: number | string): string => {
  const id = Number(chainId);
  if (isNaN(id)) return 'Unknown Chain';
  switch (id) {
  case 1: return 'Mainnet';
  case 11155111: return 'Sepolia';
  case 5: return 'Goerli';
  case 137: return 'Polygon';
  case 42161: return 'Arbitrum';
  case 10: return 'Optimism';
  case 8453: return 'Base';
  case 84532: return 'Base Sepolia';
  case 84531: return 'Base Goerli';
  case 43114: return 'Avalanche';
  case 56: return 'BSC';
  case 324: return 'zkSync';
  case 100: return 'Gnosis';
  case 42220: return 'Celo';
  case 7777777: return 'Zora';
  case 80001: return 'Polygon Mumbai';
  case 80002: return 'Polygon Amoy';
  case 421614: return 'Arbitrum Sepolia';
  case 11155420: return 'Optimism Sepolia';
  case 59144: return 'Linea';
  case 59141: return 'Linea Sepolia';
  case 534352: return 'Scroll';
  case 534351: return 'Scroll Sepolia';
  case 81457: return 'Blast';
  case 168587773: return 'Blast Sepolia';
  default: return `Chain ${id}`;
  }
};

export class RemixClient extends PluginClient {
  public dappManager: DappManager;
  public internalEvents: EventEmitter;
  private listenersRegistered: boolean = false;
  private processedDappSlugs: Set<string>;

  private static readonly PROCESSED_SLUGS_KEY = 'quickdapp_processed_slugs';

  constructor() {
    super();
    this.methods = ['edit', 'clearInstance', 'startAiLoading', 'createDapp', 'openDapp'];
    this.internalEvents = new EventEmitter();

    this.processedDappSlugs = this.loadProcessedSlugs();

    createClient(this);
    // @ts-ignore
    this.dappManager = new DappManager(this);

    this.onload(() => {
      if (this.listenersRegistered) return;
      this.listenersRegistered = true;

      // @ts-ignore
      this.on('ai-dapp-generator', 'dappGenerated', async (data: any) => {

        if (!data.slug || !data.content) return;

        const workspaceName = data.slug;

        if (this.processedDappSlugs.has(workspaceName)) {
          return;
        }

        const existingConfig = await this.dappManager.getDappConfig(workspaceName);
        if (existingConfig && existingConfig.status === 'created' && !data.isUpdate) {
          this.markSlugAsProcessed(workspaceName);
          return;
        }

        try {
          await this.dappManager.saveGeneratedFiles(workspaceName, data.content);

          if (data.isUpdate) {
            const updateKey = `${workspaceName}-update`;
            if (this.processedDappSlugs.has(updateKey)) {
              return;
            }
            this.markSlugAsProcessed(updateKey);

            this.internalEvents.emit('dappUpdated', {
              slug: workspaceName,
              workspaceName,
              files: data.content
            });

            // @ts-ignore
            this.call('notification', 'toast', 'DApp code updated successfully.');

          } else {
            const updatedConfig = await this.dappManager.updateDappConfig(workspaceName, { status: 'created' });

            if (updatedConfig) {
              this.markSlugAsProcessed(workspaceName);

              this.internalEvents.emit('dappCreated', updatedConfig);

              // @ts-ignore
              this.call('notification', 'toast', `DApp '${updatedConfig.name}' created in workspace '${workspaceName}'!`);
            }
          }

        } catch (e: any) {
          console.error('[DEBUG-CLIENT] Error handling event:', e);
          this.internalEvents.emit('creatingDappError', { slug: workspaceName, error: e.message });
        } finally {
          this.emit('statusChanged', { key: 'none', type: 'none', title: '' });
        }
      });

      const processedErrors = new Set<string>();

      // @ts-ignore
      this.on('ai-dapp-generator', 'dappGenerationError', (data: any) => {
        const errorKey = data?.slug || data?.error || 'unknown';

        if (processedErrors.has(errorKey)) {
          return;
        }
        processedErrors.add(errorKey);

        console.error('[DEBUG-CLIENT] Error received from plugin:', data);

        this.internalEvents.emit('creatingDappError', data);
        // @ts-ignore
        this.call('notification', 'toast', `Generation Failed: ${data.error}`);
        this.emit('statusChanged', { key: 'none', type: 'none', title: '' });
      });
    });
  }

  edit({ address, abi, network, name, devdoc, methodIdentifiers, solcVersion, htmlTemplate, pages }: any): void {
    initInstance({
      address,
      abi,
      network,
      name,
      devdoc,
      methodIdentifiers,
      solcVersion,
      htmlTemplate,
      pages
    });
  }

  clearInstance(): void {
    emptyInstance();
  }

  async openDapp(slug: string): Promise<boolean> {
    return await openDappAction(slug);
  }

  startAiLoading(): void {
    setAiLoading(true);
  }

  private loadProcessedSlugs(): Set<string> {
    try {
      const stored = localStorage.getItem(RemixClient.PROCESSED_SLUGS_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        const ONE_HOUR = 60 * 60 * 1000;
        const now = Date.now();
        const validEntries = Object.entries(data)
          .filter(([_, timestamp]) => now - (timestamp as number) < ONE_HOUR)
          .map(([slug]) => slug);
        return new Set(validEntries);
      }
    } catch (e) {
      console.warn('[QuickDapp] Failed to load processed slugs:', e);
    }
    return new Set();
  }

  private saveProcessedSlugs(): void {
    try {
      const data: Record<string, number> = {};
      const now = Date.now();
      this.processedDappSlugs.forEach((slug) => {
        data[slug] = now;
      });
      localStorage.setItem(RemixClient.PROCESSED_SLUGS_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[QuickDapp] Failed to save processed slugs:', e);
    }
  }

  private markSlugAsProcessed(slug: string): void {
    this.processedDappSlugs.add(slug);
    this.saveProcessedSlugs();
  }

  async createDapp(payload: any) {
    try {
      const networkName = getNetworkName(payload.chainId);
      const contractData = {
        address: payload.address,
        name: payload.contractName,
        abi: payload.abi,
        chainId: payload.chainId,
        networkName,
        sourceFilePath: payload.sourceFilePath
      };

      const newDappConfig = await this.dappManager.createDapp(
        payload.contractName,
        contractData,
        payload.isBaseMiniApp
      );

      this.internalEvents.emit('creatingDappStart', {
        slug: newDappConfig.slug,
        workspaceName: newDappConfig.workspaceName,
        dappConfig: newDappConfig
      });

      // @ts-ignore
      this.call('ai-dapp-generator', 'generateDapp', {
        description: payload.description,
        address: payload.address,
        abi: payload.abi,
        chainId: payload.chainId,
        contractName: payload.contractName,
        isBaseMiniApp: payload.isBaseMiniApp,
        image: payload.image,
        slug: newDappConfig.slug,
        figmaUrl: payload.figmaUrl,
        figmaToken: payload.figmaToken
      }).catch((e: any) => {
        console.error('[DEBUG-CLIENT] ❌ AI Trigger Failed:', e);
        this.internalEvents.emit('creatingDappError', "Failed to trigger AI generation");
        this.emit('statusChanged', { key: 'none', type: 'none', title: '' });
      });

    } catch (e: any) {
      console.error('[DEBUG-CLIENT] ❌ createDapp Exception:', e);
      this.internalEvents.emit('creatingDappError', e.message);
      this.emit('statusChanged', { key: 'none', type: 'none', title: '' });
    }
  }

  async updateDapp(
    slug: string,
    address: string,
    prompt: string | any[],
    files: any,
    image: string | null
  ) {
    try {
      this.internalEvents.emit('dappUpdateStart', { slug });

      // @ts-ignore
      await this.call('ai-dapp-generator', 'updateDapp',
        address,
        prompt,
        files,
        image,
        slug
      );
    } catch (e: any) {
      console.error('[DEBUG-CLIENT] updateDapp failed:', e);
      this.internalEvents.emit('creatingDappError', { slug, error: e.message });
    }
  }

}

const client = new RemixClient();
export default client;