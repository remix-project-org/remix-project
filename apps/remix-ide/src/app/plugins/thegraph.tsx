// The Graph Subgraph Plugin for Remix IDE
// A simple plugin to execute GraphQL queries from .subgraph files

import { Plugin } from '@remixproject/engine'
import { parseGraphQLFile, validateGraphQLSyntax } from '@remix-ui/thegraph'
import * as packageJson from '../../../../../package.json'

interface SubgraphSettings {
  defaultEndpoint?: string
  endpoints?: SubgraphEndpoint[]
}

interface SubgraphEndpoint {
  name: string
  url: string
  network?: string
}

interface QueryResult {
  data?: any
  errors?: any[]
  executionTime: number
}

const profile = {
  name: 'thegraph',
  displayName: 'The Graph',
  description: 'Execute GraphQL queries against The Graph subgraphs',
  version: packageJson.version,
  maintainedBy: 'Remix',
  permission: true,
  events: ['queryExecuted'],
  methods: ['runSubgraphFile', 'executeQuery', 'getSettings', 'saveSettings', 'getDefaultEndpoint', 'setDefaultEndpoint']
}

/**
 * The Graph Plugin
 * Executes GraphQL queries from .subgraph files
 */
export class TheGraphPlugin extends Plugin {
  private settings: SubgraphSettings = {}

  constructor() {
    super(profile)
  }

  async onActivation() {
    // Load settings from config
    try {
      const savedSettings = await this.call('config', 'getAppParameter', 'thegraph-settings')
      if (savedSettings) {
        this.settings = JSON.parse(savedSettings)
      }
    } catch (e) {
      console.warn('[TheGraph] Failed to load settings:', e)
    }
  }

  /**
   * Run a subgraph file
   * Parses the file, executes the query, and saves results
   * @param pathOrCmd - Either a file path string or a context menu command object
   */
  async runSubgraphFile(pathOrCmd: string | { path: string[] }): Promise<QueryResult> {
    const path = typeof pathOrCmd === 'string' ? pathOrCmd : pathOrCmd.path[0]

    try {
      await this.call('terminal', 'log', {
        type: 'info',
        value: `[TheGraph] Running subgraph query: ${path}`
      })
      const content = await this.call('fileManager', 'readFile', path)
      const parsed = parseGraphQLFile(content)
      const validation = validateGraphQLSyntax(parsed.query)

      if (!validation.valid) {
        const errorMsg = `[TheGraph] Invalid query syntax: ${validation.error}`
        await this.call('terminal', 'log', { type: 'error', value: errorMsg })
        throw new Error(validation.error)
      }
      const endpoint = parsed.metadata.endpoint || this.settings.defaultEndpoint

      if (!endpoint) {
        const errorMsg = '[TheGraph] No endpoint specified. Add "# @endpoint: <url>" to your file or set a default endpoint.'
        await this.call('terminal', 'log', { type: 'error', value: errorMsg })
        throw new Error('No endpoint specified')
      }
      const result = await this.executeQuery(endpoint, parsed.query, parsed.metadata.variables)
      const resultPath = path.replace('.subgraph', '.result.json')
      const resultContent = JSON.stringify(result.data || { errors: result.errors }, null, 2)

      await this.call('fileManager', 'writeFile', resultPath, resultContent)
      await this.call('terminal', 'log', {
        type: 'info',
        value: `[TheGraph] Query executed in ${result.executionTime}ms. Results saved to ${resultPath}`
      })
      try {
        await this.call('editor', 'openSplitView', path, resultPath, resultContent)
      } catch (splitViewError) {
        console.warn('[TheGraph] Split view failed, opening result file instead:', splitViewError)
        await this.call('fileManager', 'open', resultPath)
      }
      this.emit('queryExecuted', { path, result })

      return result
    } catch (error: any) {
      const errorMsg = `[TheGraph] Error executing query: ${error.message}`
      await this.call('terminal', 'log', { type: 'error', value: errorMsg })
      throw error
    }
  }

  /**
   * Get the API key from settings and format the endpoint URL if needed
   */
  private async getFormattedEndpoint(endpoint: string): Promise<string> {
    // Pattern to match any placeholder wrapped in square brackets [...] or curly brackets {...}
    const placeholderPattern = /\[[^\]]*\]|\{[^}]*\}/g

    if (placeholderPattern.test(endpoint)) {
      try {
        const apiKey = await this.call('config', 'getAppParameter', 'settings/thegraph-access-token')
        if (apiKey) {
          return endpoint.replace(/\[[^\]]*\]|\{[^}]*\}/g, apiKey)
        } else {
          const errorMsg = '[TheGraph] No API key configured. Please add your API key in Settings > Connected Services > The Graph API Key.'
          await this.call('terminal', 'log', { type: 'error', value: errorMsg })
          throw new Error(errorMsg)
        }
      } catch (e: any) {
        if (e.message.includes('[TheGraph]')) {
          throw e
        }
        console.warn('[TheGraph] Failed to get API key from settings:', e)
        throw new Error('[TheGraph] Failed to get API key from settings.')
      }
    }

    // Check if this is a gateway.thegraph.com URL that needs an API key
    const gatewayPattern = /^https:\/\/gateway\.thegraph\.com\/api\/subgraphs\/id\/(.+)$/
    const match = endpoint.match(gatewayPattern)

    if (match) {
      try {
        const apiKey = await this.call('config', 'getAppParameter', 'settings/thegraph-access-token')
        if (apiKey) {
          const subgraphId = match[1]
          return `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/${subgraphId}`
        } else {
          await this.call('terminal', 'log', {
            type: 'warn',
            value: '[TheGraph] No API key configured. Please add your API key in Settings > Connected Services > The Graph API Key.'
          })
        }
      } catch (e) {
        console.warn('[TheGraph] Failed to get API key from settings:', e)
      }
    }

    return endpoint
  }

  /**
   * Execute a GraphQL query against an endpoint
   */
  async executeQuery(endpoint: string, query: string, variables?: Record<string, any>): Promise<QueryResult> {
    const startTime = Date.now()

    try {
      const formattedEndpoint = await this.getFormattedEndpoint(endpoint)
      const response = await fetch(formattedEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: variables || {}
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      const executionTime = Date.now() - startTime

      if (data.errors && data.errors.length > 0) {
        for (const err of data.errors) {
          await this.call('terminal', 'log', {
            type: 'warn',
            value: `[TheGraph] GraphQL Error: ${err.message}`
          })
        }
      }

      return {
        data: data.data,
        errors: data.errors,
        executionTime
      }
    } catch (error: any) {
      const executionTime = Date.now() - startTime
      return {
        errors: [{ message: error.message }],
        executionTime
      }
    }
  }

  /**
   * Get current settings
   */
  async getSettings(): Promise<SubgraphSettings> {
    return this.settings
  }

  /**
   * Save settings
   */
  async saveSettings(settings: SubgraphSettings): Promise<void> {
    this.settings = { ...this.settings, ...settings }
    try {
      await this.call('config', 'setAppParameter', 'thegraph-settings', JSON.stringify(this.settings))
    } catch (e) {
      console.warn('[TheGraph] Failed to save settings:', e)
    }
  }

  /**
   * Get default endpoint
   */
  async getDefaultEndpoint(): Promise<string | undefined> {
    return this.settings.defaultEndpoint
  }

  /**
   * Set default endpoint
   */
  async setDefaultEndpoint(endpoint: string): Promise<void> {
    this.settings.defaultEndpoint = endpoint
    await this.saveSettings(this.settings)
  }
}
