import { PluginClient } from '@remixproject/plugin'
import { createClient } from '@remixproject/plugin-webview'
import { trackMatomoEvent } from '@remix-api'
import EventManager from 'events'
import pathModule from 'path'
import { compiler_list, parse, compile, generate_r1cs, generate_witness } from 'circom_wasm'
import * as compilerV218 from 'circom_wasm/v2.1.8'
import * as compilerV217 from 'circom_wasm/v2.1.7'
import * as compilerV216 from 'circom_wasm/v2.1.6'
import * as compilerV215 from 'circom_wasm/v2.1.5'
import { extractNameFromKey, extractParentFromKey, CompilerReport } from '@remix-ui/helper'
import { CompilationConfig, PrimeValue } from '../types'
import isElectron from 'is-electron'

export class CircomPluginClient extends PluginClient {
  public internalEvents: EventManager
  private _compilationConfig: CompilationConfig = {
    version: compiler_list.latest,
    prime: "bn128"
  }
  private lastCompiledCircuitPath: string = ''
  private lastParsedFiles: Record<string, string> = {}
  private lastCompiledFile: string = ''
  private compiler: typeof compilerV215 & typeof compilerV216 & typeof compilerV217 & typeof compilerV218

  constructor() {
    super()
    this.methods = ['init', 'parse', 'compile', 'generateR1cs', 'resolveDependencies']
    createClient(this)
    this.internalEvents = new EventManager()
    this.onload()
  }

  init(): void {
    console.log('initializing circom plugin...')
  }

  onActivation(): void {
    this.internalEvents.emit('circom_activated')
  }

  set compilerVersion (version: string) {
    if (!compiler_list.versions.includes(version) && version !== "latest") throw new Error("Unsupported compiler version")
    this._compilationConfig.version = version
    if (isElectron()) {
      const versionToInstall = version === 'latest' ? 'latest' : `v${version}`
      // @ts-ignore
      this.call('circom', 'install', versionToInstall).then(() => {
        this.internalEvents.emit('download_success', version)
      }).catch((e) => {
        this.internalEvents.emit('download_failed', e)
      })
    } else {
      if (version === '2.1.5') this.compiler = compilerV215
      else if (version === '2.1.6') this.compiler = compilerV216
      else if (version === '2.1.7') this.compiler = compilerV217
      else if (version === '2.1.8') this.compiler = compilerV218
      else this.compiler = null
    }
  }

  set compilerPrime (prime: PrimeValue) {
    if ((prime !== "bn128") && (prime !== "bls12381") && (prime !== "goldilocks") && (this._compilationConfig.version === '2.1.5')) throw new Error('Invalid prime value')
    if ((prime !== "bn128") && (prime !== "bls12381") && (prime !== "goldilocks") && (prime !== "grumpkin") && (prime !== "pallas") && (prime !== "vesta") && (this._compilationConfig.version === '2.1.6')) throw new Error('Invalid prime value')
    if ((prime !== "bn128") && (prime !== "bls12381") && (prime !== "goldilocks") && (prime !== "grumpkin") && (prime !== "pallas") && (prime !== "vesta") && (this._compilationConfig.version === '2.1.7')) throw new Error('Invalid prime value')
    if ((prime !== "bn128") && (prime !== "bls12381") && (prime !== "goldilocks") && (prime !== "grumpkin") && (prime !== "pallas") && (prime !== "vesta") && (prime !== "secq256r1") && (this._compilationConfig.version === '2.1.8')) throw new Error('Invalid prime value')
    this._compilationConfig.prime = prime
  }

