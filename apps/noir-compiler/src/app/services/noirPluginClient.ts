import { PluginClient } from '@remixproject/plugin'
import { createClient } from '@remixproject/plugin-webview'
import EventManager from 'events'
import { DEFAULT_TOML_CONFIG } from '../actions/constants'
import NoirParser from './noirParser'
import { extractNameFromKey } from '@remix-ui/helper'
import axios from 'axios'
import JSZip from 'jszip'
import { VerifierInputs } from '../types'

interface NoirAbi {
  parameters: { name: string, type: any, visibility: 'public' | 'private' }[]
  return_type?: { visibility: 'public' | 'private' }
}

export class NoirPluginClient extends PluginClient {
  public internalEvents: EventManager
  public parser: NoirParser
  public ws: WebSocket
  public lastCompilationDetails: {
    error: string
    path: string
    id: string
  }
  public isActivated: boolean = false

  constructor() {
    super()
    this.methods = ['init', 'parse', 'compile', 'generateProof']
    createClient(this)
    this.internalEvents = new EventManager()
    this.parser = new NoirParser()
    this.onload()
  }

  init(): void {
  }

  onActivation(): void {
    this.isActivated = true
    this.internalEvents.emit('noir_activated')
    this.setupWebSocketEvents()
  }

  setupWebSocketEvents(): void {
    // @ts-ignore
    this.ws = new WebSocket(`${WS_URL}`)
    this.ws.onopen = () => {
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

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
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

  private async ensureWebSocketReady(timeoutMs: number = 5000): Promise<boolean> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return true

    const startTime = Date.now()
    while (Date.now() - startTime < timeoutMs) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) return true
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return false
  }

  async compile(path: string): Promise<void> {
    try {
      const requestID = this.generateRequestID()

      this.lastCompilationDetails = {
        error: '',
        path,
        id: requestID
      }

      const isConnected = await this.ensureWebSocketReady()

      if (isConnected) {
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

          const proverTomlPath = projectRoot === '/' ? 'Prover.toml' : `${projectRoot}/Prover.toml`
          this.call('fileManager', 'writeFile', proverTomlPath, proverToml)

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

  async generateProof(path: string): Promise<void> {
    const requestID = this.generateRequestID()

    this.internalEvents.emit('noir_proofing_start')
    this.emit('statusChanged', { key: 'loading', title: 'Generating Proof...', type: 'info' })
    this.call('terminal', 'log', { type: 'log', value: 'Generating proof for ' + path })

    let projectRoot: string | null = null

    try {
      const isConnected = await this.ensureWebSocketReady()

      if (!isConnected) {
        throw new Error('WebSocket connection not open (Timeout). Cannot generate proof.')
      }

      projectRoot = await this.findProjectRoot(path)
      if (projectRoot === null) {
        throw new Error(`Invalid project structure for '${path}'. Could not find project root.`)
      }

      // @ts-ignore
      const zippedProject: Blob = await this.call('fileManager', 'download', projectRoot, false)
      const formData = new FormData()
      formData.append('file', zippedProject, `${extractNameFromKey(path)}.zip`)

      this.ws.send(JSON.stringify({ requestId: requestID }))
      // @ts-ignore
      const response = await axios.post(`${BASE_URL}/generate-proof-with-verifier?requestId=${requestID}`, formData, {
        responseType: 'blob'
      })

      if (response.status !== 200) {
        try {
          const errorJson = JSON.parse(await response.data.text())
          throw new Error(errorJson.error || `Backend returned status ${response.status}`)
        } catch (parseError) {
          throw new Error(`Backend returned status ${response.status}: ${response.statusText}`)
        }
      }

      const receivedBlob = response.data
      this.call('terminal', 'log', { type: 'log', value: 'Received proof artifacts. Extracting files...' })

      const zip = await JSZip.loadAsync(receivedBlob)
      const buildPath = projectRoot === '/' ? 'build' : `${projectRoot}/build`
      const contractsPath = projectRoot === '/' ? 'contracts' : `${projectRoot}/contracts`
      const scriptsPath = projectRoot === '/' ? 'scripts' : `${projectRoot}/scripts`

      let formattedProof: string | null = null
      let formattedPublicInputsStr: string | null = null

      const filesToSave = {
        'vk': { path: `${buildPath}/vk`, type: 'hex' },
        'scripts/verify.ts': { path: `${scriptsPath}/verify.ts`, type: 'string', isScript: true },
        'verifier/solidity/Verifier.sol': { path: `${contractsPath}/Verifier.sol`, type: 'string' },
        'proof': { path: `${buildPath}/proof`, type: 'string', isProof: true },
        'public_inputs': { path: `${buildPath}/public_inputs`, type: 'string', isPublicInputs: true },
      }

      for (const [zipPath, info] of Object.entries(filesToSave)) {
        const file = zip.file(zipPath)

        if (file) {
          let content: string;

          if (info.type === 'hex') {
            const bytes = await file.async('uint8array');
            content = this.bytesToHex(bytes);
          } else {
            content = await file.async('string');
          }

          // @ts-ignore
          if (info.isProof) formattedProof = content
          // @ts-ignore
          if (info.isPublicInputs) formattedPublicInputsStr = content
          // @ts-ignore
          if (info.isScript) {
            content = content.replace(/%%BUILD_PATH%%/g, buildPath)
          }

          await this.call('fileManager', 'writeFile', info.path, content)
          // @ts-ignore
          this.call('terminal', 'log', { type: 'log', value: `Wrote artifact: ${info.path}` })

        } else {
          // @ts-ignore
          this.call('terminal', 'log', { type: 'warn', value: `Warning: File '${zipPath}' not found in zip from backend.` })
        }
      }
      // @ts-ignore
      this.call('terminal', 'log', { type: 'log', value: 'Formatting Verifier.sol inputs...' })

      if (!formattedProof || !formattedPublicInputsStr) {
        console.error('[Noir Plugin] Error: formattedProof or formattedPublicInputsStr is null or empty after loop.')
        throw new Error("Formatted proof or public inputs data could not be read from zip stream.")
      }

      const formattedPublicInputs = JSON.parse(formattedPublicInputsStr)

      const verifierInputs: VerifierInputs = {
        proof: formattedProof,
        publicInputs: formattedPublicInputs
      }

      this.internalEvents.emit('noir_proofing_done', verifierInputs)

      this.emit('statusChanged', { key: 'succeed', title: 'Proof generated successfully', type: 'success' })
      this.call('terminal', 'log', { type: 'log', value: 'Proof generation and file extraction complete.' })

    } catch (e) {
      console.error(`[${requestID}] Proof generation failed:`, e)
      let errorMsg = e.message || 'Unknown error during proof generation'

      if (e.response && e.response.data) {
        try {
          let errorData = e.response.data

          if (e.response.data instanceof Blob) {
            const errorText = await e.response.data.text()
            errorData = JSON.parse(errorText)
          }

          if (errorData.error) {
            errorMsg = errorData.error
          } else if (typeof errorData === 'string') {
            errorMsg = errorData
          }
        } catch (parseError) {
          console.error('Failed to parse backend error response:', parseError)
          errorMsg = e.response.statusText || e.message
        }
      }
      this.internalEvents.emit('noir_proofing_errored', e)
      this.call('terminal', 'log', { type: 'error', value: errorMsg })

      if (projectRoot !== null) {
        try {
          const buildPath = projectRoot === '/' ? 'build' : `${projectRoot}/build`
          await this.call('fileManager', 'writeFile', `${buildPath}/proof_error.log`, errorMsg)
        } catch (logError) {
          console.error('Failed to write error log file:', logError)
        }
      }
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
