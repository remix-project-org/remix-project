export interface GithubSettingsProps {
  saveToken: (githubToken: string, githubUserName: string, githubEmail: string) => void,
  removeToken: () => void,
  config: {
    exists: (key: string) => boolean,
    get: (key: string) => string,
    set: (key: string, content: string) => void,
    clear: () => void,
    getUnpersistedProperty: (key: string) => void,
    setUnpersistedProperty: (key: string, value: string) => void
  }
}

export interface EtherscanSettingsProps {
  saveToken: (etherscanToken: string) => void,
  removeToken: () => void,
  config: {
    exists: (key: string) => boolean,
    get: (key: string) => string,
    set: (key: string, content: string) => void,
    clear: () => void,
    getUnpersistedProperty: (key: string) => void,
    setUnpersistedProperty: (key: string, value: string) => void
  }
}

export interface SindriSettingsProps {
  saveToken: (sindriToken: string) => void,
  removeToken: () => void,
  config: {
    exists: (key: string) => boolean,
    get: (key: string) => string,
    set: (key: string, content: string) => void,
    clear: () => void,
    getUnpersistedProperty: (key: string) => void,
    setUnpersistedProperty: (key: string, value: string) => void
  }
}

export interface SettingsSection {
  key: string
  label: string
  description: string,
  subSections: {
    title?: string,
    options: {
      name: keyof SettingsState,
      label: string,
      labelIcon?: string,
      headerClass?: string,
      labelIconTooltip?: string,
      description?: string | JSX.Element,
      footnote?: {
        text: string,
        link?: string,
        styleClass?: string
      },
      type: 'toggle' | 'select' | 'button' | 'custom',
      selectOptions?: {
        label: string,
        value: string
      }[],
      toggleUIOptions?: {
        name: keyof SettingsState,
        type: 'text' | 'password'
      }[],
      toggleUIDescription?: string | JSX.Element,
      buttonOptions?: {
        label: string,
        action: 'link' | 'pluginCall',
        link?: string,
        pluginName?: string,
        pluginMethod?: string,
        pluginArgs?: string
      },
      customComponent?: string
    }[]
  }[]
}

interface ConfigState {
  value: boolean | string,
  isLoading: boolean
}

export interface SettingsState {
  'generate-contract-metadata': ConfigState
  'text-wrap': ConfigState
  'personal-mode': ConfigState
  'matomo-perf-analytics': ConfigState
  'matomo-analytics': ConfigState
  'auto-completion': ConfigState
  'show-gas': ConfigState
  'display-errors': ConfigState
  'copilot/suggest/activate': ConfigState
  'save-evm-state': ConfigState,
  'theme': ConfigState,
  'github-config': ConfigState,
  'ipfs-config': ConfigState,
  'swarm-config': ConfigState,
  'sindri-config': ConfigState,
  'etherscan-config': ConfigState,
  'gist-access-token': ConfigState,
  'github-user-name': ConfigState,
  'github-email': ConfigState,
  'ipfs-url': ConfigState,
  'ipfs-protocol': ConfigState,
  'ipfs-port': ConfigState,
  'ipfs-project-id': ConfigState,
  'ipfs-project-secret': ConfigState,
  'swarm-private-bee-address': ConfigState,
  'swarm-postage-stamp-id': ConfigState,
  'sindri-access-token': ConfigState,
  'etherscan-access-token': ConfigState,
  'ai-privacy-policy': ConfigState,
  'mcp/servers/enable': ConfigState,
  'mcp-server-management': ConfigState,
  'ollama-config': ConfigState,
  'ollama-endpoint': ConfigState,
  toaster: ConfigState
}
export interface SettingsActionPayloadTypes {
  SET_VALUE: { name: string, value: boolean | string },
  SET_LOADING: { name: string },
  SET_TOAST_MESSAGE: { value: string }
}
export interface SettingsAction<T extends keyof SettingsActionPayloadTypes> {
  type: T
  payload: SettingsActionPayloadTypes[T]
}

export type SettingsActions = {[A in keyof SettingsActionPayloadTypes]: SettingsAction<A>}[keyof SettingsActionPayloadTypes]