  async parse(path: string, fileContent?: string): Promise<[CompilerReport[], Record<string, string>]> {
    if (!fileContent) {
      // @ts-ignore
      fileContent = await this.call('fileManager', 'readFile', path)
    }
    this.lastParsedFiles = await this.resolveDependencies(path, fileContent)
    const parsedOutput = this.compiler ? this.compiler.parse(path, this.lastParsedFiles) : parse(path, this.lastParsedFiles)

    try {
      const result: CompilerReport[] = JSON.parse(parsedOutput.report())
      const mapReportFilePathToId: Record<string, string> = {}

      if (result.length === 0) {
        // @ts-ignore
        await this.call('editor', 'clearErrorMarkers', [path])
      } else {
        const markers = []

        for (const report of result) {
          for (const label in report.labels) {
            const file_id = report.labels[label].file_id

            mapReportFilePathToId[file_id] = parsedOutput.get_report_name(parseInt(file_id))
            if (file_id === '0') {
              // @ts-ignore
              const startPosition: { lineNumber: number; column: number } = await this.call(
                'editor',
                // @ts-ignore
                'getPositionAt',
                report.labels[label].range.start
              )
              // @ts-ignore
              const endPosition: { lineNumber: number; column: number } = await this.call(
                'editor',
                // @ts-ignore
                'getPositionAt',
                report.labels[label].range.end
              )

              markers.push({
                message: report.message,
                severity: report.type.toLowerCase(),
                position: {
                  start: {
                    line: startPosition.lineNumber,
                    column: startPosition.column,
                  },
                  end: {
                    line: endPosition.lineNumber,
                    column: endPosition.column,
                  },
                },
                file: path,
              })
            }
          }
        }

        if (markers.length > 0) {
          // @ts-ignore
          await this.call('editor', 'addErrorMarker', markers)
        } else {
          // @ts-ignore
          await this.call('editor', 'clearErrorMarkers', [path])
          this.emit('statusChanged', { key: 'none' })
        }
      }

      return [result, mapReportFilePathToId]
    } catch (e) {
      throw new Error(e)
    }
  }

  async compile(path: string, compilationConfig?: CompilationConfig): Promise<void> {
    if (isElectron()) {
      await this.compileElectron(path)
    } else {
      this.internalEvents.emit('circuit_compiling_start')
      this.emit('statusChanged', { key: 'loading', title: 'Compiling...', type: 'info' })
      // @ts-ignore
      this.call('terminal', 'log', { type: 'log', value: 'Compiling ' + path })
      const [parseErrors, filePathToId] = await this.parse(path)

      if (parseErrors && (parseErrors.length > 0)) {
        if (parseErrors[0].type === 'Error') {
          this.internalEvents.emit('circuit_parsing_errored', parseErrors, filePathToId)
          this.logCompilerReport(parseErrors)
          return
        }
      }
      if (compilationConfig) {
        const { prime, version } = compilationConfig

        this.compilerVersion = version
        this.compilerPrime = prime
      }
      const circuitApi = this.compiler ? this.compiler.compile(path, this.lastParsedFiles, { prime: this._compilationConfig.prime }) : compile(path, this.lastParsedFiles, { prime: this._compilationConfig.prime })
      const circuitProgram = circuitApi.program()

      if (circuitProgram.length < 1) {
        const circuitErrors = circuitApi.report()

        this.logCompilerReport(circuitErrors)
        trackMatomoEvent(this, { category: 'circuit-compiler', action: 'compile', name: 'Compilation failed', isClick: true })
        throw new Error(circuitErrors)
      } else {
        this.lastCompiledFile = path
        const fileName = extractNameFromKey(path)

        this.lastCompiledCircuitPath = extractParentFromKey(path) + "/.bin/" + fileName.replace('.circom', '_js') + '/' + fileName.replace('.circom', '.wasm')
        // @ts-ignore
        await this.call('fileManager', 'writeFile', this.lastCompiledCircuitPath, circuitProgram, { encoding: null })
        const fileContent = this.lastParsedFiles[path]
        const searchComponentName = fileContent.match(/component\s+main\s*(?:{[^{}]*})?\s*=\s*([A-Za-z_]\w*)\s*\(.*\)/)

        if (searchComponentName) {
          const componentName = searchComponentName[1]
          const signals = circuitApi.input_signals(componentName)

          this.internalEvents.emit('circuit_compiling_done', signals)
        } else {
          this.internalEvents.emit('circuit_compiling_done', [])
        }
        if (parseErrors && (parseErrors.length > 0)) {
          if (parseErrors[0].type === 'Warning') {
            this.internalEvents.emit('circuit_parsing_warning', parseErrors, filePathToId)
            this.logCompilerReport(parseErrors)
          }
        } else {
          this.internalEvents.emit('circuit_parsing_done', parseErrors, filePathToId)
          this.emit('statusChanged', { key: 'succeed', title: 'circuit compiled successfully', type: 'success' })
        }
        trackMatomoEvent(this, { category: 'circuit-compiler', action: 'compile', name: 'Compilation successful', isClick: true })
        circuitApi.log().map(log => {
          log && this.call('terminal', 'log', { type: 'log', value: log })
        })
        // @ts-ignore
        this.call('terminal', 'log', { type: 'typewritersuccess', value: 'Everything went okay' })
      }
    }
  }

