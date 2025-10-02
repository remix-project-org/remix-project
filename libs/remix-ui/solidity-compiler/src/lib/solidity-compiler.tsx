import React, { useContext, useEffect, useState } from 'react' // eslint-disable-line
import { CompileErrors, ContractsFile, SolidityCompilerProps } from './types'
import { CompilerContainer } from './compiler-container' // eslint-disable-line
import { ContractSelection } from './contract-selection' // eslint-disable-line
import { Toaster } from '@remix-ui/toaster' // eslint-disable-line
import { ModalDialog } from '@remix-ui/modal-dialog' // eslint-disable-line
import { Renderer } from '@remix-ui/renderer' // eslint-disable-line
import { baseURLBin, baseURLWasm, pathToURL } from '@remix-project/remix-solidity'
import * as packageJson from '../../../../../package.json'
import './css/style.css'
import { iSolJsonBinData, iSolJsonBinDataBuild } from '@remix-project/remix-lib'
import { appPlatformTypes, platformContext } from '@remix-ui/app'

const oldConfigPath = 'compiler_config.json'
const remixConfigPath = 'remix.config.json'

export const SolidityCompiler = (props: SolidityCompilerProps) => {
  const {
    api,
    api: { currentFile, compileTabLogic, configurationSettings }
  } = props

  const [state, setState] = useState({
    isHardhatProject: false,
    isTruffleProject: false,
    isFoundryProject: false,
    workspaceName: '',
    currentFile,
    loading: false,
    compileTabLogic: null,
    compiler: null,
    toasterMsg: '',
    modal: {
      hide: true,
      title: '',
      message: null,
      okLabel: '',
      okFn: () => { },
      donotHideOnOkClick: false,
      cancelLabel: '',
      cancelFn: () => { },
      handleHide: null
    },
    solJsonBinData: null,
    defaultVersion: packageJson.defaultVersion, // this default version is defined: in makeMockCompiler (for browser test)
  })

  const [currentVersion, setCurrentVersion] = useState('')
  const [hideWarnings, setHideWarnings] = useState<boolean>(false)
  const [compileErrors, setCompileErrors] = useState<Record<string, CompileErrors>>({ [currentFile]: api.compileErrors })
  const [badgeStatus, setBadgeStatus] = useState<Record<string, { key: string; title?: string; type?: string }>>({})
  const [contractsFile, setContractsFile] = useState<ContractsFile>({})
  const platform = useContext(platformContext)

  useEffect(() => {
    ; (async () => {
      const hide = ((await api.getAppParameter('hideWarnings')) as boolean) || false
      setHideWarnings(hide)
    })()
  }, [compileErrors])

  useEffect(() => {
    if (badgeStatus[currentFile]) {
      api.emit('statusChanged', badgeStatus[currentFile])
    } else {
      api.emit('statusChanged', { key: 'none' })
    }
  }, [badgeStatus[currentFile], currentFile])

  // Return the file name of a path: ex "browser/ballot.sol" -> "ballot.sol"
  const getFileName = (path) => {
    const part = path.split('/')

    return part[part.length - 1]
  }

  api.onCurrentFileChanged = (currentFile: string) => {
    setState((prevState) => {
      return { ...prevState, currentFile }
    })
  }

  api.onSetWorkspace = async (isLocalhost: boolean, workspaceName: string) => {
    const isDesktop = platform === appPlatformTypes.desktop

    const isHardhat = (isLocalhost || isDesktop) && (await compileTabLogic.isHardhatProject())
    const isTruffle = (isLocalhost || isDesktop) && (await compileTabLogic.isTruffleProject())
    const isFoundry = (isLocalhost || isDesktop) && (await compileTabLogic.isFoundryProject())

    setState((prevState) => {
      return {
        ...prevState,
        currentFile,
        isHardhatProject: isHardhat,
        workspaceName: workspaceName,
        isTruffleProject: isTruffle,
        isFoundryProject: isFoundry
      }
    })
    const oldConfigExists = await api.fileExists(oldConfigPath)
    const configExists = await api.fileExists(remixConfigPath)

    if (oldConfigExists) {
      const oldConfigContent = await api.readFile(oldConfigPath)
      const oldConfig = JSON.parse(oldConfigContent)

      if (configExists) {
        const configContent = await api.readFile(remixConfigPath)
        const config = JSON.parse(configContent)

        config['solidity-compiler'] = oldConfig
        await api.writeFile(remixConfigPath, JSON.stringify(config, null, 2))
      } else {
        await api.writeFile(remixConfigPath, JSON.stringify({ 'solidity-compiler': oldConfig }, null, 2))
      }
      // @ts-ignore
      await api.call('fileManager', 'remove', oldConfigPath)
    }
  }

  api.onNoFileSelected = () => {
    setState((prevState) => {
      return { ...prevState, currentFile: '' }
    })
    setCompileErrors({} as Record<string, CompileErrors>)
  }

  api.onCompilationFinished = (compilationDetails: {
    contractMap: { file: string } | Record<string, any>
    contractsDetails: Record<string, any>
    target?: string
    input?: Record<string, any>
  }) => {
    const { contractMap, contractsDetails, target, input } = compilationDetails
    const contractList = contractMap
      ? Object.keys(contractMap).map((key) => {
        return {
          name: key,
          file: getFileName(contractMap[key].file)
        }
      })
      : []

    setContractsFile({
      ...contractsFile,
      [target]: { contractList, contractsDetails, input }
    })
    setCompileErrors({ ...compileErrors, [currentFile]: api.compileErrors })
  }

  api.onFileClosed = (name) => {
    if (name === currentFile) {
      setCompileErrors({ ...compileErrors, [currentFile]: {} as CompileErrors })
      setBadgeStatus({ ...badgeStatus, [currentFile]: { key: 'none' } })
    }
  }

  api.statusChanged = (data: { key: string; title?: string; type?: string }) => {
    setBadgeStatus({ ...badgeStatus, [currentFile]: data })
  }

  api.setSolJsonBinData = (data: iSolJsonBinData) => {
    setSolJsonBinData(data)
  }

  const setSolJsonBinData = (data: iSolJsonBinData) => {
    const builtin: iSolJsonBinDataBuild =
    {
      path: 'builtin',
      longVersion: 'latest local version - ' + state.defaultVersion,
      binURL: '',
      wasmURL: '',
      isDownloaded: true,
      version: 'builtin',
      build: '',
      prerelease: ''
    }
    const binVersions = [...data.binList]
    const selectorList = binVersions

    const wasmVersions = data.wasmList
    selectorList.forEach((compiler, index) => {
      const wasmIndex = wasmVersions.findIndex((wasmCompiler) => {
        return wasmCompiler.longVersion === compiler.longVersion
      })
      if (wasmIndex !== -1) {
        const URLWasm: string = process && process.env && process.env['NX_WASM_URL'] ? process.env['NX_WASM_URL'] : wasmVersions[wasmIndex].wasmURL || data.baseURLWasm
        selectorList[index] = wasmVersions[wasmIndex]
        pathToURL[compiler.path] = URLWasm
      } else {
        const URLBin: string = process && process.env && process.env['NX_BIN_URL'] ? process.env['NX_BIN_URL'] : compiler.binURL || data.baseURLBin
        pathToURL[compiler.path] = URLBin
      }
    })
    data.selectorList = selectorList
    data.selectorList.reverse()
    data.selectorList.unshift(builtin)
    setState((prevState) => {
      return { ...prevState, solJsonBinData: data }
    })
  }

  const toast = (message: string) => {
    setState((prevState) => {
      return { ...prevState, toasterMsg: message }
    })
  }

  const updateCurrentVersion = (value) => {
    setCurrentVersion(value)
  }

  const modal = async (
    title: string,
    message: string | JSX.Element,
    okLabel: string,
    okFn: () => void,
    donotHideOnOkClick: boolean,
    cancelLabel?: string,
    cancelFn?: () => void
  ) => {
    await setState((prevState) => {
      return {
        ...prevState,
        modal: {
          ...prevState.modal,
          hide: false,
          message,
          title,
          okLabel,
          okFn,
          donotHideOnOkClick,
          cancelLabel,
          cancelFn
        }
      }
    })
  }

  const handleHideModal = () => {
    setState((prevState) => {
      return { ...prevState, modal: { ...state.modal, hide: true, message: null } }
    })
  }

  const panicMessage = (message: string) => (
    <div>
      <i className="fas fa-exclamation-circle remixui_panicError" aria-hidden="true"></i>
      The compiler returned with the following internal error: <br />{' '}
      <b>
        {message}.<br />
        The compiler might be in a non-sane state, please be careful and do not use further compilation data to deploy to mainnet. It is heavily recommended to use another browser
        not affected by this issue (Firefox is known to not be affected).
      </b>
      <br />
      Please join{' '}
      <a href="https://gitter.im/ethereum/remix" target="blank">
        remix gitter channel
      </a>{' '}
      for more information.
    </div>
  )

  useEffect(() => {
    if (!state.solJsonBinData && api.solJsonBinData){
      setSolJsonBinData(api.solJsonBinData)
    }
  },[])

  return (
    <>
      <div id="compileTabView">
        <CompilerContainer
          api={api}
          //@ts-ignore
          pluginProps={props}
          isHardhatProject={state.isHardhatProject}
          workspaceName={state.workspaceName}
          isTruffleProject={state.isTruffleProject}
          isFoundryProject={state.isFoundryProject}
          compileTabLogic={compileTabLogic}
          tooltip={toast}
          modal={modal}
          compiledFileName={currentFile}
          updateCurrentVersion={updateCurrentVersion}
          configurationSettings={configurationSettings}
          solJsonBinData={state.solJsonBinData}
          setCompileErrors={setCompileErrors}
          setBadgeStatus={setBadgeStatus}
        />
        {/* "compileErrors[currentFile]['contracts']" field will not be there in case of compilation errors */}
        {contractsFile && contractsFile[currentFile] && contractsFile[currentFile].contractsDetails
          && compileErrors
          && compileErrors[currentFile]
          && compileErrors[currentFile]['contracts'] && (
          <ContractSelection
            api={api}
            compiledFileName={currentFile}
            contractsDetails={contractsFile[currentFile].contractsDetails}
            contractList={contractsFile[currentFile].contractList}
            compilerInput={contractsFile[currentFile].input}
            modal={modal}
          />
        )}
        {compileErrors && compileErrors[currentFile] && (
          <div className="remixui_errorBlobs p-4" data-id="compiledErrors">
            <>
              <span data-id={`compilationFinishedWith_${currentVersion}`}></span>
              {compileErrors[currentFile].error && (
                <Renderer
                  message={compileErrors[currentFile].error.formattedMessage || compileErrors[currentFile].error}
                  plugin={api}
                  context='solidity'
                  opt={{
                    type: compileErrors[currentFile].error.severity || 'error',
                    errorType: compileErrors[currentFile].error.type
                  }}
                />
              )}
              {compileErrors[currentFile].error &&
                compileErrors[currentFile].error.mode === 'panic' &&
                modal('Error', panicMessage(compileErrors[currentFile].error.formattedMessage), 'Close', null, false)}
              {compileErrors[currentFile].errors &&
                compileErrors[currentFile].errors.length > 0 &&
                compileErrors[currentFile].errors.map((err, index) => {
                  if (hideWarnings) {
                    if (err.severity !== 'warning') {
                      return <Renderer context='solidity' key={index} message={err.formattedMessage} plugin={api} opt={{ type: err.severity, errorType: err.type }} />
                    }
                  } else {
                    return <Renderer context='solidity' key={index} message={err.formattedMessage} plugin={api} opt={{ type: err.severity, errorType: err.type }} />
                  }
                })}
            </>
          </div>
        )}
      </div>
      <Toaster message={state.toasterMsg} />
      <ModalDialog
        id="workspacesModalDialog"
        title={state.modal.title}
        message={state.modal.message}
        hide={state.modal.hide}
        okLabel={state.modal.okLabel}
        okFn={state.modal.okFn}
        donotHideOnOkClick={state.modal.donotHideOnOkClick}
        cancelLabel={state.modal.cancelLabel}
        cancelFn={state.modal.cancelFn}
        handleHide={handleHideModal}
      >
        {typeof state.modal.message !== 'string' && state.modal.message}
      </ModalDialog>
    </>
  )
}

export default SolidityCompiler
