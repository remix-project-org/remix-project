import { useContext } from 'react'
import { CompileBtn, CompilerFeedback, CompilerReport, CustomTooltip, extractNameFromKey, RenderIf } from '@remix-ui/helper'
import { FormattedMessage } from 'react-intl'
import { NoirAppContext } from '../contexts'
import { CompileOptions } from '@remix-ui/helper'
import { compileNoirCircuit } from '../actions'

export function Container () {
  const noirApp = useContext(NoirAppContext)

  const showCompilerLicense = async (message = 'License not available') => {
    try {
      const response = await fetch('https://raw.githubusercontent.com/noir-lang/noir/master/LICENSE-APACHE')
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      const content = await response.text()
      // @ts-ignore
      noirApp.plugin.call('notification', 'modal', { id: 'modal_noir_compiler_license', title: 'Compiler License', message: content })
    } catch (e) {
      // @ts-ignore
      noirApp.plugin.call('notification', 'modal', { id: 'modal_noir_compiler_license', title: 'Compiler License', message })
    }
  }

  const handleOpenErrorLocation = async (report: CompilerReport) => {}

  const handleCircuitAutoCompile = (value: boolean) => {
    noirApp.dispatch({ type: 'SET_AUTO_COMPILE', payload: value })
  }

  const handleCircuitHideWarnings = (value: boolean) => {
    noirApp.dispatch({ type: 'SET_HIDE_WARNINGS', payload: value })
  }

  const askGPT = async (report: CompilerReport) => {}

  const handleCompileClick = () => {
    compileNoirCircuit(noirApp.plugin, noirApp.appState)
  }

  const handleGenerateProofClick = () => {
    if (!noirApp.appState.filePath) {
      console.error("No file path selected for generating proof.")
      return
    }
    noirApp.plugin.generateProof(noirApp.appState.filePath)
  }

  const handleViewProgramArtefact = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    const projectRoot = noirApp.appState.filePath.substring(0, noirApp.appState.filePath.lastIndexOf('/src/'))
    const buildPath = projectRoot === '' ? 'build' : `${projectRoot}/build`
    noirApp.plugin.call('fileManager', 'open', 'build/program.json')
  }

  const formattedPublicInputsString = JSON.stringify(noirApp.appState.formattedPublicInputs, null, 2)

  return (
    <section>
      <article>
        <div className="pt-0 noir_section">
          <div className="mb-1">
            <label className="noir_label form-check-label">
              <FormattedMessage id="noir.compiler" />
            </label>
            <CustomTooltip
              placement="bottom"
              tooltipId="showNoirCompilerTooltip"
              tooltipClasses="text-nowrap"
              tooltipText='See compiler license'
            >
              <span className="far fa-file-certificate border-0 p-0 ms-2" onClick={() => showCompilerLicense()}></span>
            </CustomTooltip>
            <CompileOptions setCircuitAutoCompile={handleCircuitAutoCompile} setCircuitHideWarnings={handleCircuitHideWarnings} autoCompile={noirApp.appState.autoCompile} hideWarnings={noirApp.appState.hideWarnings} />
            <div className="pb-2">
              <CompileBtn id="noir" plugin={noirApp.plugin} appState={noirApp.appState} compileAction={handleCompileClick} />
            </div>
            <RenderIf condition={noirApp.appState.status !== 'compiling'}>
              <CompilerFeedback feedback={noirApp.appState.compilerFeedback} filePathToId={noirApp.appState.filePathToId} openErrorLocation={handleOpenErrorLocation} hideWarnings={noirApp.appState.hideWarnings} askGPT={askGPT} />
            </RenderIf>
            <RenderIf condition={noirApp.appState.status === 'succeed'}>
              <>
                <div className='mt-2'>
                  <a data-id="view-noir-compilation-result" className="cursor-pointer text-decoration-none" href='#' onClick={handleViewProgramArtefact}>
                    <i className="text-success mt-1 px-1 fas fa-check"></i> View compiled noir program artefact.
                  </a>
                </div>

                <div className="mt-2">
                <button
                  id="noir_generate_proof"
                  className="btn btn-primary w-100"
                  onClick={handleGenerateProofClick}
                  disabled={noirApp.appState.proofingStatus === 'proofing' || noirApp.appState.status === 'compiling'}
                >
                  {noirApp.appState.proofingStatus === 'proofing' ? (
                    <>
                      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                      <span className="ms-1">Generating Proof...</span>
                    </>
                  ) : (
                    <FormattedMessage id="noir.generateProof" defaultMessage="Generate Proof" />
                  )}
                </button>
              </div>
              </>   
            </RenderIf>
            <RenderIf condition={noirApp.appState.proofingStatus === 'succeed' && !!noirApp.appState.formattedProof}>
              <div className="mt-3">
                <label className="noir_label form-check-label">
                  <FormattedMessage id="noir.verifierInputs" defaultMessage="Verifier Inputs" />
                </label>
                
                {/* _proof (bytes) */}
                <div className="mt-2">
                  <label className="form-label small mb-0">
                    <code>_proof (bytes)</code>
                  </label>
                  <textarea
                    className="form-control form-control-sm"
                    value={noirApp.appState.formattedProof}
                    readOnly
                    rows={4}
                    data-id="noir-verifier-input-proof"
                  ></textarea>
                </div>

                {/* _publicInputs (bytes32[]) */}
                <div className="mt-2">
                  <label className="form-label small mb-0">
                    <code>_publicInputs (bytes32[])</code>
                  </label>
                  <textarea
                    className="form-control form-control-sm"
                    value={formattedPublicInputsString}
                    readOnly
                    rows={4}
                    data-id="noir-verifier-input-public-inputs"
                  ></textarea>
                </div>
              </div>
            </RenderIf>
          </div>
        </div>
      </article>
    </section>
  )
}
