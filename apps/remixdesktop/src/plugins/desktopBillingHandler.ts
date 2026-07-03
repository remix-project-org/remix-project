import { Profile } from "@remixproject/plugin-utils";
import { ElectronBasePlugin, ElectronBasePluginClient } from "@remixproject/plugin-electron";

const profile: Profile = {
  name: 'desktopBillingHandler',
  displayName: 'Desktop Billing Handler',
  description: 'Bridges web checkout completion back to Remix Desktop',
}

const clientProfile: Profile = {
  name: 'desktopBillingHandler',
  displayName: 'Desktop Billing Handler',
  description: 'Bridges web checkout completion back to Remix Desktop',
  methods: [],
  events: ['onBillingComplete'],
}

export class DesktopBillingHandler extends ElectronBasePlugin {
  clients: DesktopBillingHandlerClient[] = []

  constructor() {
    super(profile, clientProfile, DesktopBillingHandlerClient)
    this.methods = [...super.methods]
  }

  /**
   * Handle the checkout-complete callback from the web IDE via the remix://
   * protocol. Called from main.ts when remix://billing/complete is intercepted
   * (the protocol handler already brings the desktop window to the foreground).
   * Unlike the SSO bridge there are no tokens to transfer — the purchase was
   * made server-side against the already-authenticated account, so we simply
   * notify the renderer so the Plan Manager can refresh credits/plan state.
   */
  async handleBillingComplete(_params: URLSearchParams): Promise<void> {
    console.log('[DesktopBillingHandler] Billing complete callback received')
    for (const client of this.clients) {
      try {
        await client.sendBillingComplete()
      } catch (error) {
        console.error('[DesktopBillingHandler] Error notifying client of billing completion:', error)
      }
    }
  }
}

class DesktopBillingHandlerClient extends ElectronBasePluginClient {
  constructor(webContentsId: number, profile: Profile) {
    super(webContentsId, profile)
  }

  async sendBillingComplete(): Promise<void> {
    this.emit('onBillingComplete', {})
  }
}
