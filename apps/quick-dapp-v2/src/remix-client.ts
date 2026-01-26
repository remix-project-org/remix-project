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

    this.onload(() => {
      // @ts-ignore
      this.on('ai-dapp-generator', 'dappGenerated', async (data: any) => {

        if (!data.slug || !data.content) return;

        const workspaceName = data.slug;

        try {
          await this.dappManager.saveGeneratedFiles(workspaceName, data.content);

          if (data.isUpdate) {

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
              this.internalEvents.emit('dappCreated', updatedConfig);

              // @ts-ignore
              this.call('notification', 'toast', `DApp '${updatedConfig.name}' created in workspace '${workspaceName}'!`);
            }
          }

        } catch (e: any) {
          console.error('[DEBUG-CLIENT] Error handling event:', e);
          this.internalEvents.emit('creatingDappError', e.message);
        } finally {
          this.emit('statusChanged', { key: 'loading', value: false, title: '' });
        }
      });

      // @ts-ignore
      this.on('ai-dapp-generator', 'dappGenerationError', (data: any) => {
        console.error('[DEBUG-CLIENT] Error received from plugin:', data);

        this.internalEvents.emit('creatingDappError', data);
        // @ts-ignore
        this.call('notification', 'toast', `Generation Failed: ${data.error}`);
        this.emit('statusChanged', { key: 'loading', value: false, title: '' });
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
      const networkName = getNetworkName(payload.chainId);
      const contractData = {
        address: payload.address,
        name: payload.contractName,
        abi: payload.abi,
        chainId: payload.chainId,
        networkName
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
        this.emit('statusChanged', { key: 'loading', value: false, title: '' });
      });

    } catch (e: any) {
      console.error('[DEBUG-CLIENT] ❌ createDapp Exception:', e);
      this.internalEvents.emit('creatingDappError', e.message);
      this.emit('statusChanged', { key: 'loading', value: false, title: '' });
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