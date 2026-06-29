import { ElectronPlugin } from '@remixproject/engine-electron';

export class DesktopAuthHandler extends ElectronPlugin {
  constructor() {
    super({
      displayName: 'desktopAuthHandler',
      name: 'desktopAuthHandler',
      description: 'Handles SSO authentication for Remix Desktop via web bridge',
    })
    this.methods = []
  }
}
