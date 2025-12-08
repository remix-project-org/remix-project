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

  constructor (api: ICompilerApi, contentImport) {
    this.api = api
    this.contentImport = contentImport
    this.event = new EventEmitter()
    this.compiler = new Compiler((url, cb) => api.resolveContentAndSave(url).then((result) => cb(null, result)).catch((error) => cb(error.message)))
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
  compileFile (target) {
    if (!target) throw new Error('No target provided for compilation')
    return new Promise((resolve, reject) => {
      this.api.readFile(target).then(async(content) => {
        const sources = { [target]: { content } }
        this.event.emit('removeAnnotations')
        this.event.emit('startingCompilation')
        await this.setCompilerMappings()
        await this.setCompilerConfigContent()
        // setTimeout fix the animation on chrome... (animation triggered by 'staringCompilation')
        setTimeout(() => { this.compiler.compile(sources, target); resolve(true) }, 100)
      }).catch((error) => {
        reject(error)
      })
    })
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

  runCompiler (externalCompType) {
    try {
      if (this.api.getFileManagerMode() === 'localhost' || this.api.isDesktop()) {
        if (externalCompType === 'hardhat') {
          const { currentVersion, optimize, runs } = this.compiler.state
          if (currentVersion) {
            const fileContent = `module.exports = {
              solidity: '${currentVersion.substring(0, currentVersion.indexOf('+commit'))}',
              settings: {
                optimizer: {
                  enabled: ${optimize},
                  runs: ${runs}
                }
              }
            }
            `
            const configFilePath = 'remix-compiler.config.js'
            this.api.writeFile(configFilePath, fileContent)
            if (window._matomoManagerInstance) {
              window._matomoManagerInstance.trackEvent('compiler', 'runCompile', 'compileWithHardhat')
            }
            this.api.compileWithHardhat(configFilePath).then((result) => {
              this.api.logToTerminal({ type: 'log', value: result })
            }).catch((error) => {
              this.api.logToTerminal({ type: 'error', value: error })
            })
          }
        } else if (externalCompType === 'truffle') {
          const { currentVersion, optimize, runs, evmVersion } = this.compiler.state
          if (currentVersion) {
            const fileContent = `module.exports = {
              compilers: {
                solc: {
                  version: '${currentVersion.substring(0, currentVersion.indexOf('+commit'))}',
                  settings: {
                    optimizer: {
                      enabled: ${optimize},
                      runs: ${runs},
                    },
                    evmVersion: ${evmVersion}
                  }
                }
              }
            }`
            const configFilePath = 'remix-compiler.config.js'
            this.api.writeFile(configFilePath, fileContent)
            if (window._matomoManagerInstance) {
              window._matomoManagerInstance.trackEvent('compiler', 'runCompile', 'compileWithTruffle')
            }
            this.api.compileWithTruffle(configFilePath).then((result) => {
              this.api.logToTerminal({ type: 'log', value: result })
            }).catch((error) => {
              this.api.logToTerminal({ type: 'error', value: error })
            })
          }
        }
      }
      // TODO readd saving current file
      this.api.saveCurrentFile()
      const currentFile = this.api.currentFile
      return this.compileFile(currentFile)
    } catch (err) {
      console.error(err)
    }
  }
}
