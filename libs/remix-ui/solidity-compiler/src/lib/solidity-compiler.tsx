import React, { useContext, useEffect, useState } from 'react' // eslint-disable-line
import { CompileErrors, ContractsFile, SolidityCompilerProps } from './types'
import { CompilerContainer } from './compiler-container' // eslint-disable-line
import { ContractSelection } from './contract-selection' // eslint-disable-line
import { Toaster } from '@remix-ui/toaster' // eslint-disable-line
import { ModalDialog } from '@remix-ui/modal-dialog' // eslint-disable-line
import { baseURLBin, baseURLWasm, pathToURL } from '@remix-project/remix-solidity'
import * as packageJson from '../../../../../package.json'
import './css/style.css'
import { iSolJsonBinData, iSolJsonBinDataBuild } from '@remix-project/remix-lib'
import { appPlatformTypes, platformContext } from '@remix-ui/app'
import { TrackingContext } from '@remix-ide/tracking'
import { CompilerContainerEvent } from '@remix-api'
import { CompileResults } from './components/compile-results'

const oldConfigPath = 'compiler_config.json'
const remixConfigPath = 'remix.config.json'

export const SolidityCompiler = (props: SolidityCompilerProps) => {
  const {
    api,
    api: { currentFile, compileTabLogic, configurationSettings }
  } = props

  const [state, setState] = useState({
    workspaceReloadFlag: 0,
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
  const [badgeStatus, setBadgeStatus] = useState<Record<string, { key: string | number; title?: string; type?: string }>>({})
  const [contractsFile, setContractsFile] = useState<ContractsFile>({})
  const platform = useContext(platformContext)
  const { trackMatomoEvent } = useContext(TrackingContext)
  const [themeQuality, setThemeQuality] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    ;(api as any).call('theme', 'currentTheme').then((theme) => setThemeQuality(theme?.quality === 'light' ? 'light' : 'dark')).catch(() => { /* theme plugin not ready */ })
  }, [])

  api.onThemeChanged = (quality: string) => {
    setThemeQuality(quality === 'light' ? 'light' : 'dark')
  }

  const handleHideWarningsChange = (checked: boolean) => {
    trackMatomoEvent?.<CompilerContainerEvent>({ category: 'compilerContainer', action: 'hideWarnings', name: checked ? 'enabled' : 'disabled', isClick: false })
    api.setAppParameter('hideWarnings', checked)
    setHideWarnings(checked)
  }

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

    // we reset the UI each time we switch workspace
    setTimeout(() => {
      api.setAppParameter('hardhat-compilation', false)
      api.setAppParameter('foundry-compilation', false)
      api.setAppParameter('truffle-compilation', false)
    }, 0)

    setState((prevState) => {
      return {
        ...prevState,
        currentFile,
        isHardhatProject: isHardhat,
        workspaceName: workspaceName,
        workspaceReloadFlag: Date.now(),
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
          file: getFileName(contractMap[key].file),
          path: contractMap[key].file
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

  api.statusChanged = (data: { key: string | number; title?: string; type?: string }) => {
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

    // Runtime configuration for E2E tests (injected via post-build script)
    // Falls back to default URLs for production builds
    const runtimeConfig = typeof window !== 'undefined' ? (window as any)['__REMIX_COMPILER_URLS__'] : undefined

    selectorList.forEach((compiler, index) => {
      const wasmIndex = wasmVersions.findIndex((wasmCompiler) => {
        return wasmCompiler.longVersion === compiler.longVersion
      })
      if (wasmIndex !== -1) {
        const URLWasm: string = runtimeConfig?.wasmURL || wasmVersions[wasmIndex].wasmURL || data.baseURLWasm
        selectorList[index] = wasmVersions[wasmIndex]
        pathToURL[compiler.path] = URLWasm
      } else {
        const URLBin: string = runtimeConfig?.binURL || compiler.binURL || data.baseURLBin
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

  const currentError = compileErrors && compileErrors[currentFile] && compileErrors[currentFile].error
  useEffect(() => {
    if (currentError && currentError.mode === 'panic') modal('Error', panicMessage(currentError.formattedMessage), 'Close', null, false)
  }, [currentError])

  // "soljson-v0.8.30+commit.73712a01.js" -> "0.8.30"; builtin is the bundled default version
  const solcVersion = ((currentVersion === 'builtin' ? state.defaultVersion : currentVersion) || '').replace(/^soljson-v/, '').split('+')[0]

  useEffect(() => {
    if (!state.solJsonBinData && api.solJsonBinData){
      setSolJsonBinData(api.solJsonBinData)
    }
  },[])

  return (
    <>
      <div id="compileTabView" className={`sc sc-${themeQuality}`}>
        <CompilerContainer
          api={api}
          //@ts-ignore
          pluginProps={props}
          isHardhatProject={state.isHardhatProject}
          workspaceName={state.workspaceName}
          workspaceReloadFlag={state.workspaceReloadFlag}
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
          renderResults={({ compiling, via, footer }) => (
            <CompileResults
              api={api}
              result={compileErrors && compileErrors[currentFile]}
              compiling={compiling}
              fileName={getFileName(currentFile || '')}
              version={currentVersion}
              solcVersion={solcVersion}
              via={via}
              hideWarnings={hideWarnings}
              onHideWarningsChange={handleHideWarningsChange}
              footer={footer}
            />
          )}
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
