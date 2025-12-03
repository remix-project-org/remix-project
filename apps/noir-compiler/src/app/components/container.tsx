import { useContext } from 'react'
import { CompileBtn, CompilerFeedback, CompilerReport, CustomTooltip, extractNameFromKey, RenderIf } from '@remix-ui/helper'
import { FormattedMessage } from 'react-intl'
import { NoirAppContext } from '../contexts'
import { CompileOptions } from '@remix-ui/helper'
import { compileNoirCircuit } from '../actions'
import { trackMatomoEvent, MatomoCategories } from '@remix-api'

const NOIR_VERSION = 'v1.0.0-beta.12'
const BARRETENBERG_VERSION = 'v0.85.0'
const MATOMO_CATEGORY = MatomoCategories.NOIR_COMPILER

export function Container () {
  const noirApp = useContext(NoirAppContext)

  const projectRoot = noirApp.appState.filePath.substring(0, noirApp.appState.filePath.lastIndexOf('/src/'))
  const buildPath = projectRoot === '' ? 'build' : `${projectRoot}/build`
  const contractsPath = projectRoot === '' ? 'contracts' : `${projectRoot}/contracts`
  const scriptsPath = projectRoot === '' ? 'scripts' : `${projectRoot}/scripts`
  const proverTomlPath = projectRoot === '' ? 'Prover.toml' : `${projectRoot}/Prover.toml`

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

  const askGPT = async (report: CompilerReport) => {}

  const handleCompileClick = () => {
    trackMatomoEvent(this, { category: MATOMO_CATEGORY, action: 'compile', name: 'compile_btn_click', isClick: true })
    compileNoirCircuit(noirApp.plugin, noirApp.appState)
  }

  const handleGenerateProofClick = () => {
    if (!noirApp.appState.filePath) {
      console.error("No file path selected for generating proof.")
      return
    }
    trackMatomoEvent(this, { category: MATOMO_CATEGORY, action: 'generate_proof', name: 'generate_proof_btn_click', isClick: true })
    noirApp.plugin.generateProof(noirApp.appState.filePath)
  }

  const handleViewFile = (e: React.MouseEvent<HTMLButtonElement>, filePath: string) => {
    e.preventDefault()
    const fileName = filePath.split('/').pop() || filePath
    trackMatomoEvent(this, { category: MATOMO_CATEGORY, action: 'view_file', name: fileName, isClick: true })
    noirApp.plugin.call('fileManager', 'open', filePath)
  }

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
              <CustomTooltip
                placement="bottom"
                tooltipId="noirVersionTooltip"
                tooltipClasses="text-nowrap"
                tooltipText={`Using Noir ${NOIR_VERSION} and Barretenberg ${BARRETENBERG_VERSION}`}
              >
                <button
                  className="btn btn-light btn-block w-100 d-inline-block border form-select"
                  style={{
                    cursor: 'default',
                    opacity: 1,
                    textAlign: 'left' 
                  }}
                >
                  <div className="d-flex justify-content-between align-items-center">
                    <div className="font-sm" style={{ flexGrow: 1, overflow: 'hidden', display:'flex', justifyContent:'left' }}>
                      { NOIR_VERSION }
                    </div>
                  </div>
                </button>
              </CustomTooltip>
            </div>
            <hr></hr>
            <div>
              <CompileBtn id="noir" plugin={noirApp.plugin} appState={noirApp.appState} compileAction={handleCompileClick} />
            </div>
            <RenderIf condition={noirApp.appState.status === 'succeed'}>
              <>
                <label className="noir_label form-check-label mt-3">
                  <FormattedMessage id="noir.compilationArtifacts" defaultMessage="Compilation Artifacts" />
                </label>
                <button className="btn btn-sm btn-outline-info w-100 text-start mt-2" onClick={(e) => handleViewFile(e, `${buildPath}/program.json`)}>
                  <div className="d-flex align-items-center">
                    <i className="fas fa-file-invoice me-2"></i>
                    <span>View Artifact</span>
                  </div>
                </button>
                <hr></hr>
                <div>
                  <CustomTooltip
                    placement="bottom-start"
                    tooltipId="generateProofTooltip"
                    tooltipClasses="text-nowrap"
                    tooltipText='If your circuit has public inputs, edit Prover.toml before generating the proof.'
                  >
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
                  </CustomTooltip>
                  <button className="btn btn-sm btn-outline-info w-100 text-start mt-2" onClick={(e) => handleViewFile(e, proverTomlPath)}>
                    <div className="d-flex align-items-center">
                      <i className="fas fa-file-invoice me-2"></i>
                      <span>View Prover.toml</span>
                    </div>
                  </button>
                </div>
              </>   
            </RenderIf>
            <RenderIf condition={noirApp.appState.proofingStatus === 'succeed' && !!noirApp.appState.formattedProof}>
              <div className="mt-3">
                <label className="noir_label form-check-label">
                  <FormattedMessage id="noir.proofArtifacts" defaultMessage="Proof Artifacts" />
                </label>

                <div className="d-flex flex-wrap justify-content-between mt-2">
                  <button className="btn btn-sm btn-outline-info mb-1 flex-grow-1 text-start" onClick={(e) => handleViewFile(e, `${buildPath}/proof`)}>
                    <div className="d-flex align-items-center">
                      <i className="fas fa-file-code me-2"></i>
                      <span>View Proof</span>
                    </div>
                  </button>
                  <button className="btn btn-sm btn-outline-info mb-1 flex-grow-1 text-start" onClick={(e) => handleViewFile(e, `${buildPath}/public_inputs`)}>
                    <div className="d-flex align-items-center">
                      <i className="fas fa-file-invoice me-2"></i>
                      <span>View Public Inputs</span>
                    </div>
                  </button>
                </div>
                <div className="d-flex flex-wrap justify-content-between">
                  <button className="btn btn-sm btn-outline-info mb-1 flex-grow-1 text-start" onClick={(e) => handleViewFile(e, `${contractsPath}/Verifier.sol`)}>
                    <div className="d-flex align-items-center">
                      <i className="fab fa-ethereum me-2"></i>
                      <span>View Verifier.sol</span>
                    </div>
                  </button>
                  <button className="btn btn-sm btn-outline-info mb-1 flex-grow-1 text-start" onClick={(e) => handleViewFile(e, `${scriptsPath}/verify.ts`)}>
                    <div className="d-flex align-items-center">
                      <i className="fab fa-js-square me-2"></i>
                      <span>View verify.ts</span>
                    </div>
                  </button>
                </div>
              </div>
            </RenderIf>
            <RenderIf condition={noirApp.appState.status !== 'compiling' && noirApp.appState.proofingStatus !== 'succeed'}>
              <CompilerFeedback feedback={noirApp.appState.compilerFeedback} filePathToId={noirApp.appState.filePathToId} openErrorLocation={handleOpenErrorLocation} hideWarnings={noirApp.appState.hideWarnings} askGPT={askGPT} />
            </RenderIf>
          </div>
      </article>
    </section>
  )
}