  async compileElectron (path: string): Promise<void> {
    this.internalEvents.emit('circuit_compiling_start')
    this.emit('statusChanged', { key: 'loading', title: 'Compiling...', type: 'info' })
    // @ts-ignore
    this.call('terminal', 'log', { type: 'log', value: 'Compiling ' + path })
    const [parseErrors, filePathToId] = await this.parse(path)

    if (parseErrors && (parseErrors.length > 0)) {
      if (parseErrors[0].type === 'Error') {
        this.internalEvents.emit('circuit_parsing_errored', parseErrors, filePathToId)
        this.logCompilerReport(parseErrors)
        return
      }
    }
    const { version, prime } = this._compilationConfig
    const versionToInstall = version === 'latest' ? 'latest' : `v${version}`
    try {
      // @ts-ignore
      const { stdout, stderr } = await this.call('circom', 'run', path, versionToInstall, { prime: prime, wasm: "", inputs: "" })
      const fileName = extractNameFromKey(path)

      this.lastCompiledCircuitPath = pathModule.normalize(extractParentFromKey(path) + "/.bin/" + fileName.replace('.circom', '_js') + "/" + fileName.replace('.circom', '.wasm'))
      if (stderr) this.call('terminal', 'log', { type: 'error', value: stderr })
      if (stdout) this.call('terminal', 'log', { type: 'log', value: stdout })
    } catch (error) {
      this.call('terminal', 'log', { type: 'error', value: error.message })
      this.internalEvents.emit('circuit_compiling_errored', error)
      this.emit('statusChanged', { key: 'errored', title: 'Compilation failed', type: 'error' })
      return
    }
    // @ts-ignore
    const signals = await this.call('circom', 'getInputs')

    this.internalEvents.emit('circuit_compiling_done', signals)
    if (parseErrors && (parseErrors.length > 0)) {
      if (parseErrors[0].type === 'Warning') {
        this.internalEvents.emit('circuit_parsing_warning', parseErrors, filePathToId)
        this.logCompilerReport(parseErrors)
      }
    } else {
      this.internalEvents.emit('circuit_parsing_done', parseErrors, filePathToId)
      this.emit('statusChanged', { key: 'succeed', title: 'circuit compiled successfully', type: 'success' })
    }
  }

