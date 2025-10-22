import { Plugin } from '@remixproject/engine'
import * as packageJson from '../../../../../package.json'
import { trackMatomoEvent } from '@remix-api'

export const profile = {
  name: 'compileAndRun',
  displayName: 'Compile and Run',
  description: 'After each compilation, run the script defined in Natspec.',
  methods: ['runScriptAfterCompilation'],
  version: packageJson.version,
  kind: 'none'
}

type listener = (event: KeyboardEvent) => void

export class CompileAndRun extends Plugin {
  executionListener: listener
  targetFileName: string

  constructor () {
    super(profile)
    this.executionListener = async (e) => {
      // ctrl+e or command+e

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.keyCode === 83) {
        const file = await this.call('fileManager', 'file')
        if (file) {
          if (file.endsWith('.sol')) {
            e.preventDefault()
            this.targetFileName = file
            await this.call('solidity', 'compile', file)
            trackMatomoEvent(this, { category: 'ScriptExecutor', action: 'CompileAndRun', name: 'compile_solidity', isClick: true })
          } else if (file.endsWith('.js') || file.endsWith('.ts')) {
            e.preventDefault()
            this.runScript(file, false)
            trackMatomoEvent(this, { category: 'ScriptExecutor', action: 'CompileAndRun', name: 'run_script', isClick: true })
          }
        }
      }
    }
  }

  runScriptAfterCompilation (fileName: string) {
    this.targetFileName = fileName
    trackMatomoEvent(this, { category: 'ScriptExecutor', action: 'CompileAndRun', name: 'request_run_script', isClick: true })
  }

  async runScript (fileName, clearAllInstances) {
    await this.call('terminal', 'log', { value: `running ${fileName} ...`, type: 'info' })
    try {
      const exists = await this.call('fileManager', 'exists', fileName)
      if (!exists) {
        await this.call('terminal', 'log', { value: `${fileName} does not exist.`, type: 'info' } )
        return
      }
      const content = await this.call('fileManager', 'readFile', fileName)
      if (clearAllInstances) {
        await this.call('udapp', 'clearAllInstances')
      }
      await this.call('scriptRunnerBridge', 'execute', content, fileName)
    } catch (e) {
      this.call('notification', 'toast', e.message || e)
    }
  }

  onActivation () {
    window.document.addEventListener('keydown', this.executionListener)

    this.on('compilerMetadata', 'artefactsUpdated', async (fileName, contract) => {
      if (this.targetFileName === contract.file) {
        this.targetFileName = null
        if (contract.object && contract.object.devdoc['custom:dev-run-script']) {
          const file = contract.object.devdoc['custom:dev-run-script']
          if (file) {
            this.runScript(file, true)
            trackMatomoEvent(this, { category: 'ScriptExecutor', action: 'CompileAndRun', name: 'run_script_after_compile', isClick: true })
          } else {
            this.call('notification', 'toast', 'You have not set a script to run. Set it with @custom:dev-run-script NatSpec tag.')
          }
        } else {
          this.call('notification', 'toast', 'You have not set a script to run. Set it with @custom:dev-run-script NatSpec tag.')
        }
      }
    })
  }

  onDeactivation () {
    window.document.removeEventListener('keydown', this.executionListener)
    this.off('compilerMetadata', 'artefactsUpdated')
  }
}
