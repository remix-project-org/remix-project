import { Plugin } from '@remixproject/engine'

const profile = {
  name: 'circles',
  description: 'Connect with a circles profile',
  methods: ['addSnippet'],
  events: [],
  version: '0.0.1'
}
export class Circles extends Plugin {
  constructor() {
    super(profile)
  }

  onActivation(): void {
    console.log('Circles plugin activated')
  }

  async addSnippet(text: string): Promise<void> {
    // To show a toast notification
    this.call('notification', 'toast', 'Adding snippet')
    const file = await this.call('fileManager', 'getCurrentFile')
    const content = await this.call('fileManager', 'readFile', file)
    // To log in the terminal
    this.call('terminal', 'log', { type: 'log', value: 'sending snippet' })
    this.call('terminal', 'log', { type: 'log', value: text })
  }
}