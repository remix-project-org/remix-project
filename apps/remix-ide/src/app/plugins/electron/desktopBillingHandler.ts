import { ElectronPlugin } from '@remixproject/engine-electron';

export class DesktopBillingHandler extends ElectronPlugin {
  constructor() {
    super({
      displayName: 'desktopBillingHandler',
      name: 'desktopBillingHandler',
      description: 'Bridges web checkout completion back to Remix Desktop',
    })
    this.methods = []
  }
}
