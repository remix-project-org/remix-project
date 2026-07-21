import { PluginClient } from '@remixproject/plugin'
import { createClient } from '@remixproject/plugin-webview'
import EventEmitter from 'events'
// eslint-disable @nx/enforce-module-boundaries
import { processStr } from 'solhint'
import { applyExtends } from 'solhint/lib/config/config-file'
import bestPractises from 'solhint/lib/rules/best-practises'
import naming from 'solhint/lib/rules/naming'
import order from 'solhint/lib/rules/order'
import security from 'solhint/lib/rules/security'
import deprecations from 'solhint/lib/rules/deprecations'
import miscellaneous from 'solhint/lib/rules/miscellaneous'
import { customAction } from '@remixproject/plugin-api'

type Report = {
  line: number
  column: number
  severity: string
  message: string
  ruleId: string
  fix: string
}

const Config = `{
  "extends": "solhint:recommended",
  "plugins": [],
  "rules": {
    "avoid-suicide": "error",
    "avoid-sha3": "warn"
  }
}`

export class SolHint extends PluginClient {
  triggerLinter: boolean
  constructor() {
    super()
    this.methods = ['lintContract', 'lintOnCompilation', 'lintContractCustomAction', 'lint']
    createClient(this)
    this.onload().then(async () => {
      await this.lintOnCompilation()
    })
  }
  async createConfigFile() {
    await this.call('fileManager', 'writeFile', '.solhint.json', Config)
  }

  async lintOnCompilation() {
    if (!this.triggerLinter) return
    this.on('solidity', 'compilationFinished', async (fileName, source, languageVersion, data) => {
      const hints = await this.lint(fileName)
      console.log('after compile', { hints })
      this.emit('lintOnCompilationFinished', hints)
    })
    this.triggerLinter = false
  }
  /**
   * method to handle context menu action in file explorer for
   * solhint plugin
   * @param action interface CustomAction
   */
  async lintContractCustomAction(action: customAction) {
    this.triggerLinter = true
    await this.call('solidity', 'compile', action.path[0])
    await this.lintContract(action.path[0])
  }

  async lintContract(file: string) {
    const hints = await this.lint(file)
    this.emit('lintingFinished', hints)
  }

  public async lint(fileName: string) {
    const content = await this.call('fileManager', 'readFile', fileName)
    let configContent = Config
    if (await this.call('fileManager' as any, 'exists', '.solhint.json')) {
      configContent = await this.call('fileManager', 'readFile', '.solhint.json')
    }
    const configContentObj = JSON.parse(configContent)
    // apply the extend property
    const rulesObj = applyExtends(configContentObj, (path) => this.rules[path]())
    configContentObj.rules = { ...rulesObj, ...configContentObj.rules }
    configContentObj.extends = []

    const reporters = processStr(content, configContentObj)

    const reports: Array<Report> = reporters.reports
    const hints = reports.map((report: Report) => {
      return {
        formattedMessage: `${report.message}\n ${report.fix ? report.fix : ''}`,
        type: this.severity[report.severity] || 'error',
        column: report.column,
        line: report.line - 1,
        message: report.message,
        ruleId: report.ruleId,
        severity: report.severity,
        fix: report.fix,
      }
    })

    this.emit('lintingFinished', hints)
    return hints
  }

  severity = {
    2: 'error',
    3: 'warning',
  }

  rules = {
    'solhint:recommended': () => {
      const enabledRules = {}
      this.coreRules().forEach((rule) => {
        if (!rule.meta.deprecated && rule.meta.recommended) {
          enabledRules[rule.ruleId] = rule.meta.defaultSetup
        }
      })
      return enabledRules
    },
    'solhint:all': () => {
      const enabledRules = {}
      this.coreRules().forEach((rule) => {
        if (!rule.meta.deprecated) {
          enabledRules[rule.ruleId] = rule.meta.defaultSetup
        }
      })
      return enabledRules
    },
    'solhint:default': () => {
      const enabledRules = {}
      this.coreRules().forEach((rule) => {
        if (!rule.meta.deprecated && rule.meta.isDefault) {
          enabledRules[rule.ruleId] = rule.meta.defaultSetup
        }
      })
      return enabledRules
    },
  }

  coreRules() {
    return [...bestPractises(), ...deprecations(), ...miscellaneous(), ...naming(), ...order(), ...security()]
  }
}
