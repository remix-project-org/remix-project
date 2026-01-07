import { ICompilerApi } from '@remix-project/remix-lib'
import { getValidLanguage, Compiler } from '@remix-project/remix-solidity'
import { EventEmitter } from 'events'
import { configFileContent } from '../compilerConfiguration'

export class CompileTabLogic {
  public compiler
  public api: ICompilerApi
  public contentImport
  public optimize
  public runs
  public evmVersion: string
  public language: string
  public compilerImport
  public event
  public evmVersions: Array<string>
  public useFileConfiguration: boolean
  private debug: boolean = false

  constructor (api: ICompilerApi, debug?: boolean, createCompiler?: (api: ICompilerApi, debug?: boolean) => any) {
    this.api = api
    // Enable debug logging if explicitly set, or if localStorage flag is set
    this.debug = debug !== undefined ? debug : (localStorage.getItem('remix-debug-resolver') === 'true')

    this.event = new EventEmitter()

    // Create compiler (injectable). Default to legacy Compiler if none provided.
    if (createCompiler) {
      this.compiler = createCompiler(this.api, this.debug)
    } else {
      this.compiler = new Compiler((url, cb) => api.resolveContentAndSave(url).then((result) => cb(null, result)).catch((error) => cb(error.message)))
    }
    this.evmVersions = ['default', 'osaka', 'prague', 'cancun', 'shanghai', 'paris', 'london', 'berlin', 'istanbul', 'petersburg', 'constantinople', 'byzantium', 'spuriousDragon', 'tangerineWhistle', 'homestead']
  }

  init () {
    this.optimize = this.api.getCompilerQueryParameters().optimize
    this.api.setCompilerQueryParameters({ optimize: this.optimize })
    this.compiler.set('optimize', this.optimize)

    this.runs = this.api.getCompilerQueryParameters().runs
    this.runs = this.runs && this.runs !== 'undefined' ? this.runs : 200
    this.api.setCompilerQueryParameters({ runs: this.runs })
    this.compiler.set('runs', this.runs)

    this.evmVersion = this.api.getCompilerQueryParameters().evmVersion
    if (
      this.evmVersion === 'undefined' ||
      this.evmVersion === 'null' ||
      !this.evmVersion ||
      !this.evmVersions.includes(this.evmVersion)) {
      this.evmVersion = null
    }
    this.api.setCompilerQueryParameters({ evmVersion: this.evmVersion })
    this.compiler.set('evmVersion', this.evmVersion)

    this.language = getValidLanguage(this.api.getCompilerQueryParameters().language)
    if (this.language != null) {
      this.compiler.set('language', this.language)
    }

  }

  setOptimize (newOptimizeValue: boolean) {
    this.optimize = newOptimizeValue
    this.api.setCompilerQueryParameters({ optimize: this.optimize })
    this.compiler.set('optimize', this.optimize)
  }

  async setUseFileConfiguration (useFileConfiguration: boolean) {
    this.useFileConfiguration = useFileConfiguration
    this.compiler.set('useFileConfiguration', useFileConfiguration)
    await this.setCompilerConfigContent()
  }

  setRuns (runs) {
    this.runs = runs
    this.api.setCompilerQueryParameters({ runs: this.runs })
    this.compiler.set('runs', this.runs)
  }

  setEvmVersion (newEvmVersion) {
    this.evmVersion = newEvmVersion
    this.api.setCompilerQueryParameters({ evmVersion: this.evmVersion })
    this.compiler.set('evmVersion', this.evmVersion)
  }

  async getCompilerState () {
    await this.setCompilerMappings()
    await this.setCompilerConfigContent()
    return this.compiler.state
  }

  /**
   * Set the compiler to using Solidity or Yul (default to Solidity)
   * @params lang {'Solidity' | 'Yul'} ...
   */
  setLanguage (lang) {
    this.language = lang
    this.api.setCompilerQueryParameters({ language: lang })
    this.compiler.set('language', lang)
  }

  async setCompilerMappings () {
    if (await this.api.fileExists('remappings.txt')) {
      this.api.readFile('remappings.txt').then(remappings => {
        this.compiler.set('remappings', remappings.split('\n').filter(Boolean))
      })
    } else this.compiler.set('remappings', [])
  }

