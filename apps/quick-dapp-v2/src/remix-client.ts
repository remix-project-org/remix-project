import { PluginClient } from '@remixproject/plugin';
import { createClient } from '@remixproject/plugin-webview';
import { EventEmitter } from 'events';
import { DappManager } from './utils/DappManager';
import { initInstance, emptyInstance, setAiLoading } from './actions';

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

  async createDapp(payload: { 
    description: string, 
    contractName: string, 
    address: string, 
    abi: any, 
    chainId: number,
    compilerData: any 
  }) {
    try {
      this.internalEvents.emit('creatingDappStart');
      this.emit('statusChanged', { key: 'loading', value: true, title: 'Generating DApp...' });
      
      const contractData = {
        address: payload.address,
        name: payload.contractName,
        abi: payload.abi,
        chainId: payload.chainId,
        networkName: 'Unknown' 
      };

      const newDappConfig = await this.dappManager.createDapp(payload.contractName, contractData);
      
      // @ts-ignore
      const pages = await this.call('ai-dapp-generator', 'generateDapp', {
        description: payload.description,
        address: payload.address,
        abi: payload.abi,
        chainId: payload.chainId,
        contractName: payload.contractName
      });

      await this.dappManager.saveGeneratedFiles(newDappConfig.slug, pages);

      this.internalEvents.emit('dappCreated', newDappConfig);
      
      // @ts-ignore
      this.call('notification', 'toast', `DApp '${newDappConfig.name}' created successfully!`);

    } catch (e: any) {
      console.error(e);
      this.internalEvents.emit('creatingDappError', e.message);
      // @ts-ignore
      this.call('notification', 'toast', 'Failed to create DApp: ' + e.message);
    } finally {
      this.emit('statusChanged', { key: 'loading', value: false, title: '' });
    }
  }
}

const client = new RemixClient();
export default client;