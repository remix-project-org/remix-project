'use strict'
import { Plugin } from '@remixproject/engine'
import { Sdk } from '@circles-sdk/sdk'
import { BrowserProviderContractRunner } from "@circles-sdk/adapter-ethers"
import { BrowserProvider } from 'ethers'
import { GitHubUser } from '@remix-api'

const _paq = window._paq = window._paq || []

const profile = {
  name: 'circles',
  description: 'circles UBI',
  methods: ['initSdk', 'deleteProfile'],
  events: [],
  version: '1.0.0'
}

const CIRLCES_KEY = 'CIRLCES_KEY' 

export class Circles extends Plugin {
  constructor() {
    super(profile)
  }

  onActivation(): void {}

  public async initSdk (user: GitHubUser) {
    try {
      if (!user) {
        this.call('terminal', 'log', { type: 'error', value: 'please log in with github before initiating a circles profile'})
        return
      }
      const adapter = new BrowserProviderContractRunner()
      const web3 = await this.call('blockchain', 'web3')
      console.log('web3', web3);
      // (adapter as any).provider = new BrowserProvider(web3.currentProvider)
      await adapter.init();
      const sdk = new Sdk(adapter)
    
      if (!localStorage.getItem(CIRLCES_KEY)) {
        this.call('terminal', 'log', { type: 'log', value: `creating Circles profile...${user.login}`})
        const profileData = { name: user.login, description: '' }
        const receipt = await sdk.createOrUpdateProfile(profileData)
        localStorage.setItem(CIRLCES_KEY, JSON.stringify(receipt))
      }
      this.call('terminal', 'log', { type: 'log', value: 'Circles profile:'})
      this.call('terminal', 'log', { type: 'log', value: localStorage.getItem(CIRLCES_KEY)})
    } catch (e) {
      console.error(e)
      this.call('terminal', 'log', { type: 'error', value: e.message})
    }
  }

  public deleteProfile () {
    localStorage.removeItem(CIRLCES_KEY)
  }
}