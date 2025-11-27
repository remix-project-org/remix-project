import { Plugin } from '@remixproject/engine'
import * as templateWithContent from '@remix-project/remix-ws-templates'
import { TEMPLATE_METADATA } from '@remix-ui/workspace'
import { cloneInputType } from '@remix-api'

const profile = {
  name: 'remix-templates',
  displayName: 'remix-templates',
  description: 'Remix Templates plugin',
  methods: ['getTemplate', 'loadTemplateInNewWindow', 'addToCurrentElectronFolder', 'loadFilesInNewWindow', 'getTemplateReadMeFile'],
}

export class TemplatesPlugin extends Plugin {

  constructor() {
    super(profile)
  }

  async getTemplate(template: string, opts?: any) {
    const templateList = Object.keys(templateWithContent)
    if (!templateList.includes(template)) return
    opts = {
      ...opts || {},
      isElectron: true,
    }
    // @ts-ignore
    const files = await templateWithContent[template](opts, this)
    return files
  }

  async getTemplateReadMeFile(templateName: string) {
    const files = typeof templateWithContent[templateName] === 'function' ? await templateWithContent[templateName]({}, this) : { 'README.md': `# ${templateName} template` }
    const readMe = files?.['README.md'] || files?.['README.txt'] || 'No ReadMe file found'
    return { readMe, type: files['README.md'] ? 'md' : files['README.txt'] ? 'txt' : 'none' }
  }

  // electron only method

  async addToCurrentElectronFolder(template: string, opts?: any) {
    const metadata = TEMPLATE_METADATA[template]
    if (metadata) {
      if (metadata.type === 'git' || metadata.type === 'plugin') {
        this.call('notification', 'alert', {
          id: 'dgitAlert',
          message: 'This template is not available in the desktop version',
        })
        return
      }
    }
    const files = await this.getTemplate(template, opts)
    this.call('electronTemplates', 'addToCurrentElectronFolder', files)
  }

  async loadTemplateInNewWindow(template: string, opts?: any) {
    const metadata = TEMPLATE_METADATA[template]
    if (metadata) {
      if (metadata.type === 'git') {

        const input: cloneInputType = {
          url: metadata.url,
        }
        await this.call('dgitApi', 'clone', input)

        return
      } else if (metadata.type === 'plugin') {
        this.call('notification', 'alert', {
          id: 'dgitAlert',
          message: 'This template is not available in the desktop version',
        })
        return
      }
    }
    const files = await this.getTemplate(template, opts)
    this.call('electronTemplates', 'loadTemplateInNewWindow', files)
  }

  async loadFilesInNewWindow(files: any) {
    this.call('electronTemplates', 'loadTemplateInNewWindow', files)
  }
}