  async generateR1cs (path: string, compilationConfig?: CompilationConfig): Promise<void> {
    if (isElectron()) {
      await this.generateR1csElectron(path)
    } else {
      const [parseErrors, filePathToId] = await this.parse(path)

      if (parseErrors && (parseErrors.length > 0)) {
        if (parseErrors[0].type === 'Error') {
          this.logCompilerReport(parseErrors)
          return
        } else if (parseErrors[0].type === 'Warning') {
          this.logCompilerReport(parseErrors)
        }
      }
      if (compilationConfig) {
        const { prime, version } = compilationConfig

        this.compilerVersion = version
        this.compilerPrime = prime
      }
      const r1csApi = this.compiler ? this.compiler.generate_r1cs(path, this.lastParsedFiles, { prime: this._compilationConfig.prime }) : generate_r1cs(path, this.lastParsedFiles, { prime: this._compilationConfig.prime })
      const r1csProgram = r1csApi.program()

      if (r1csProgram.length < 1) {
        const r1csErrors = r1csApi.report()

        this.logCompilerReport(r1csErrors)
        trackMatomoEvent(this, { category: 'circuit-compiler', action: 'generateR1cs', name: 'R1CS Generation failed', isClick: true })
        throw new Error(r1csErrors)
      } else {
        const fileName = extractNameFromKey(path)
        const writePath = extractParentFromKey(path) + "/.bin/" + fileName.replace('.circom', '.r1cs')

        // @ts-ignore
        await this.call('fileManager', 'writeFile', writePath, r1csProgram, true)
        trackMatomoEvent(this, { category: 'circuit-compiler', action: 'generateR1cs', name: 'R1CS Generation successful', isClick: true })
        r1csApi.log().map(log => {
          log && this.call('terminal', 'log', { type: 'log', value: log })
        })
        // @ts-ignore
        this.call('terminal', 'log', { type: 'typewritersuccess', value: 'Everything went okay' })
      }
    }
  }

  async generateR1csElectron (path: string): Promise<void> {
    this.internalEvents.emit('circuit_generating_r1cs_start')
    this.emit('statusChanged', { key: 'loading', title: 'Generating...', type: 'info' })
    // @ts-ignore
    this.call('terminal', 'log', { type: 'log', value: 'Generating R1CS for ' + path })
    const [parseErrors, filePathToId] = await this.parse(path)

    if (parseErrors && (parseErrors.length > 0)) {
      if (parseErrors[0].type === 'Error') {
        this.logCompilerReport(parseErrors)
        return
      } else if (parseErrors[0].type === 'Warning') {
        this.logCompilerReport(parseErrors)
      }
    }
    const { version, prime } = this._compilationConfig
    const versionToInstall = version === 'latest' ? 'latest' : `v${version}`
    // @ts-ignore
    await this.call('circom', 'run', path, versionToInstall, {
      prime: prime,
      r1cs: ""
    })
    this.internalEvents.emit('circuit_generating_r1cs_done')
    this.emit('statusChanged', { key: 'succeed', title: 'r1cs generated successfully', type: 'success' })
  }

  async computeWitness (input: string): Promise<Uint8Array> {
    this.internalEvents.emit('circuit_computing_witness_start')
    this.emit('statusChanged', { key: 'loading', title: 'Computing...', type: 'info' })
    const wasmPath = this.lastCompiledCircuitPath

    if (!wasmPath) throw new Error('No wasm file found')
    // @ts-ignore
    const buffer: any = await this.call('fileManager', 'readFile', wasmPath, { encoding: null })
    const dataRead = new Uint8Array(buffer)
    const witness = this.compiler ? await this.compiler.generate_witness(dataRead, input) : await generate_witness(dataRead, input)
    // @ts-ignore
    await this.call('fileManager', 'writeFile', wasmPath.replace('.wasm', '.wtn'), witness, { encoding: null })
    trackMatomoEvent(this, { category: 'circuit-compiler', action: 'compiler.generate_witness', name: wasmPath.replace('.wasm', '.wtn'), isClick: true })
    this.internalEvents.emit('circuit_computing_witness_done')
    this.emit('statusChanged', { key: 'succeed', title: 'witness computed successfully', type: 'success' })
    return witness
  }

