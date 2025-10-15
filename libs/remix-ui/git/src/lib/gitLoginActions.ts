import axios from "axios";
import { endpointUrls } from "@remix-endpoints-helper";
import isElectron from "is-electron";
import { saveToken } from "./pluginActions";
import { loadGitHubUserFromToken } from "./gitactions";
import { GitEvent, trackMatomoEvent } from "@remix-api";

// Reference to the plugin - this will be set from listeners.ts
let plugin: any = null;

export const setLoginPlugin = (pluginInstance: any) => {
  plugin = pluginInstance;
};

// Helper function for tracking git events from library functions
const trackGitEvent = (action: GitEvent['action'], name?: string, isClick: boolean = false) => {
  if (!plugin) return
  trackMatomoEvent(plugin, {
    category: 'git',
    action,
    name,
    isClick
  })
}

// Get the GitHub OAuth client ID based on the platform
const getClientId = async () => {
  const host = isElectron() ? 'desktop' : window.location.hostname;
  try {
    const response = await axios.get(`${endpointUrls.gitHubLoginProxy}/client/${host}`, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    return response.data.client_id;
  } catch (error) {
    throw new Error('Failed to fetch GitHub client ID');
  }
};

// Start GitHub login process based on platform
export const startGitHubLogin = async (): Promise<void> => {
  if (!plugin) {
    throw new Error('Plugin not initialized for GitHub login');
  }

  try {
    trackGitEvent("CONNECT_TO_GITHUB", undefined, true);

    if (isElectron()) {
      // For desktop/electron, use the githubAuthHandler plugin
      await plugin.call('githubAuthHandler', 'login');
    } else {
      // For web, open popup login
      await startWebPopupLogin();
    }
  } catch (error) {
    trackGitEvent("CONNECT_TO_GITHUB_FAIL");
    throw error;
  }
};

// Web popup login implementation
const startWebPopupLogin = async (): Promise<void> => {
  const clientId = await getClientId();
  const redirectUri = `${window.location.origin}/?source=github`;
  const scope = 'repo gist user:email read:user';

  const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&response_type=code`;
  trackGitEvent("OPEN_LOGIN_MODAL", undefined, true)
  const popup = window.open(url, '_blank', 'width=600,height=700');
  if (!popup) {
    trackGitEvent("LOGIN_MODAL_FAIL");
    console.warn('Popup blocked or failed to open, falling back to device code flow.');
    throw new Error('Popup blocked - please allow popups for this site or use device code flow');
  }

  return new Promise((resolve, reject) => {
    const messageListener = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data.type === 'GITHUB_AUTH_SUCCESS') {
        const token = event.data.token;
        try {
          await saveToken(token);
          await loadGitHubUserFromToken();
          trackGitEvent("CONNECT_TO_GITHUB_SUCCESS");
          window.removeEventListener('message', messageListener);
          popup?.close();
          resolve();
        } catch (error) {
          window.removeEventListener('message', messageListener);
          popup?.close();
          reject(error);
        }
      } else if (event.data.type === 'GITHUB_AUTH_FAILURE') {
        trackGitEvent("CONNECT_TO_GITHUB_FAIL");
        window.removeEventListener('message', messageListener);
        popup?.close();
        reject(new Error('GitHub authentication failed'));
      }
    };

    window.addEventListener('message', messageListener);

    // Check if popup was closed without authentication
    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', messageListener);
        reject(new Error('Authentication popup was closed'));
      }
    }, 1000);
  });
};

// Device code flow fallback (can be called from components if needed)
export const getDeviceCodeFromGitHub = async (): Promise<any> => {
  trackGitEvent("GET_GITHUB_DEVICECODE", undefined, true);
  try {
    const response = await axios({
      method: 'post',
      url: `${endpointUrls.github}/login/device/code`,
      data: {
        client_id: '2795b4e41e7197d6ea11',
        scope: 'repo gist user:email read:user'
      },
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
    });
    trackGitEvent("GET_GITHUB_DEVICECODE_SUCCESS");
    return response.data;

  } catch (error) {
    trackGitEvent("GET_GITHUB_DEVICECODE_FAIL");
    throw new Error('Failed to get device code from GitHub');

  }

};

// Connect using device code
export const connectWithDeviceCode = async (deviceCode: string): Promise<void> => {
  trackGitEvent("DEVICE_CODE_AUTH", undefined, true);
  try {
    const response = await axios({
      method: 'post',
      url: `${endpointUrls.github}/login/oauth/access_token`,
      data: {
        client_id: '2795b4e41e7197d6ea11',
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      },
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
    });

    const data = response.data;

    if (data.access_token) {
      trackGitEvent("CONNECT_TO_GITHUB_SUCCESS");
      trackGitEvent("DEVICE_CODE_AUTH_SUCCESS");
      await saveToken(data.access_token);
      await loadGitHubUserFromToken();
    } else {
      trackGitEvent("DEVICE_CODE_AUTH_FAIL");
      throw new Error('Failed to get access token from device code');
    }
  } catch (error) {
    trackGitEvent("DEVICE_CODE_AUTH_FAIL");
    throw new Error('Failed to connect with device code');
  }
};

// Disconnect from GitHub
export const disconnectFromGitHub = async (): Promise<void> => {
  try {
    trackGitEvent("DISCONNECT_FROM_GITHUB", undefined, true);
    await saveToken(null);
    await loadGitHubUserFromToken();
  } catch (error) {
    console.error('Failed to disconnect from GitHub:', error);
    throw error;
  }
};
