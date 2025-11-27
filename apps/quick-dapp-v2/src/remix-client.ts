import { PluginClient } from '@remixproject/plugin';
import { createClient } from '@remixproject/plugin-webview';
import { initInstance, emptyInstance, setAiLoading } from './actions';

class RemixClient extends PluginClient {
  constructor() {
    super();
    this.methods = ['edit', 'clearInstance', 'startAiLoading'];
    createClient(this);
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

}

export default new RemixClient();