  async setCompilerConfigContent () {
    if (this.useFileConfiguration) {
      const remixConfigPath = 'remix.config.json'
      const configExists = await this.api.fileExists(remixConfigPath)

      if (configExists) {
        const configContent = await this.api.readFile(remixConfigPath)
        const config = JSON.parse(configContent)

        if (config['solidity-compiler']) {
          if (typeof config['solidity-compiler'] === 'string') {
            if (config['solidity-compiler'].endsWith('.json')) {
              const configFilePath = config['solidity-compiler']
              const fileExists = await this.api.fileExists(configFilePath)

              if (fileExists) {
                try {
                  const fileContent = await this.api.readFile(configFilePath)
                  config['solidity-compiler'] = JSON.parse(fileContent)
                  this.compiler.set('configFileContent', config['solidity-compiler'])
                } catch (e) {
                  throw new Error('Configuration file specified in remix.config.json contains invalid configuration')
                }
              } else {
                throw new Error('Configuration file specified in remix.config.json does not exist')
              }
            } else {
              throw new Error('Configuration file specified in remix.config.json is not a valid JSON file')
            }
          } else {
            this.compiler.set('configFileContent', config['solidity-compiler'])
          }
        } else {
          this.compiler.set('configFileContent', JSON.parse(configFileContent))
          this.api.writeFile(remixConfigPath, JSON.stringify({ ...config, 'solidity-compiler': JSON.parse(configFileContent) }, null, 2))
        }
      }
    }
  }

  /**
   * Compile a specific file of the file manager
   * @param {string} target the path to the file to compile
   */
  async compileFile (target) {
    if (!target) throw new Error('No target provided for compilation')

    try {
      // Read the entry file
      const content = await this.api.readFile(target)

      this.event.emit('removeAnnotations')
      this.event.emit('startingCompilation')
      await this.setCompilerMappings()
      await this.setCompilerConfigContent()

      const sources = { [target]: { content } }

      this.compiler.compile(sources, target)

      return true
    } catch (error) {
      console.error(`[CompileTabLogic] ❌ Compilation failed:`, error)
      throw error
    }
  }

  async isHardhatProject () {
    if (this.api.getFileManagerMode() === ('localhost') || this.api.isDesktop()) {
      return await this.api.fileExists('hardhat.config.js') || await this.api.fileExists('hardhat.config.ts')
    } else return false
  }

  async isTruffleProject () {
    if (this.api.getFileManagerMode() === ('localhost') || this.api.isDesktop()) {
      return await this.api.fileExists('truffle-config.js')
    } else return false
  }

  async isFoundryProject () {
    if (this.api.getFileManagerMode() === ('localhost') || this.api.isDesktop()) {
      return await this.api.fileExists('foundry.toml')
    } else return false
  }

  async runCompiler (externalCompType: string, path?: string) {
    // externalCompType: 'remix' | 'hardhat' | 'truffle' | 'foundry'
    try {

      const manuallySave = await this.api.getAppParameter('manual-file-saving')
      if (!manuallySave) {
        await this.api.saveCurrentFile()
      }

      if (this.api.getFileManagerMode() === 'localhost' || this.api.isDesktop()) {
        if (externalCompType === 'hardhat') {
          if (window._matomoManagerInstance) {
            window._matomoManagerInstance.trackEvent('compiler', 'runCompile', 'compileWithHardhat')
          }
          this.api.compileWithHardhat().then((result) => {
          }).catch((error) => {
            this.api.logToTerminal({ type: 'error', value: error })
          })
        } else if (externalCompType === 'truffle') {
          if (window._matomoManagerInstance) {
            window._matomoManagerInstance.trackEvent('compiler', 'runCompile', 'compileWithTruffle')
          }
          this.api.compileWithTruffle().then((result) => {
          }).catch((error) => {
            this.api.logToTerminal({ type: 'error', value: error })
          })
        } else if (externalCompType === 'foundry') {
          if (window._matomoManagerInstance) {
            window._matomoManagerInstance.trackEvent('compiler', 'runCompile', 'compileWithFoundry')
          }
          this.api.compileWithFoundry().then((result) => {
          }).catch((error) => {
            this.api.logToTerminal({ type: 'error', value: error })
          })
        }
      }
      if (externalCompType === 'remix' || !externalCompType) {
        return this.compileFile(path || this.api.currentFile)
      }
    } catch (err) {
      console.error(err)
    }
  }
}
