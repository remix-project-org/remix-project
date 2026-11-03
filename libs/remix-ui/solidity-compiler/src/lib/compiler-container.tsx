import React, {useEffect, useState, useRef, useReducer, useContext} from 'react' // eslint-disable-line
import { FormattedMessage, useIntl } from 'react-intl'
import semver from 'semver'
import { CompilerContainerProps } from './types'
import { ConfigurationSettings } from '@remix-project/remix-lib'
import { checkSpecialChars } from '@remix-ui/helper'
import { canUseWorker, urlFromVersion, pathToURL } from '@remix-project/remix-solidity'
import { compilerReducer, compilerInitialState } from './reducers/compiler'
import { listenToEvents } from './actions/compiler'
import { getValidLanguage } from '@remix-project/remix-solidity'
import { ToggleSwitch } from '@remix-ui/toggle'
import copy from 'copy-to-clipboard'
import { configFileContent } from './compilerConfiguration'
import { appPlatformTypes, platformContext, onLineContext, useAuth } from '@remix-ui/app'
import { TrackingContext } from '@remix-ide/tracking'
import { CompilerEvent, CompilerContainerEvent, Features } from '@remix-api'
import * as packageJson from '../../../../../package.json'

import './css/style.css'

import { CompilerDropdown } from './components/compiler-dropdown'
import { CompilerHeader, CompileWith, CompileButton, CompileWithValue, frameworkNames } from './components/compiler-header'
import { CompilerSettings } from './components/compiler-settings'
import { AiReviewCard, AiReviewRow } from './components/ai-review'
const remixConfigPath = 'remix.config.json'
const aiCardDismissedParam = 'solidity-compiler-ai-card-dismissed'

