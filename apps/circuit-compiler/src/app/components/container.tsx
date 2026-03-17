import { useContext } from 'react'
import { CompileBtn, CustomTooltip, RenderIf } from '@remix-ui/helper'
import { FormattedMessage, useIntl } from 'react-intl'
import { CircuitAppContext } from '../contexts'
import { CompileOptions, CompilerReport } from '@remix-ui/helper'
import { VersionList } from './versions'
import { Toggler } from './toggler'
import { Configurations } from './configurations'
import { WitnessSection } from './witness'
import { CompilerFeedback } from '@remix-ui/helper'
import { PrimeValue } from '../types'
import { SetupExports } from './setupExports'
import { GenerateProof } from './generateProof'
import { compileCircuit } from '../actions'

export function Container () {
  const circuitApp = useContext(CircuitAppContext)
  const intl = useIntl()

  const showCompilerLicense = async (message = 'License not available') => {
    try {
      const response = await fetch('https://raw.githubusercontent.com/iden3/circom/master/COPYING')
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      const content = await response.text()
      // @ts-ignore
      circuitApp.plugin.call('notification', 'modal', { id: 'modal_circuit_compiler_license', title: 'Compiler License', message: content })
    } catch (e) {
      // @ts-ignore
      circuitApp.plugin.call('notification', 'modal', { id: 'modal_circuit_compiler_license', title: 'Compiler License', message })
    }
  }

  const handleVersionSelect = (version: string) => {
    circuitApp.plugin.compilerVersion = version
    circuitApp.dispatch({ type: 'SET_COMPILER_VERSION', payload: version })
  }

  const handleOpenErrorLocation = async (report: CompilerReport) => {
    if (report.labels.length > 0) {
      const location = circuitApp.appState.filePathToId[report.labels[0].file_id]
      const startRange = report.labels[0].range.start
      if (location) {
        const fullPathLocation = await circuitApp.plugin.resolveReportPath(location)

        await circuitApp.plugin.call('fileManager', 'open', fullPathLocation)
        // @ts-ignore
        const startPosition: { lineNumber: number; column: number } = await circuitApp.plugin.call('editor', 'getPositionAt', startRange)
        // @ts-ignore
        await circuitApp.plugin.call('editor', 'gotoLine', startPosition.lineNumber - 1, startPosition.column)
      }
    }
  }

  const handlePrimeChange = (value: PrimeValue) => {
    circuitApp.plugin.compilerPrime = value
    circuitApp.dispatch({ type: 'SET_PRIME_VALUE', payload: value as PrimeValue })
  }

  const handleCircuitAutoCompile = (value: boolean) => {
    circuitApp.dispatch({ type: 'SET_AUTO_COMPILE', payload: value })
  }

  const handleCircuitHideWarnings = (value: boolean) => {
    circuitApp.dispatch({ type: 'SET_HIDE_WARNINGS', payload: value })
  }

  const askGPT = async (report: CompilerReport) => {
    if (report.labels.length > 0) {
      const location = circuitApp.appState.filePathToId[report.labels[0].file_id]
      const error = report.labels[0].message

      if (location) {
        const fullPathLocation = await circuitApp.plugin.resolveReportPath(location)
        const content = await circuitApp.plugin.call('fileManager', 'readFile', fullPathLocation)
        const message = `
          circom code: ${content}
          error message: ${error}
          full circom error: ${JSON.stringify(report, null, 2)}
          explain why the error occurred and how to fix it.
          `
        await circuitApp.plugin.call('menuicons' as any, 'select', 'remixaiassistant')
        setTimeout(async () => {
          await circuitApp.plugin.call('remixAI' as any, 'chatPipe', 'error_explaining', message)
        }, 500)
      } else {
        const message = `
          error message: ${error}
          full circom error: ${JSON.stringify(report, null, 2)}
          explain why the error occurred and how to fix it.
          `
        await circuitApp.plugin.call('menuicons' as any, 'select', 'remixaiassistant')
        setTimeout(async () => {
          await circuitApp.plugin.call('remixAI' as any, 'chatPipe', 'error_explaining', message)
        }, 500)
      }
    } else {
      const error = report.message
      const message = `
      error message: ${error}
      full circom error: ${JSON.stringify(report, null, 2)}
      explain why the error occurred and how to fix it.
      `
      await circuitApp.plugin.call('menuicons' as any, 'select', 'remixaiassistant')
      setTimeout(async () => {
        await circuitApp.plugin.call('remixAI' as any, 'chatPipe', 'error_explaining', message)
      }, 500)
    }
  }

  const handleCompileClick = () => {
    compileCircuit(circuitApp.plugin, circuitApp.appState)
  }

  return (
    <section>
      <article>
        <div className="pt-0 circuit_section">
          <div className="mb-1">
            <label className="circuit_label form-check-label">
              <FormattedMessage id="circuit.compiler" />
            </label>
            <CustomTooltip
              placement="bottom"
              tooltipId="showCircumCompilerTooltip"
              tooltipClasses="text-nowrap"
              tooltipText={intl.formatMessage({ id: 'circuit.seeCompilerLicense' })}
            >
              <span className="far fa-file-certificate border-0 p-0 ms-2" onClick={() => showCompilerLicense()}></span>
            </CustomTooltip>
            <VersionList setVersion={handleVersionSelect} versionList={circuitApp.appState.versionList} currentVersion={circuitApp.appState.version} downloadList={circuitApp.appState.versionDownloadList} />
            <CompileOptions setCircuitAutoCompile={handleCircuitAutoCompile} setCircuitHideWarnings={handleCircuitHideWarnings} autoCompile={circuitApp.appState.autoCompile} hideWarnings={circuitApp.appState.hideWarnings} />
            <Toggler title='circuit.advancedConfigurations' dataId=''>
              <Configurations setPrimeValue={handlePrimeChange} primeValue={circuitApp.appState.primeValue} versionValue={circuitApp.appState.version} />
            </Toggler>
            <div className="pb-2">
              <CompileBtn id='circuit' plugin={circuitApp.plugin} appState={circuitApp.appState} compileAction={handleCompileClick} />
            </div>
            <RenderIf condition={circuitApp.appState.status !== 'compiling'}>
              <CompilerFeedback feedback={circuitApp.appState.compilerFeedback} filePathToId={circuitApp.appState.filePathToId} openErrorLocation={handleOpenErrorLocation} hideWarnings={circuitApp.appState.hideWarnings} askGPT={askGPT} />
            </RenderIf>
            <RenderIf condition={circuitApp.appState.signalInputs.length > 0}>
              <Toggler
                title='circuit.setupExports'
                dataId='setup_exports_toggler'
                show={!circuitApp.appState.setupExportStatus}
                icon={ circuitApp.appState.setupExportStatus === 'done' ? 'fas fa-check-circle text-success' : circuitApp.appState.setupExportStatus === 'update' ? 'fas fa-exclamation-triangle text-warning' : null }
                iconTooltip={ circuitApp.appState.setupExportStatus === 'update' ? intl.formatMessage({ id: 'circuit.rerunSetupWarning' }) : null }
              >
                <>
                  <SetupExports />
                  <RenderIf condition={circuitApp.appState.status !== 'exporting'}>
                    <CompilerFeedback feedback={circuitApp.appState.setupExportFeedback} filePathToId={circuitApp.appState.filePathToId} openErrorLocation={handleOpenErrorLocation} hideWarnings={circuitApp.appState.hideWarnings} askGPT={askGPT} />
                  </RenderIf>
                </>
              </Toggler>
            </RenderIf>
            <RenderIf condition={circuitApp.appState.signalInputs.length > 0}>
              <Toggler title='circuit.computeWitness' dataId='witness_toggler' show={!!circuitApp.appState.setupExportStatus}>
                <>
                  <WitnessSection />
                  <RenderIf condition={circuitApp.appState.status !== 'computing'}>
                    <CompilerFeedback feedback={circuitApp.appState.computeFeedback} filePathToId={circuitApp.appState.filePathToId} openErrorLocation={handleOpenErrorLocation} hideWarnings={circuitApp.appState.hideWarnings} askGPT={askGPT} />
                  </RenderIf>
                </>
              </Toggler>
            </RenderIf>
            <RenderIf condition={circuitApp.appState.signalInputs.length > 0}>
              <Toggler title='circuit.generateProof' dataId='generate_proof_toggler' show={!!circuitApp.appState.setupExportStatus}>
                <>
                  <GenerateProof />
                  <RenderIf condition={circuitApp.appState.status !== 'proving'}>
                    <CompilerFeedback feedback={circuitApp.appState.proofFeedback} filePathToId={circuitApp.appState.filePathToId} openErrorLocation={handleOpenErrorLocation} hideWarnings={circuitApp.appState.hideWarnings} askGPT={askGPT} />
                  </RenderIf>
                </>
              </Toggler>
            </RenderIf>
          </div>
        </div>
      </article>
    </section>
  )
}
