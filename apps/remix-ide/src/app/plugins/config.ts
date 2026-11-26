import { Plugin } from '@remixproject/engine'
import { QueryParams } from '@remix-project/remix-lib'
import { Registry } from '@remix-project/remix-lib'

// Settings that must never be sourced from URL parameters.
// A link carrying one of these names could otherwise substitute its own
// token/endpoint and have git, Etherscan, Swarm, etc. use it silently.
const URL_PARAM_DENYLIST = new Set([
  'settings/gist-access-token',
  'settings/github-user-name',
  'settings/github-email',
  'settings/thegraph-access-token',
  'settings/zkverify-api-key',
  'settings/swarm-private-bee-address',
  'etherscan-access-token',
])

const profile = {
  name: 'config',
  displayName: 'Config',
  description: 'Config',
  methods: ['getAppParameter', 'setAppParameter', 'getEnv'],
  events: ['configChanged']
}

export class ConfigPlugin extends Plugin {
  constructor () {
    super(profile)
  }

  getAppParameter (name: string) {
    const config = Registry.getInstance().get('config').api
    if (!URL_PARAM_DENYLIST.has(name)) {
      const queryParams = new QueryParams()
      const params = queryParams.get()
      const urlValue = params[name]
      if (urlValue !== undefined) {
        if (urlValue === 'true') return true
        if (urlValue === 'false') return false
        return urlValue
      }
    }
    const param = config.get(name) || config.get('settings/' + name)
    if (param === 'true') return true
    if (param === 'false') return false
    return param
  }

  setAppParameter (name: string, value: any) {
    const config = Registry.getInstance().get('config').api
    config.set(name, value)
  }

  async getEnv (key: string): Promise<string | undefined> {
    const env: string = await this.call('fileManager', 'readFile', '.env')
    let value
    env.split('\n').forEach((line: string) => {
      const [envKey, envValue] = line.split('=');
      if (envKey === key) {
        value = envValue;
      }
    })
    return value
  }
}
