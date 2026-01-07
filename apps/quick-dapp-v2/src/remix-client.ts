import { PluginClient } from '@remixproject/plugin';
import { createClient } from '@remixproject/plugin-webview';
import { EventEmitter } from 'events';
import { DappManager } from './utils/DappManager';
import { initInstance, emptyInstance, setAiLoading } from './actions';

const getNetworkName = (chainId: number | string): string => {
  const id = Number(chainId);
  switch (id) {
  case 1: return 'Mainnet';
  case 11155111: return 'Sepolia';
  case 5: return 'Goerli';
  case 137: return 'Polygon';
  case 42161: return 'Arbitrum';
  case 10: return 'Optimism';
  default: return `Chain ${id}`;
  }
};

export class RemixClient extends PluginClient {
  public dappManager: DappManager;
  public internalEvents: EventEmitter;

  constructor() {
    super();
    this.methods = ['edit', 'clearInstance', 'startAiLoading', 'createDapp'];
    this.internalEvents = new EventEmitter();
    createClient(this);
    // @ts-ignore
    this.dappManager = new DappManager(this);
    console.log('[DEBUG-CLIENT] Constructor initialized.');

    this.onload(() => {
      // @ts-ignore
      this.on('ai-dapp-generator', 'dappGenerated', async (data: any) => {
        console.log('[DEBUG-CLIENT] Event received:', data);

        if (!data.slug || !data.content) return;

        try {
          console.log(`[DEBUG-CLIENT] Saving files for ${data.slug}...`);
          await this.dappManager.saveGeneratedFiles(data.slug, data.content);

          if (data.isUpdate) {
            console.log('[DEBUG-CLIENT] Update finished. Emitting dappUpdated...');

            this.internalEvents.emit('dappUpdated', {
              slug: data.slug,
              files: data.content
            });

            // @ts-ignore
            this.call('notification', 'toast', 'DApp code updated successfully.');

          } else {
            const config = await this.dappManager.getDappConfig(data.slug);
            if (config) {
              this.internalEvents.emit('dappCreated', config);
              // @ts-ignore
              this.call('notification', 'toast', `DApp '${config.name}' created!`);
            }
          }

        } catch (e: any) {
          console.error('[DEBUG-CLIENT] Error handling event:', e);
          this.internalEvents.emit('creatingDappError', e.message);
        } finally {
          this.emit('statusChanged', { key: 'loading', value: false, title: '' });
        }
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

  startAiLoading(): void {
    setAiLoading(true);
  }

  async createDapp(payload: any) {
    try {
      console.log('[DEBUG-CLIENT] createDapp called with:', payload.contractName);

      this.internalEvents.emit('creatingDappStart');
      this.emit('statusChanged', { key: 'loading', value: true, title: 'Generating DApp...' });

      const networkName = getNetworkName(payload.chainId);
      const contractData = {
        address: payload.address,
        name: payload.contractName,
        abi: payload.abi,
        chainId: payload.chainId,
        networkName
      };

      console.log('[DEBUG-CLIENT] Creating initial Dapp config...');
      const newDappConfig = await this.dappManager.createDapp(
        payload.contractName,
        contractData,
        payload.isBaseMiniApp
      );

      console.log(`[DEBUG-CLIENT] Initial config created. Slug: ${newDappConfig.slug}`);
      // @ts-ignore
      this.call('ai-dapp-generator', 'generateDapp', {
        description: payload.description,
        address: payload.address,
        abi: payload.abi,
        chainId: payload.chainId,
        contractName: payload.contractName,
        isBaseMiniApp: payload.isBaseMiniApp,
        image: payload.image,
        slug: newDappConfig.slug
      }).then(() => {
        console.log('[DEBUG-CLIENT] AI Trigger sent successfully (Ack received).');
      }).catch((e: any) => {
        console.error('[DEBUG-CLIENT] ❌ AI Trigger Failed:', e);
        this.internalEvents.emit('creatingDappError', "Failed to trigger AI generation");
        this.emit('statusChanged', { key: 'loading', value: false, title: '' });
      });

      console.log('[DEBUG-CLIENT] createDapp finished (waiting for event).');

    } catch (e: any) {
      console.error('[DEBUG-CLIENT] ❌ createDapp Exception:', e);
      this.internalEvents.emit('creatingDappError', e.message);
      this.emit('statusChanged', { key: 'loading', value: false, title: '' });
    }
  }
}

const client = new RemixClient();
export default client;