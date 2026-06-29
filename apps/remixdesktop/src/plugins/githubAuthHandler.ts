import { Profile } from "@remixproject/plugin-utils";
import { ElectronBasePlugin, ElectronBasePluginClient } from "@remixproject/plugin-electron"
import axios from "axios";
import { endpointUrls } from "@remix-endpoints-helper";
import { shell } from "electron";

const profile: Profile = {
  name: 'githubAuthHandler',
  displayName: 'GitHub Auth Handler',
  description: 'Handles GitHub authentication for Remix IDE',
}

export class GitHubAuthHandler extends ElectronBasePlugin {
  clients: GitHubAuthHandlerClient[] = []
  constructor() {
    super(profile, clientProfile, GitHubAuthHandlerClient)
    this.methods = [...super.methods, 'getClientId', 'getAccessToken']
  }

  async exchangeCodeForToken(code: string): Promise<string> {
    try {
      const response = await axios.post(`${endpointUrls.gitHubLoginProxy}/login/oauth/access_token`, {
        code,
        redirect_uri: `remix://auth/callback`
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      })

      if (response.data.access_token) {
        const githubToken = response.data.access_token
        
        // Register with SSO API to create user and set cookies
        await this.registerWithSSO(githubToken)
        
        // Send to frontend for local storage (existing git plugin usage)
        this.sendAccessToken(githubToken)
        console.log('[GitHubAuthHandler] Access token received and registered with SSO')
        return
      } else {
        throw new Error('No access token received')
      }
    }
    catch (error) {
      console.error('[GitHubAuthHandler] Error exchanging code for token:', error)
      throw new Error('Failed to exchange code for access token')
    }
  }

  async registerWithSSO(githubToken: string): Promise<void> {
    try {
      // Call the SSO API to verify GitHub token, create/update user, and set cookies
      const response = await axios.post(`${endpointUrls.sso}/github/verify`, {
        access_token: githubToken
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        withCredentials: true // Important: allows cookies to be set
      })

      console.log('[GitHubAuthHandler] Registered with SSO API:', response.data)
    } catch (error) {
      console.error('[GitHubAuthHandler] Failed to register with SSO:', error)
      // Don't throw - allow GitHub functionality to work even if SSO registration fails
    }
  }

  async sendAccessToken(token: string): Promise<void> {
    for (const client of this.clients) {
      try {
        await client.sendAccessToken(token)
      } catch (error) {
        console.error('[GitHubAuthHandler] Error sending access token:', error)
      }
    }
  }
  async sendAuthFailure(error: string): Promise<void> {
    for (const client of this.clients) {
      try {
        await client.sendAuthFailure(error)
      } catch (error) {
        console.error('[GitHubAuthHandler] Error sending auth failure:', error)
      }
    }
  }
}

const clientProfile: Profile = {
  name: 'githubAuthHandler',
  displayName: 'GitHub Auth Handler',
  description: 'Handles GitHub authentication for Remix IDE',
  methods: ['login'],
  events: ['GITHUB_AUTH_SUCCESS', 'GITHUB_AUTH_FAILURE'],
}
class GitHubAuthHandlerClient extends ElectronBasePluginClient {
  constructor(webContentsId: number, profile: Profile) {
    super(webContentsId, profile)
  }

  async login(): Promise<void> {
    try {
      const clientId = await getClientId()
      const redirectUri = `remix://auth/callback`
      const scope = 'repo gist user:email read:user'
      const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&response_type=code`
      shell.openExternal(url); // open in browser
    } catch (error) {
      console.error('[GitHubAuthHandlerClient] Error fetching client ID:', error)
      throw new Error('Failed to fetch GitHub client ID')
    }
  }

  async sendAccessToken(token: string): Promise<void> {

    this.emit('onLogin', { token })
  }

  async sendAuthFailure(error: string): Promise<void> {
    this.emit('onError', { error })
  }

}

const getClientId = async (): Promise<string> => {
  const host = 'desktop'
  // fetch it with axios from `${endpointUrls.gitHubLoginProxy}/client-id?host=${host}`
  try {
    const response = await axios.get(`${endpointUrls.gitHubLoginProxy}/client/${host}`, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })
    console.log('[GetDeviceCode] Fetched client ID:', response.data)
    return response.data.client_id
  }
  catch (error) {
    console.error('[GetDeviceCode] Error fetching client ID:', error)
    throw new Error('Failed to fetch GitHub client ID')
  }
}
