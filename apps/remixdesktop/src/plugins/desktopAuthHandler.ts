import { Profile } from "@remixproject/plugin-utils";
import { ElectronBasePlugin, ElectronBasePluginClient } from "@remixproject/plugin-electron";
import { shell } from "electron";
import crypto from "crypto";
import { isE2ELocal } from "../main";

const profile: Profile = {
  name: 'desktopAuthHandler',
  displayName: 'Desktop Auth Handler',
  description: 'Handles SSO authentication for Remix Desktop via web bridge',
}

const clientProfile: Profile = {
  name: 'desktopAuthHandler',
  displayName: 'Desktop Auth Handler',
  description: 'Handles SSO authentication for Remix Desktop via web bridge',
  methods: ['login'],
  events: ['onAuthSuccess', 'onAuthFailure'],
}

// The base URL for the Remix web IDE used for authentication
const REMIX_WEB_URL =  isE2ELocal ? 'http://localhost:8080' : 'https://remix.ethereum.org'

// State expires after 10 minutes
const STATE_TTL_MS = 10 * 60 * 1000

// Module-level pending state shared between parent (protocol handler) and clients
let pendingState: string | null = null
let stateTimestamp: number = 0

function generateAndOpenAuth(): void {
  const state = crypto.randomBytes(32).toString('hex')
  pendingState = state
  stateTimestamp = Date.now()

  const authUrl = `${REMIX_WEB_URL}/#desktop_auth=${state}`
  console.log('[DesktopAuthHandler] Opening web IDE for SSO authentication')
  shell.openExternal(authUrl)
}

export class DesktopAuthHandler extends ElectronBasePlugin {
  clients: DesktopAuthHandlerClient[] = []

  constructor() {
    super(profile, clientProfile, DesktopAuthHandlerClient)
    this.methods = [...super.methods]
  }

  /**
   * Handle the SSO callback from the web IDE via remix:// protocol.
   * Called from main.ts when remix://auth/sso-callback is intercepted.
   */
  async handleSSOCallback(params: URLSearchParams): Promise<void> {
    const state = params.get('state')
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const userBase64 = params.get('user')

    if (!state) {
      console.error('[DesktopAuthHandler] Missing state parameter')
      this.sendAuthFailure('Missing state parameter - possible security issue')
      return
    }

    // Verify state with timing-safe comparison
    if (!pendingState || state.length !== pendingState.length) {
      console.error('[DesktopAuthHandler] Invalid state - possible CSRF attack')
      this.sendAuthFailure('Invalid state - authentication was not initiated from this app')
      return
    }

    const valid = crypto.timingSafeEqual(
      new Uint8Array(Buffer.from(pendingState, 'hex')),
      new Uint8Array(Buffer.from(state, 'hex'))
    )

    if (!valid) {
      console.error('[DesktopAuthHandler] State mismatch')
      this.sendAuthFailure('Invalid state - authentication was not initiated from this app')
      return
    }

    // Check if state has expired
    if (Date.now() - stateTimestamp > STATE_TTL_MS) {
      pendingState = null
      console.error('[DesktopAuthHandler] State expired')
      this.sendAuthFailure('Authentication timed out. Please try again.')
      return
    }

    // One-time use
    pendingState = null

    if (!accessToken || !refreshToken || !userBase64) {
      console.error('[DesktopAuthHandler] Missing auth data in callback')
      this.sendAuthFailure('Incomplete authentication data received')
      return
    }

    try {
      const userJson = Buffer.from(userBase64, 'base64url').toString('utf-8')
      const user = JSON.parse(userJson)

      console.log('[DesktopAuthHandler] SSO callback received for user:', user.email || user.name || user.sub)

      // Send tokens to all connected renderer processes
      for (const client of this.clients) {
        try {
          await client.sendAuthSuccess(accessToken, refreshToken, user)
        } catch (error) {
          console.error('[DesktopAuthHandler] Error sending auth success to client:', error)
        }
      }
    } catch (error) {
      console.error('[DesktopAuthHandler] Failed to process SSO callback:', error)
      this.sendAuthFailure('Failed to process authentication response')
    }
  }

  private async sendAuthFailure(error: string): Promise<void> {
    for (const client of this.clients) {
      try {
        await client.sendAuthFailure(error)
      } catch (err) {
        console.error('[DesktopAuthHandler] Error sending auth failure:', err)
      }
    }
  }
}

class DesktopAuthHandlerClient extends ElectronBasePluginClient {
  constructor(webContentsId: number, profile: Profile) {
    super(webContentsId, profile)
  }

  async login(): Promise<void> {
    generateAndOpenAuth()
  }

  async sendAuthSuccess(accessToken: string, refreshToken: string, user: any): Promise<void> {
    this.emit('onAuthSuccess', { accessToken, refreshToken, user })
  }

  async sendAuthFailure(error: string): Promise<void> {
    this.emit('onAuthFailure', { error })
  }
}
