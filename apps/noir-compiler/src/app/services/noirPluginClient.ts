import { PluginClient } from '@remixproject/plugin'
import { createClient } from '@remixproject/plugin-webview'
import EventManager from 'events'
import { DEFAULT_TOML_CONFIG } from '../actions/constants'
import NoirParser from './noirParser'
import { extractNameFromKey } from '@remix-ui/helper'
import axios from 'axios'
export class NoirPluginClient extends PluginClient {
  public internalEvents: EventManager
  public parser: NoirParser
  public ws: WebSocket
  public lastCompilationDetails: {
    error: string
    path: string
    id: string
  }

  constructor() {
    super()
    this.methods = ['init', 'parse', 'compile']
    createClient(this)
    this.internalEvents = new EventManager()
    this.parser = new NoirParser()
    this.onload()
  }

  init(): void {
    console.log('initializing noir plugin...')
  }

  onActivation(): void {
    this.internalEvents.emit('noir_activated')
    this.setupWebSocketEvents()
  }

  setupWebSocketEvents(): void {
    // @ts-ignore
    this.ws = new WebSocket(`${WS_URL}`)
    this.ws.onopen = () => {
      console.log('WebSocket connection opened')
    }
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data)

      if (message.logMsg) {
        if (message.logMsg.includes('previous errors')) {
          this.logFn(message.logMsg)
        } else {
          this.debugFn(message.logMsg)
        }
      }
    }
    this.ws.onerror = (event) => {
      this.logFn('WebSocket error: ' + event)
    }
    this.ws.onclose = () => {
      console.log('WebSocket connection closed')
      // restart the websocket connection
      this.ws = null
      setTimeout(this.setupWebSocketEvents.bind(this), 5000)
    }
  }

  async setupNargoToml(projectRoot: string): Promise<void> {
    const tomlPath = projectRoot === '/' ? 'Nargo.toml' : `${projectRoot}/Nargo.toml`
    // @ts-ignore
    const nargoTomlExists = await this.call('fileManager', 'exists', tomlPath)

    if (!nargoTomlExists) {
      await this.call('fileManager', 'writeFile', tomlPath, DEFAULT_TOML_CONFIG)
    }
  }

  generateRequestID(): string {
    const timestamp = Math.floor(Date.now() / 1000)
    const random = Math.random().toString(36).substring(2, 15)

    return `req_${timestamp}_${random}`
  }

  async findProjectRoot(filePath: string): Promise<string | null> {
    const srcIndex = filePath.lastIndexOf('/src/')

    let potentialRoot = null

    if (srcIndex > -1) {
      potentialRoot = filePath.substring(0, srcIndex)
    } else if (filePath.startsWith('src/')) {
      potentialRoot = ''
    } else {
      console.error(`File is not located within a 'src' directory: ${filePath}`)
      return null
    }

    const tomlPath = potentialRoot ? `${potentialRoot}/Nargo.toml` : 'Nargo.toml'

    // @ts-ignore
    const tomlExists = await this.call('fileManager', 'exists', tomlPath)

    if (tomlExists) {
      const projectRoot = potentialRoot || '/'
      return projectRoot
    } else {
      console.error(`'Nargo.toml' not found at the expected project root: '${potentialRoot || '/'}'.`)
      return null
    }
  }

  async compile(path: string): Promise<void> {
    try {
      const requestID = this.generateRequestID()

      this.lastCompilationDetails = {
        error: '',
        path,
        id: requestID
      }

      if (this.ws.readyState === WebSocket.OPEN) {
        const projectRoot = await this.findProjectRoot(path)

        if (projectRoot === null) {
          const errorMsg = `Invalid project structure for '${path}'. A '.nr' file must be inside a 'src' folder, and a 'Nargo.toml' file must exist in the project root directory.`
          this.call('terminal', 'log', { type: 'error', value: errorMsg })
          this.emit('statusChanged', { key: 'error', title: 'Invalid project structure', type: 'error' })
          this.internalEvents.emit('noir_compiling_errored', new Error(errorMsg))
          return
        }

        this.ws.send(JSON.stringify({ requestId: requestID }))
        this.internalEvents.emit('noir_compiling_start')
        this.emit('statusChanged', { key: 'loading', title: 'Compiling Noir Program...', type: 'info' })
        // @ts-ignore
        this.call('terminal', 'log', { type: 'log', value: 'Compiling ' + path })

        await this.setupNargoToml(projectRoot)

        // @ts-ignore
        const zippedProject: Blob = await this.call('fileManager', 'download', projectRoot, false, ['build'])
        const formData = new FormData()

        formData.append('file', zippedProject, `${extractNameFromKey(path)}.zip`)
        // @ts-ignore
        const response = await axios.post(`${BASE_URL}/compile?requestId=${requestID}`, formData)

        if (!response.data || !response.data.success) {
          this.internalEvents.emit('noir_compiling_errored', new Error('Compilation failed'))
          this.logFn('Compilation failed')
          return
        } else {
          const { compiledJson, proverToml } = response.data

          const buildPath = projectRoot === '/' ? 'build' : `${projectRoot}/build`

          this.call('fileManager', 'writeFile', `${buildPath}/program.json`, compiledJson)
          this.call('fileManager', 'writeFile', `${buildPath}/prover.toml`, proverToml)

          this.internalEvents.emit('noir_compiling_done')
          this.emit('statusChanged', { key: 'succeed', title: 'Noir circuit compiled successfully', type: 'success' })
          // @ts-ignore
          await this.call('editor', 'clearErrorMarkers', [path])
        }
      } else {
        this.internalEvents.emit('noir_compiling_errored', new Error('Compilation failed: WebSocket connection not open'))
        this.logFn('Compilation failed: WebSocket connection not open')
      }
    } catch (e) {
      console.error(e)
    }
  }

  async parse(path: string, content?: string): Promise<void> {
    if (!content) content = await this.call('fileManager', 'readFile', path)
    const result = this.parser.parseNoirCode(content)

    if (result.length > 0) {
      const markers = []

      for (const error of result) {
        markers.push({
          message: error.message,
          severity: 'error',
          position: error.position,
          file: path,
        })
      }
      // @ts-ignore
      await this.call('editor', 'addErrorMarker', markers)
    } else {
      // @ts-ignore
      await this.call('editor', 'clearErrorMarkers', [path])
    }
  }

  async logFn(log) {
    this.lastCompilationDetails.error = log
    //const regex = /(warning|error):\s*([^\n]+)\s*┌─\s*([^:]+):(\d+):/gm;
    const regex = /(error):\s*([^\n]+)\s*┌─\s*([^:]+):(\d+):/gm;
    const pathContent = await this.call('fileManager', 'readFile', this.lastCompilationDetails.path)
    const markers = Array.from(this.lastCompilationDetails.error.matchAll(regex), (match) => {
      const severity = match[1]
      const message = match[2].trim()
      const errorPath = match[3]
      const line = parseInt(match[4])
      const start = { line, column: 1 }
      const end = { line, column: pathContent.split('\n')[line - 1].length + 1 }

      return {
        message: `${severity}: ${message}`,
        severity: severity === 'error' ? 'error' : 'warning',
        position: { start, end },
        file: errorPath
      }
    })
    // @ts-ignore
    await this.call('editor', 'addErrorMarker', markers)
    this.emit('statusChanged', { key: markers.length, title: this.lastCompilationDetails.error, type: 'error' })
    this.internalEvents.emit('noir_compiling_errored', this.lastCompilationDetails.error)
    this.call('terminal', 'log', { type: 'error', value: log })
  }

  debugFn(log) {
    this.call('terminal', 'log', { type: 'log', value: log })
  }
}