export const CompilerContainer = (props: CompilerContainerProps) => {
  const online = useContext(onLineContext)
  const platform = useContext(platformContext)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends CompilerEvent | CompilerContainerEvent = CompilerEvent | CompilerContainerEvent>(event: T) => baseTrackEvent?.<T>(event)
  const {
    api,
    compileTabLogic,
    tooltip,
    modal,
    compiledFileName,
    updateCurrentVersion,
    configurationSettings,
    isHardhatProject,
    isTruffleProject,
    isFoundryProject,
    workspaceName,
    solJsonBinData,
    //@ts-ignore
    pluginProps
  } = props // eslint-disable-line

  const [state, setState] = useState({
    autoCompile: false,
    useFileConfiguration: false,
    matomoAutocompileOnce: true,
    optimize: false,
    compileTimeout: null,
    timeout: 300,
    customVersions: [],
    downloaded: [],
    compilerLicense: null,
    selectedVersion: null,
    defaultVersion: packageJson.defaultVersion, // this default version is defined: in makeMockCompiler (for browser test)
    runs: '',
    compiledFileName: '',
    includeNightlies: false,
    language: 'Solidity',
    remappings: [],
    evmVersion: '',
    createFileOnce: true,
    onlyDownloaded: false,
    updatedVersionSelectorFromUrlQuery: false,
  })
  const [toggleExpander, setToggleExpander] = useState<boolean>(false)
  const [compiling, setCompiling] = useState<boolean>(false)
  const [aiCardDismissed, setAiCardDismissed] = useState<boolean>(true)
  const [hardhatConfigFile, setHardhatConfigFile] = useState<string>('hardhat.config.js')
  const [disableCompileButton, setDisableCompileButton] = useState<boolean>(false)
  const compileIcon = useRef(null)
  const promptMessageInput = useRef(null)
  const [foundryCompilation, setFoundryCompilation] = useState(false)
  const [hhCompilation, sethhCompilation] = useState(false)
  const [truffleCompilation, setTruffleCompilation] = useState(false)
  const [compilerContainer, dispatch] = useReducer(compilerReducer, compilerInitialState)
  const { features } = useAuth()
  const hasAuditorPermission = features[Features.AI_AUDITOR]?.is_enabled === true

  useEffect(() => {
    sethhCompilation(false)
    setFoundryCompilation(false)
    setTruffleCompilation(false)
    api.setAppParameter('hardhat-compilation', false)
    api.setAppParameter('foundry-compilation', false)
    api.setAppParameter('truffle-compilation', false)
  }, [])

  useEffect(() => {
    sethhCompilation(false)
    setFoundryCompilation(false)
    setTruffleCompilation(false)
    api.setAppParameter('hardhat-compilation', false)
    api.setAppParameter('foundry-compilation', false)
    api.setAppParameter('truffle-compilation', false)
  }, [props.workspaceReloadFlag])

  const intl = useIntl()

  useEffect(() => {
    ;(async () => {
      const dismissed = ((await api.getAppParameter(aiCardDismissedParam)) as boolean) || false
      setAiCardDismissed(dismissed)
    })()
  }, [])

  useEffect(() => {
    if (!isHardhatProject) return
    api.fileExists('hardhat.config.ts').then((ts) => setHardhatConfigFile(ts ? 'hardhat.config.ts' : 'hardhat.config.js'))
  }, [isHardhatProject, props.workspaceReloadFlag])

  useEffect(() => {
    if (online && state.onlyDownloaded){
      // @ts-ignore
      api.call('compilerloader','getJsonBinData')
    }
    setState((prevState) => {
      return { ...prevState, onlyDownloaded: !online }
    })
  },[online])

  useEffect(() => {
    if (!solJsonBinData) return
    if (!state.updatedVersionSelectorFromUrlQuery && solJsonBinData.binList && solJsonBinData.binList.length) {
      const versionFromQueryParameter = getSelectVersionFromQueryParam()
      if (versionFromQueryParameter.isURL) _updateVersionSelector(state.defaultVersion, versionFromQueryParameter.selectedVersion)
      else {
        setState((prevState) => {
          return { ...prevState, selectedVersion: versionFromQueryParameter.selectedVersion }
        })
        updateCurrentVersion(versionFromQueryParameter.selectedVersion)
        _updateVersionSelector(versionFromQueryParameter.selectedVersion)
      }
      setState((prevState) => {
        return { ...prevState, updatedVersionSelectorFromUrlQuery: true }
      })
    } else if (!solJsonBinData.binList || (solJsonBinData.binList && solJsonBinData.binList.length == 0)){
      const version = 'builtin'
      setState((prevState) => {
        return { ...prevState, selectedVersion: version }
      })
      updateCurrentVersion(version)
      _updateVersionSelector(version, '', false)
    }
  }, [solJsonBinData])

  useEffect(() => {
    const currentFileName = api.currentFile
    currentFile(currentFileName)
    listenToEvents(compileTabLogic, api)(dispatch)
  }, [])

  useEffect(() => {
    ;(async () => {
      if (compileTabLogic && compileTabLogic.compiler) {
        const autocompile = ((await api.getAppParameter('autoCompile')) as boolean) || false
        const includeNightlies = ((await api.getAppParameter('includeNightlies')) as boolean) || false
        const useFileConfiguration = ((await api.getAppParameter('useFileConfiguration')) as boolean) || false

        setState((prevState) => {
          const params = api.getCompilerQueryParameters()
          const optimize = params.optimize
          const runs = params.runs as string
          const evmVersion = compileTabLogic.evmVersions.includes(params.evmVersion) ? params.evmVersion : 'default'
          const language = getValidLanguage(params.language)

          return {
            ...prevState,
            autoCompile: autocompile,
            includeNightlies: includeNightlies,
            useFileConfiguration: useFileConfiguration,
            optimize: optimize,
            runs: runs,
            evmVersion: evmVersion !== null && evmVersion !== 'null' && evmVersion !== undefined && evmVersion !== 'undefined' ? evmVersion : 'default',
            language: language !== null ? language : 'Solidity',
            matomoAutocompileOnce: true
          }
        })
      }
    })()
  }, [compileTabLogic])

  useEffect(() => {
    const isDisabled = !compiledFileName || (compiledFileName && !isSolFileSelected(compiledFileName))

    setDisableCompileButton(isDisabled)
    setState((prevState) => {
      return { ...prevState, matomoAutocompileOnce: true, compiledFileName }
    })
  }, [compiledFileName])

  useEffect(() => {
    if (compilerContainer.compiler.mode) {
      switch (compilerContainer.compiler.mode) {
      case 'startingCompilation':
        startingCompilation()
        break
      case 'compilationDuration':
        compilationDuration(compilerContainer.compiler.args[0])
        break
      case 'loadingCompiler':
        loadingCompiler()
        break
      case 'compilerLoaded':
        compilerLoaded(compilerContainer.compiler.args[1])
        break
      case 'compilationFinished':
        compilationFinished()
        break
      }
    }
  }, [compilerContainer.compiler.mode])

  useEffect(() => {
    if (compilerContainer.editor.mode) {
      if (compilerContainer.editor.mode.startsWith('sessionSwitched')) {
        sessionSwitched()
        return
      } else if (compilerContainer.editor.mode.startsWith('contentChanged')) {
        contentChanged()
        return
      }
    }
  }, [compilerContainer.editor.mode])

  useEffect(() => {
    compileTabLogic.setUseFileConfiguration(state.useFileConfiguration)
  }, [state.useFileConfiguration])

  useEffect(() => {
    if (configurationSettings) {
      setConfiguration(configurationSettings)
    }
  }, [configurationSettings])

  const toggleConfigType = () => {
    setState((prevState) => {
      // Track configuration file toggle
      trackMatomoEvent({ category: 'compilerContainer', action: 'useConfigurationFile', name: !state.useFileConfiguration ? 'enabled' : 'disabled', isClick: false })

      api.setAppParameter('useFileConfiguration', !state.useFileConfiguration)
      return { ...prevState, useFileConfiguration: !state.useFileConfiguration }
    })
  }

  const createNewConfigFile = async () => {
    const exists = await api.fileExists(remixConfigPath)

    if (exists) {
      const remixConfig = await api.readFile(remixConfigPath)
      const remixConfigContent = JSON.parse(remixConfig)

      if (!remixConfigContent['solidity-compiler']) {
        const compilerConfig = JSON.parse(configFileContent)

        if (isFoundryProject && !compilerConfig.settings.remappings) {
          compilerConfig.settings.remappings = ['ds-test/=lib/forge-std/lib/ds-test/src/', 'forge-std/=lib /forge-std/src/']
        }
        await api.writeFile(remixConfigPath, JSON.stringify({ ...remixConfigContent, 'solidity-compiler': compilerConfig }, null, 2))
      }
    } else {
      const config = JSON.parse(configFileContent)

      if (isFoundryProject) {
        config.settings.remappings = ['ds-test/=lib/forge-std/lib/ds-test/src/', 'forge-std/=lib /forge-std/src/']
      }
      await api.writeFile(remixConfigPath, JSON.stringify({ 'solidity-compiler': config }, null, 2))
    }
  }

  const _retrieveVersion = (version?) => {
    if (!version) version = state.selectedVersion
    if (version === 'builtin') version = state.defaultVersion
    return semver.coerce(version) ? semver.coerce(version).version : ''
  }

  const getSelectVersionFromQueryParam = () => {
    let selectedVersion = state.defaultVersion
    let isURL = false
    try {
      const versions = [...solJsonBinData.binList]
      versions.reverse()

      if (api.getCompilerQueryParameters().version) {
        const versionFromURL = api.getCompilerQueryParameters().version
        // Check if version is a URL and corresponding filename starts with 'soljson'
        if (versionFromURL.startsWith('https://')) {
          const urlArr = versionFromURL.split('/')
          if (urlArr[urlArr.length - 1].startsWith('soljson')) {
            isURL = true
            selectedVersion = versionFromURL
          }
        } else {
          // URL version can be like 0.8.7+commit.e28d00a7, 0.8.7 or soljson-v0.8.7+commit.e28d00a7.js
          const selectedVersionArr = versions.filter((obj) => obj.path === versionFromURL || obj.longVersion === versionFromURL || obj.version === versionFromURL)
          // for version like 0.8.15, there will be more than one elements in the array
          // In that case too, index 0 will have non-nightly version object
          if (selectedVersionArr.length) selectedVersion = selectedVersionArr[0].path
        }
      }

    } catch (e) {
      tooltip(intl.formatMessage({ id: 'solidity.tooltipText5' }) + e)
    }

    return { selectedVersion, isURL }
  }

  /**
   * Update the compilation button with the name of the current file
   */
  const currentFile = (name = '') => {
    if (name && name !== '') {
      _setCompilerVersionFromPragma(name)
    }
    const compiledFileName = name.split('/').pop()

    setState((prevState) => {
      return { ...prevState, compiledFileName }
    })
  }

  // Load solc compiler version according to pragma in contract file
  const _setCompilerVersionFromPragma = (filename: string) => {
    if (solJsonBinData && !solJsonBinData.selectorList) return
    api.readFile(filename).then((data) => {
      if (!data) return
      const pragmaArr = data.match(/(pragma solidity (.+?);)/g)
      if (pragmaArr && pragmaArr.length === 1) {
        const pragmaStr = pragmaArr[0].replace('pragma solidity', '').trim()
        const pragma = pragmaStr.substring(0, pragmaStr.length - 1)
        const releasedVersions = solJsonBinData.selectorList.filter((obj) => !obj.prerelease).map((obj) => obj.version)
        const allVersions = solJsonBinData.selectorList.map((obj) => _retrieveVersion(obj.version))
        const currentCompilerName = _retrieveVersion(state.selectedVersion)
        // contains only numbers part, for example '0.4.22'
        const pureVersion = _retrieveVersion()
        // is nightly build newer than the last release
        const isNewestNightly = currentCompilerName.includes('nightly') && semver.gt(pureVersion, releasedVersions[0])
        // checking if the selected version is in the pragma range
        const isInRange = semver.satisfies(pureVersion, pragma)
        // checking if the selected version is from official compilers list(excluding custom versions) and in range or greater
        const isOfficial = allVersions.includes(currentCompilerName)
        if (isOfficial && !isInRange && !isNewestNightly) {
          const compilerToLoad = semver.maxSatisfying(releasedVersions, pragma)
          const compilerPath = solJsonBinData.selectorList.filter((obj) => !obj.prerelease && obj.version === compilerToLoad)[0].path
          if (state.selectedVersion !== compilerPath) {
            // @ts-ignore
            api.call('notification', 'toast', intl.formatMessage({ id: 'solidity.toastMessage' }, { version: _retrieveVersion(compilerPath) }))
            setState((prevState) => {
              return { ...prevState, selectedVersion: compilerPath }
            })
            _updateVersionSelector(compilerPath)
          }
        }
      }
    })
  }

  const isSolFileSelected = (currentFile = '') => {
    if (!currentFile) currentFile = api.currentFile
    if (!currentFile) return false
    const extension = currentFile.substr(currentFile.length - 3, currentFile.length)
    return extension.toLowerCase() === 'sol' || extension.toLowerCase() === 'yul'
  }

  const sessionSwitched = () => {
    if (!compileIcon.current) return
    scheduleCompilation()
  }

  const startingCompilation = () => {
    setCompiling(true)
    if (!compileIcon.current) return
    compileIcon.current.setAttribute('title', intl.formatMessage({ id: 'solidity.compilingTitle' }))
    compileIcon.current.classList.remove('remixui_bouncingIcon')
    compileIcon.current.classList.add('remixui_spinningIcon')
  }

  const compilationDuration = (speed: number) => {
    if (speed > 1000) {
      console.log(`Last compilation took ${speed}ms. We suggest to turn off autocompilation.`)
    }
  }

  const contentChanged = () => {
    if (!compileIcon.current) return
    scheduleCompilation()
    compileIcon.current.classList.add('remixui_bouncingIcon') // @TODO: compileView tab
  }

  const loadingCompiler = () => {
    if (!compileIcon.current) return
    compileIcon.current.setAttribute('title', intl.formatMessage({ id: 'solidity.compileIconAttribute' }))
    compileIcon.current.classList.add('remixui_spinningIcon')
    setState((prevState) => {
      return {
        ...prevState,
        compilerLicense: intl.formatMessage({ id: 'solidity.compilerLicenseMsg1' })
      }
    })
    _updateLanguageSelector()
    setDisableCompileButton(true)
  }

  const compilerLoaded = (license) => {
    if (!compileIcon.current) return
    compileIcon.current.setAttribute('title', '')
    compileIcon.current.classList.remove('remixui_spinningIcon')
    setState((prevState) => {
      return {
        ...prevState,
        compilerLicense: license ? license : intl.formatMessage({ id: 'solidity.compilerLicenseMsg2' })
      }
    })
    if (state.autoCompile) compile()
    const isDisabled = !compiledFileName || (compiledFileName && !isSolFileSelected(compiledFileName))

    setDisableCompileButton(isDisabled)

    // just for e2e
    // eslint-disable-next-line no-case-declarations
    const elements = document.querySelectorAll('[data-id="compilerloaded"]')
    // remove elements
    for (let i = 0; i < elements.length; i++) {
      elements[i].remove()
    }
    const loadedElement = document.createElement('span')
    loadedElement.setAttribute('data-id', 'compilerloaded')
    loadedElement.setAttribute('data-version', state.selectedVersion)
    document.body.appendChild(loadedElement)
  }

  const compilationFinished = () => {
    setCompiling(false)
    if (!compileIcon.current) return
    compileIcon.current.setAttribute('title', intl.formatMessage({ id: 'solidity.idleTitle' }))
    compileIcon.current.classList.remove('remixui_spinningIcon')
    compileIcon.current.classList.remove('remixui_bouncingIcon')
    if (!state.autoCompile || (state.autoCompile && state.matomoAutocompileOnce)) {
      // trackMatomoEvent?.('compiler', 'compiled', 'solCompilationFinishedTriggeredByUser')
      trackMatomoEvent({ category: 'compiler', action: 'compiled', name: 'with_config_file_' + state.useFileConfiguration, isClick: false })
      trackMatomoEvent({ category: 'compiler', action: 'compiled', name: 'with_version_' + _retrieveVersion(), isClick: false })
      if (state.autoCompile && state.matomoAutocompileOnce) {
        setState((prevState) => {
          return { ...prevState, matomoAutocompileOnce: false }
        })
      }
    }
  }

  const scheduleCompilation = () => {
    if (!state.autoCompile) return
    if (state.compileTimeout) window.clearTimeout(state.compileTimeout)
    const compileTimeout = window.setTimeout(() => {
      state.autoCompile && compile()
    }, state.timeout)

    setState((prevState) => {
      return { ...prevState, compileTimeout }
    })
  }

  const compile = async () => {
    const currentFile = api.currentFile

    if (!isSolFileSelected()) return

    // Track compile button click
    trackMatomoEvent({ category: 'compilerContainer', action: 'compile', name: currentFile, isClick: true })

    if (state.useFileConfiguration) await createNewConfigFile()
    _setCompilerVersionFromPragma(currentFile)
    let externalCompType = 'remix'
    if (hhCompilation) externalCompType = 'hardhat'
    else if (truffleCompilation) externalCompType = 'truffle'
    else if (foundryCompilation) externalCompType = 'foundry'
    compileTabLogic.runCompiler(externalCompType).catch((error) => {
      setCompiling(false)
      tooltip(error.message)
      compileIcon.current.classList.remove('remixui_bouncingIcon')
      compileIcon.current.classList.remove('remixui_spinningIcon')
      // @ts-ignore
      props.setCompileErrors({ [currentFile]: { error: error.message } })
      // @ts-ignore
      props.setBadgeStatus({ [currentFile]: { key: 1, title: error.message, type: 'error' } })
    }).then(() => {
      compileIcon.current.classList.remove('remixui_bouncingIcon')
    })
  }

  const startAudit = async (auditType: 'security' | 'gas') => {
    if (auditType === 'gas') {
      try {
        await (api as any).call('skillsexplorermodal', 'loadSkill', 'coding-solidity-gas-optimization')
      } catch {
        // skill endpoint unavailable — proceed without it
      }
    }
    const fileName = state.compiledFileName
    const fileRef = fileName ? ` File to analyze: ${fileName}.` : ''
    const securityUpsell = hasAuditorPermission ? '' : ' At the end, mention that a more thorough and complete security audit with deeper analysis and detailed reporting is available in the Remix Pro plan.'
    const gasUpsell = hasAuditorPermission ? '' : ' At the end, mention that a more thorough and complete gas audit with deeper analysis and detailed recommendations is available in the Remix Pro plan.'
    const prompt = auditType === 'security'
      ? `Perform a security audit of the following smart contract.${fileRef} Identify vulnerabilities, potential attack vectors, reentrancy issues, access control problems, and any other security risks.${securityUpsell}`
      : `Perform a gas optimization audit of the following smart contract.${fileRef} Identify inefficient patterns, unnecessary storage operations, and suggest concrete optimizations to reduce transaction costs.${gasUpsell}`
    trackMatomoEvent({ category: 'compilerContainer', action: auditType === 'security' ? 'startAIAudit' : 'startGasAudit', name: '', isClick: true })
    await (api as any).call('manager', 'activatePlugin', 'remixaiassistant')
    await (api as any).call('menuicons', 'select', 'remixaiassistant')
    await (api as any).call('remixaiassistant', 'newConversation')
    setTimeout(async () => {
      await (api as any).call('remixaiassistant', 'chatPipe', prompt, false, { displayText: 'audit ' + auditType + ' ' + fileRef, source: 'compiler', presetId: auditType === 'security' ? 'security-audit' : 'gas-audit' })
    }, 500)
  }

  const compileAndRun = () => {
    const currentFile = api.currentFile

    if (!isSolFileSelected()) return

    // Track compile and run button click
    trackMatomoEvent({ category: 'compilerContainer', action: 'compileAndRun', name: currentFile, isClick: true })

    _setCompilerVersionFromPragma(currentFile)
    let externalCompType
    if (hhCompilation) externalCompType = 'hardhat'
    else if (truffleCompilation) externalCompType = 'truffle'
    api.runScriptAfterCompilation(currentFile)
    compileTabLogic.runCompiler(externalCompType).catch((error) => {
      setCompiling(false)
      tooltip(error.message)
      compileIcon.current.classList.remove('remixui_bouncingIcon')
      compileIcon.current.classList.remove('remixui_spinningIcon')
      // @ts-ignore
      props.setCompileErrors({ [currentFile]: { error: error.message } })
      // @ts-ignore
      props.setBadgeStatus({ [currentFile]: { key: 1, title: error.message, type: 'error' } })
    }).then(() => {
      compileIcon.current.classList.remove('remixui_bouncingIcon')
    })
  }

  const _updateVersionSelector = (version, customUrl = '', setQueryParameter = true) => {
    // update selectedversion of previous one got filtered out
    let selectedVersion = version
    if (!selectedVersion || !_shouldBeAdded(selectedVersion)) {
      selectedVersion = state.defaultVersion
      setState((prevState) => {
        return { ...prevState, selectedVersion }
      })
    }
    updateCurrentVersion(selectedVersion)
    if (setQueryParameter)
      api.setCompilerQueryParameters({ version: selectedVersion })
    let url

    if (customUrl !== '') {
      selectedVersion = customUrl
      setState((prevState) => {
        return {
          ...prevState,
          selectedVersion,
          customVersions: [...state.customVersions, selectedVersion]
        }
      })
      updateCurrentVersion(selectedVersion)
      url = customUrl
      if (setQueryParameter)
        api.setCompilerQueryParameters({ version: selectedVersion })
    } else {
      if (checkSpecialChars(selectedVersion)) {
        return console.log('loading ' + selectedVersion + ' not allowed, special chars not allowed.')
      }
      if (selectedVersion === 'builtin' || selectedVersion.indexOf('soljson') === 0) {
        url = urlFromVersion(selectedVersion)
      } else {
        return console.log('loading ' + selectedVersion + ' not allowed, version should start with "soljson"')
      }
    }

    // Workers cannot load js on "file:"-URLs and we get a
    // "Uncaught RangeError: Maximum call stack size exceeded" error on Chromium,
    // resort to non-worker version in that case.
    if (selectedVersion === 'builtin') selectedVersion = state.defaultVersion
    const useWorker = selectedVersion !== 'builtin' && (canUseWorker(selectedVersion) || platform === appPlatformTypes.desktop)
    if (useWorker) {
      compileTabLogic.compiler.loadVersion(true, url)
    } else {
      compileTabLogic.compiler.loadVersion(false, url)
    }
  }

  const _shouldBeAdded = (version) => {
    return !version.includes('nightly') || (version.includes('nightly') && state.includeNightlies)
  }

  const promptCompiler = () => {
    // Track custom compiler addition prompt
    trackMatomoEvent({ category: 'compilerContainer', action: 'addCustomCompiler', name: '', isClick: true })

    // custom url https://solidity-blog.s3.eu-central-1.amazonaws.com/data/08preview/soljson.js
    modal(
      intl.formatMessage({
        id: 'solidity.addACustomCompiler'
      }),
      promptMessage('URL'),
      intl.formatMessage({ id: 'solidity.ok' }),
      addCustomCompiler,
      false,
      intl.formatMessage({ id: 'solidity.cancel' }),
      () => {}
    )
  }

  const showCompilerLicense = () => {
    // Track compiler license view
    trackMatomoEvent({ category: 'compilerContainer', action: 'viewLicense', name: '', isClick: true })

    modal(
      intl.formatMessage({ id: 'solidity.compilerLicense' }),
      state.compilerLicense ? state.compilerLicense : intl.formatMessage({ id: 'solidity.compilerLicenseMsg3' }),
      intl.formatMessage({ id: 'solidity.ok' }),
      () => {}
    )
  }

  const promptMessage = (message) => {
    return (
      <>
        <span>{message}</span>
        <input type="text" data-id="modalDialogCustomPromptCompiler" className="form-control" ref={promptMessageInput} />
      </>
    )
  }

  const addCustomCompiler = () => {
    const url = promptMessageInput.current.value

    setState((prevState) => {
      return { ...prevState, selectedVersion: url }
    })
    _updateVersionSelector(state.defaultVersion, url)
  }

  const handleLoadVersion = (value) => {
    if (value !== 'builtin' && !pathToURL[value]) return

    // Track compiler selection
    trackMatomoEvent({ category: 'compilerContainer', action: 'compilerSelection', name: value, isClick: false })

    setState((prevState) => {
      return { ...prevState, selectedVersion: value, matomoAutocompileOnce: true }
    })
    updateCurrentVersion(value)
    _updateVersionSelector(value)
    _updateLanguageSelector()
  }

  const _updateLanguageSelector = () => {
    // This is the first version when Yul is available
    if (!semver.valid(_retrieveVersion()) || semver.lt(_retrieveVersion(), 'v0.5.7+commit.6da8b019.js')) {
      handleLanguageChange('Solidity')
      compileTabLogic.setLanguage('Solidity')
    }
  }

  const handleAutoCompile = (checked: boolean) => {
    // Track auto-compile toggle
    trackMatomoEvent({ category: 'compilerContainer', action: 'autoCompile', name: checked ? 'enabled' : 'disabled', isClick: false })

    api.setAppParameter('autoCompile', checked)
    checked && compile()
    setState((prevState) => {
      return {
        ...prevState,
        autoCompile: checked,
        matomoAutocompileOnce: state.matomoAutocompileOnce || checked
      }
    })
  }

  const handleOptimizeChange = (value) => {
    const checked = !!value

    // Track optimization toggle
    trackMatomoEvent({ category: 'compilerContainer', action: 'optimization', name: checked ? 'enabled' : 'disabled', isClick: false })

    api.setAppParameter('optimize', checked)
    compileTabLogic.setOptimize(checked)
    if (compileTabLogic.optimize) {
      compileTabLogic.setRuns(parseInt(state.runs))
    } else {
      compileTabLogic.setRuns(200)
    }
    state.autoCompile && compile()
    setState((prevState) => {
      return { ...prevState, optimize: checked }
    })
  }

  const onChangeRuns = (value) => {
    const runs = value

    compileTabLogic.setRuns(parseInt(runs))
    state.autoCompile && compile()
    setState((prevState) => {
      return { ...prevState, runs }
    })
  }

  const handleNightliesChange = (checked: boolean) => {
    // Track include nightlies toggle
    trackMatomoEvent({ category: 'compilerContainer', action: 'includeNightlies', name: checked ? 'enabled' : 'disabled', isClick: false })

    if (!checked) handleLoadVersion(state.defaultVersion)
    api.setAppParameter('includeNightlies', checked)
    setState((prevState) => {
      return { ...prevState, includeNightlies: checked }
    })
  }

  const handleOnlyDownloadedChange = (checked: boolean) => {
    // Track downloaded compilers only toggle - we can use compilerSelection for this
    trackMatomoEvent({ category: 'compilerContainer', action: 'compilerSelection', name: checked ? 'downloadedOnly' : 'allVersions', isClick: false })

    if (!checked) handleLoadVersion(state.defaultVersion)
    setState((prevState) => {
      return { ...prevState, onlyDownloaded: checked }
    })
  }

  const handleLanguageChange = (value) => {
    // Track language selection
    trackMatomoEvent({ category: 'compilerContainer', action: 'languageSelection', name: value, isClick: false })

    compileTabLogic.setLanguage(value)
    state.autoCompile && compile()
    setState((prevState) => {
      return { ...prevState, language: value }
    })
  }

  const handleEvmVersionChange = (value) => {
    if (!value) return

    // Track EVM version selection
    trackMatomoEvent({ category: 'compilerContainer', action: 'evmVersionSelection', name: value, isClick: false })

    let v = value
    if (v === 'default') {
      v = null
    }
    compileTabLogic.setEvmVersion(v)
    state.autoCompile && compile()
    setState((prevState) => {
      return { ...prevState, evmVersion: value }
    })
  }

  const handleCompileWith = (value: CompileWithValue) => {
    trackMatomoEvent({ category: 'compilerContainer', action: 'compileWith', name: value, isClick: false })
    sethhCompilation(value === 'hardhat')
    setFoundryCompilation(value === 'foundry')
    setTruffleCompilation(value === 'truffle')
    api.setAppParameter('hardhat-compilation', value === 'hardhat')
    api.setAppParameter('foundry-compilation', value === 'foundry')
    api.setAppParameter('truffle-compilation', value === 'truffle')
  }

  /*
    The following functions map with the above event handlers.
    They are an external API for modifying the compiler configuration.
  */
  const setConfiguration = (settings: ConfigurationSettings) => {
    handleLoadVersion(`soljson-v${settings.version}.js`)
    handleEvmVersionChange(settings.evmVersion)
    handleLanguageChange(settings.language)
    handleOptimizeChange(settings.optimize)
    onChangeRuns(settings.runs)
  }

  const dismissAiCard = () => {
    trackMatomoEvent({ category: 'compilerContainer', action: 'dismissAIReviewCard', name: '', isClick: true })
    api.setAppParameter(aiCardDismissedParam, true)
    setAiCardDismissed(true)
  }

  const copyDevRunScriptTag = () => {
    trackMatomoEvent({ category: 'compilerContainer', action: 'copyDevRunScriptTag', name: '', isClick: true })
    copy('@custom:dev-run-script file_path')
    tooltip(intl.formatMessage({ id: 'solidity.devRunScriptTagCopied' }))
  }

  const toggleConfigurations = () => {
    // Track advanced configuration toggle
    trackMatomoEvent({ category: 'compilerContainer', action: 'advancedConfigToggle', name: !toggleExpander ? 'expanded' : 'collapsed', isClick: true })
    setToggleExpander(!toggleExpander)
  }

  const handleConfigFileClick = async () => {
    await createNewConfigFile()
    await api.open(remixConfigPath)
  }

  const compileWith: CompileWithValue = hhCompilation ? 'hardhat' : foundryCompilation ? 'foundry' : truffleCompilation ? 'truffle' : 'remix'
  const viaFramework = compileWith !== 'remix'
  const frameworks = [
    isHardhatProject && { value: 'hardhat' as const, configFile: hardhatConfigFile },
    isFoundryProject && { value: 'foundry' as const, configFile: 'foundry.toml' },
    isTruffleProject && { value: 'truffle' as const, configFile: 'truffle-config.js' }
  ].filter(Boolean)
  const showAiCard = !aiCardDismissed && isSolFileSelected(compiledFileName)

  return (
    <section className="sc-section" data-id="compilerSection">
      <CompilerHeader
        showMenu={!viaFramework}
        onAddCustomCompiler={promptCompiler}
        onCompileAndRun={compileAndRun}
        compileAndRunDisabled={disableCompileButton}
        onCopyDevRunScriptTag={copyDevRunScriptTag}
        onShowLicense={showCompilerLicense}
      />

      {frameworks.length > 0 && (
        <CompileWith value={compileWith} frameworks={frameworks} onChange={handleCompileWith} onOpenConfigFile={(file) => api.open(file)} />
      )}

      {!viaFramework && (
        <>
          {solJsonBinData && solJsonBinData.selectorList && solJsonBinData.selectorList.length > 0 && (
            <CompilerDropdown
              allversions={solJsonBinData.selectorList}
              customVersions={state.customVersions}
              selectedVersion={state.selectedVersion}
              defaultVersion={state.defaultVersion}
              handleLoadVersion={handleLoadVersion}
              _shouldBeAdded={_shouldBeAdded}
              onlyDownloaded={state.onlyDownloaded}
              disabled={false}
            />
          )}
          <CompilerSettings
            open={toggleExpander}
            onToggle={toggleConfigurations}
            configFileName={remixConfigPath}
            useFileConfiguration={state.useFileConfiguration}
            onUseFileConfigurationChange={toggleConfigType}
            onOpenConfigFile={handleConfigFileClick}
            language={state.language}
            onLanguageChange={handleLanguageChange}
            evmVersion={state.evmVersion}
            evmVersions={compileTabLogic.evmVersions}
            onEvmVersionChange={handleEvmVersionChange}
            optimize={state.optimize}
            onOptimizeChange={handleOptimizeChange}
            runs={state.runs}
            onRunsChange={onChangeRuns}
            includeNightlies={state.includeNightlies}
            onNightliesChange={handleNightliesChange}
            showOnlyDownloaded={platform === appPlatformTypes.desktop}
            onlyDownloaded={state.onlyDownloaded}
            onOnlyDownloadedChange={handleOnlyDownloadedChange}
          />
        </>
      )}

      <div className="sc-set-row sc-auto">
        <label className="n" htmlFor="autoCompile"><FormattedMessage id="solidity.autoCompile" /></label>
        <span data-id="compilerContainerAutoCompile">
          <ToggleSwitch id="autoCompile" isOn={state.autoCompile} onClick={() => handleAutoCompile(!state.autoCompile)} />
        </span>
      </div>

      <CompileButton fileName={state.compiledFileName} disabled={disableCompileButton} iconRef={compileIcon} onCompile={compile} />

      {props.renderResults && props.renderResults({
        compiling,
        via: viaFramework ? frameworkNames[compileWith] : undefined,
        footer: aiCardDismissed ? <AiReviewRow onAudit={startAudit} /> : null
      })}

      {showAiCard && <AiReviewCard fileName={state.compiledFileName} onAudit={startAudit} onDismiss={dismissAiCard} />}
    </section>
  )
}

export default CompilerContainer