  async resolveDependencies(filePath: string, fileContent: string, output?: Record<string, string>, depPath: string = '', blackPath: string[] = []): Promise<Record<string, string>> {
    if (!output) output = { [filePath]: fileContent }
    // extract all includes
    const includes = (fileContent.match(/include ['"].*['"]/g) || []).map((include) => include.replace(/include ['"]/g, '').replace(/['"]/g, ''))

    await Promise.all(
      includes.map(async (include) => {
        // fix for endless recursive includes
        if (blackPath.includes(include)) return
        let dependencyContent = ''
        let path = include.replace(/(\.\.\/)+/g, '')
        // @ts-ignore
        const pathExists = await this.call('fileManager', 'exists', path)

        if (pathExists) {
          // fetch file content if include import (path) exists within same level as current file opened in editor
          dependencyContent = await this.call('fileManager', 'readFile', path)
        } else {
          // if include import (path) does not exist, try to construct relative path using the original file path (current file opened in editor)
          let relativePath = pathModule.resolve(filePath.slice(0, filePath.lastIndexOf('/')), include)
          if (relativePath.indexOf('/') === 0) relativePath = relativePath.slice(1)
          const relativePathExists = await this.call(
            'fileManager',
            // @ts-ignore
            'exists',
            relativePath
          )

          if (relativePathExists) {
            // fetch file content if include import exists as a relative path
            path = relativePath
            dependencyContent = await this.call('fileManager', 'readFile', relativePath)
          } else {
            if (include.startsWith('circomlib')) {
              const splitInclude = include.split('/')
              const version = splitInclude[1].match(/v[0-9]+.[0-9]+.[0-9]+/g)

              try {
                // try to resolve include import from .deps folder
                if (version && version[0]) {
                  path = `.deps/https/raw.githubusercontent.com/iden3/circomlib/${version[0]}/${splitInclude.slice(2).join('/')}`
                  dependencyContent = await this.call('contentImport', 'resolveAndSave', path, null)
                } else {
                  path = `.deps/https/raw.githubusercontent.com/iden3/circomlib/${splitInclude.slice(1).join('/')}`
                  dependencyContent = await this.call('contentImport', 'resolveAndSave', path, null)
                }
              } catch (e) {
                // try to resolve include import from github if it is a circomlib dependency
                if (version && version[0]) {
                  path = `https://raw.githubusercontent.com/iden3/circomlib/${version[0]}/${splitInclude.slice(2).join('/')}`
                  dependencyContent = await this.call('contentImport', 'resolveAndSave', path, null)
                } else {
                  path = `https://raw.githubusercontent.com/iden3/circomlib/master/${splitInclude.slice(1).join('/')}`
                  const { content } = await this.call('contentImport', 'resolve', path)

                  if (content) {
                    dependencyContent = await this.call('contentImport', 'resolveAndSave', path, null)
                    const savePath = `.deps/https/raw.githubusercontent.com/iden3/${include}`

                    // @ts-ignore
                    await this.call('fileManager', 'writeFile', savePath, dependencyContent)
                  }
                }
              }
            } else {
              if (depPath) {
                // resolves relative dependencies for .deps folder
                path = pathModule.resolve(depPath.slice(0, depPath.lastIndexOf('/')), include)
                path = path.replace('https:/', 'https://')
                if (path.indexOf('/') === 0) path = path.slice(1)
                dependencyContent = await this.call('contentImport', 'resolveAndSave', path, null)
              } else {
                // If all import cases are not true, use the default import to try fetching from node_modules and unpkg
                dependencyContent = await this.call('contentImport', 'resolveAndSave', path, null)
              }
            }
          }
        }
        if (path.indexOf('https://') === 0) {
          // Regular expression to match include statements and make deps imports uniform
          const includeRegex = /include "(.+?)";/g
          const replacement = 'include "circomlib/circuits/$1";'

          dependencyContent = dependencyContent.replace(includeRegex, replacement)
        } else {
          if (!include.startsWith('circomlib') && !pathModule.isAbsolute(filePath) && !pathModule.isAbsolute(path)) {
          // if include is not absolute, resolve it using the parent path of the current file opened in editor
            const absIncludePath = pathModule.resolve('/' + filePath.slice(0, filePath.lastIndexOf('/')), '/' + path)

            output[filePath] = output[filePath].replace(`${include}`, `${absIncludePath}`)
            include = absIncludePath
          }
        }
        // extract all includes from the dependency content
        const dependencyIncludes = (dependencyContent.match(/include ['"].*['"]/g) || []).map((childInclude) => {
          const includeName = childInclude.replace(/include ['"]/g, '').replace(/['"]/g, '')
          let absFilePath = pathModule.resolve(include.slice(0, include.lastIndexOf('/')), includeName)

          absFilePath = include.startsWith('circomlib') ? absFilePath.substring(1) : absFilePath
          if (!blackPath.includes(absFilePath)) {
            if (!includeName.startsWith('circomlib')) {
              dependencyContent = dependencyContent.replace(`${includeName}`, `${absFilePath}`)
              return absFilePath
            }
            return includeName
          } else {
            // if include already exists in output, remove it from the dependency content
            const includePattern = new RegExp(`include "\\s*${includeName}\\s*";`, 'g')

            dependencyContent = dependencyContent.replace(includePattern, '')
            return
          }
        }).filter((childInclude) => childInclude)
        blackPath.push(include)
        // recursively resolve all dependencies of the dependency
        if (dependencyIncludes.length > 0) {
          await this.resolveDependencies(filePath, dependencyContent, output, path, blackPath)
          output[include] = dependencyContent
        } else {
          output[include] = dependencyContent
        }
      })
    )
    return output
  }

  async resolveReportPath (path: string): Promise<string> {
    // @ts-ignore
    const pathExists = await this.call('fileManager', 'exists', path)

    if (pathExists) return path
    else {
      // if include import (path) does not exist, try to construct relative path using the original file path (current file opened in editor)
      let relativePath = pathModule.resolve(this.lastCompiledFile.slice(0, this.lastCompiledFile.lastIndexOf('/')), path)
      if (relativePath.indexOf('/') === 0) relativePath = relativePath.slice(1)
      // @ts-ignore
      const relativePathExists = await this.call('fileManager', 'exists', relativePath)

      if (relativePathExists) return relativePath
      else {
        if (path.startsWith('circomlib')) {
          // try to resolve include import from github if it is a circomlib dependency
          const splitInclude = path.split('/')
          const version = splitInclude[1].match(/v[0-9]+.[0-9]+.[0-9]+/g)

          if (version && version[0]) {
            path = `/.deps/https/raw.githubusercontent.com/iden3/circomlib/${version[0]}/${splitInclude.slice(2).join('/')}`
          } else {
            path = `/.deps/https/raw.githubusercontent.com/iden3/circomlib/master/${splitInclude.slice(1).join('/')}`
          }
          // @ts-ignore
          const exists = await this.call('fileManager', 'exists', path)

          if (exists) return path
          else throw new Error(`Report path ${path} does not exist in the Remix FileSystem`)
        } else {
          throw new Error(`Report path ${path} does not exist in the Remix FileSystem`)
        }
      }
    }
  }

  async logCompilerReport (report: CompilerReport[]): Promise<void> {
    this.call('terminal', 'log', { type: 'log', value: JSON.stringify(report, null, 2) })
    if (report[0].type === 'Error') {
      this.call('terminal', 'log', { type: 'error', value: 'previous errors were found' })
      this.emit('statusChanged', { key: report.length, title: `You have ${report.length} problem${report.length === 1 ? '' : 's'}`, type: 'error' })
    }
    if (report[0].type === 'Warning') {
      this.call('terminal', 'log', { type: 'log', value: 'previous warnings were found' })
      this.emit('statusChanged', { key: report.length, title: `You have ${report.length} problem${report.length === 1 ? '' : 's'}`, type: 'warning' })
    }
  }

  async getCompilerDownloadList () {
    if (!isElectron()) return []
    else {
      return await Promise.all(compiler_list.versions.map(async (version) => {
        const versionToInstall = version === 'latest' ? 'latest' : `v${version}`
        // @ts-ignore
        const exists = await this.call('circom', 'isVersionInstalled', versionToInstall)

        if (!exists) return version
      }))
    }
  }
}
