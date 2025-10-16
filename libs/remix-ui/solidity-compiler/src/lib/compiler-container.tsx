import React, {useEffect, useState, useRef, useReducer, useContext} from 'react' // eslint-disable-line
import { FormattedMessage, useIntl } from 'react-intl'
import semver from 'semver'
import { CompilerContainerProps } from './types'
import { ConfigurationSettings } from '@remix-project/remix-lib'
import { checkSpecialChars, CustomTooltip, extractNameFromKey, RenderIf } from '@remix-ui/helper'
import { canUseWorker, urlFromVersion, pathToURL } from '@remix-project/remix-solidity'
import { compilerReducer, compilerInitialState } from './reducers/compiler'
import { listenToEvents } from './actions/compiler'
import { getValidLanguage } from '@remix-project/remix-solidity'
import { CopyToClipboard } from '@remix-ui/clipboard'
import { configFileContent } from './compilerConfiguration'
import { appPlatformTypes, platformContext, onLineContext } from '@remix-ui/app'
import { TrackingContext } from '@remix-ide/tracking'
import { CompilerEvent, CompilerContainerEvent } from '@remix-api'
import * as packageJson from '../../../../../package.json'

import './css/style.css'

import { CompilerDropdown } from './components/compiler-dropdown'
const remixConfigPath = 'remix.config.json'

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
    hideWarnings: false,
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
  const [disableCompileButton, setDisableCompileButton] = useState<boolean>(false)
  const compileIcon = useRef(null)
  const promptMessageInput = useRef(null)
  const [hhCompilation, sethhCompilation] = useState(false)
  const [truffleCompilation, setTruffleCompilation] = useState(false)
  const [compilerContainer, dispatch] = useReducer(compilerReducer, compilerInitialState)

  const intl = useIntl()

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
        const hideWarnings = ((await api.getAppParameter('hideWarnings')) as boolean) || false
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
            hideWarnings: hideWarnings,
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
    if (!compileIcon.current) return
    compileIcon.current.setAttribute('title', 'compiling...')
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
    if (!compileIcon.current) return
    compileIcon.current.setAttribute('title', 'idle')
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
    let externalCompType
    if (hhCompilation) externalCompType = 'hardhat'
    else if (truffleCompilation) externalCompType = 'truffle'
    compileTabLogic.runCompiler(externalCompType).catch((error) => {
      tooltip(error.message)
      compileIcon.current.classList.remove('remixui_bouncingIcon')
      compileIcon.current.classList.remove('remixui_spinningIcon')
      // @ts-ignore
      props.setCompileErrors({ [currentFile]: { error: error.message } })
      // @ts-ignore
      props.setBadgeStatus({ [currentFile]: { key: 1, title: error.message, type: 'error' } })
    })
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
      tooltip(error.message)
      compileIcon.current.classList.remove('remixui_bouncingIcon')
      compileIcon.current.classList.remove('remixui_spinningIcon')
      // @ts-ignore
      props.setCompileErrors({ [currentFile]: { error: error.message } })
      // @ts-ignore
      props.setBadgeStatus({ [currentFile]: { key: 1, title: error.message, type: 'error' } })
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
    if (selectedVersion !== 'builtin' && (canUseWorker(selectedVersion) || platform === appPlatformTypes.desktop)) {
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

  const handleAutoCompile = (e) => {
    const checked = e.target.checked

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

  const handleHideWarningsChange = (e) => {
    const checked = e.target.checked

    // Track hide warnings toggle
    trackMatomoEvent({ category: 'compilerContainer', action: 'hideWarnings', name: checked ? 'enabled' : 'disabled', isClick: false })

    api.setAppParameter('hideWarnings', checked)
    state.autoCompile && compile()
    setState((prevState) => {
      return { ...prevState, hideWarnings: checked }
    })
  }

  const handleNightliesChange = (e) => {
    const checked = e.target.checked

    // Track include nightlies toggle
    trackMatomoEvent({ category: 'compilerContainer', action: 'includeNightlies', name: checked ? 'enabled' : 'disabled', isClick: false })

    if (!checked) handleLoadVersion(state.defaultVersion)
    api.setAppParameter('includeNightlies', checked)
    setState((prevState) => {
      return { ...prevState, includeNightlies: checked }
    })
  }

  const handleOnlyDownloadedChange = (e) => {
    const checked = e.target.checked

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

  const updatehhCompilation = (event) => {
    const checked = event.target.checked
    if (checked) setTruffleCompilation(false) // wayaround to reset the variable
    sethhCompilation(checked)
    api.setAppParameter('hardhat-compilation', checked)
  }

  const updateTruffleCompilation = (event) => {
    const checked = event.target.checked
    if (checked) sethhCompilation(false) // wayaround to reset the variable
    setTruffleCompilation(checked)
    api.setAppParameter('truffle-compilation', checked)
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

  const toggleConfigurations = () => {
    setToggleExpander(!toggleExpander)
  }

  const handleConfigFileClick = async () => {
    await createNewConfigFile()
    await api.open(remixConfigPath)
  }

  return (
    <section>
      <article>
        <div className="pt-0 px-4">
          <div className="mb-1">
            <label className="remixui_compilerLabel form-check-label" htmlFor="versionSelector">
              <FormattedMessage id="solidity.compiler" />
            </label>

            <CustomTooltip
              placement="bottom"
              tooltipId="promptCompilerTooltip"
              tooltipClasses="text-nowrap"
              tooltipText={<FormattedMessage id="solidity.addACustomCompilerWithURL" />}
            >
              <span className="fas fa-plus border-0 p-0 ms-3" onClick={() => promptCompiler()}></span>
            </CustomTooltip>
            <CustomTooltip
              placement="bottom"
              tooltipId="showCompilerTooltip"
              tooltipClasses="text-nowrap"
              tooltipText={<FormattedMessage id="solidity.seeCompilerLicense" />}
            >
              <span className="far fa-file-certificate border-0 p-0 ms-2" onClick={() => showCompilerLicense()}></span>
            </CustomTooltip>
            { solJsonBinData && solJsonBinData.selectorList && solJsonBinData.selectorList.length > 0 ? (
              <CompilerDropdown
                allversions={solJsonBinData.selectorList}
                customVersions={state.customVersions}
                selectedVersion={state.selectedVersion}
                defaultVersion={state.defaultVersion}
                handleLoadVersion={handleLoadVersion}
                _shouldBeAdded={_shouldBeAdded}
                onlyDownloaded={state.onlyDownloaded}
              ></CompilerDropdown>):null}
          </div>
          <div className="mb-2 flex-row-reverse d-flex flex-row form-check">
            <label htmlFor="nightlies" data-id="compilerNightliesBuild" className="pt-0 form-check-label">
              <FormattedMessage id="solidity.includeNightlyBuilds" />
            </label>
            <input className="me-2 form-check-input" id="nightlies" type="checkbox" onChange={handleNightliesChange} checked={state.includeNightlies} />
          </div>
          {platform === appPlatformTypes.desktop ?
            <div className="mb-2 flex-row-reverse d-flex flex-row form-check">
              <input className="me-2 form-check-input" id="downloadedcompilers" type="checkbox" onChange={handleOnlyDownloadedChange} checked={state.onlyDownloaded} />
              <label htmlFor="downloadedcompilers" data-id="compilerNightliesBuild" className="form-check-label">
                <FormattedMessage id="solidity.downloadedCompilers" />
              </label>
            </div>:null}
          <div className="mt-2 remixui_compilerConfig form-check">
            <input
              className="form-check-input"
              type="checkbox"
              onChange={handleAutoCompile}
              data-id="compilerContainerAutoCompile"
              id="autoCompile"
              title="Auto compile"
              checked={state.autoCompile}
            />
            <label className="form-check-label" htmlFor="autoCompile">
              <FormattedMessage id="solidity.autoCompile" />
            </label>
          </div>
          <div className="mt-1 mb-2 remixui_compilerConfig form-check">
            <input
              className="form-check-input"
              onChange={handleHideWarningsChange}
              id="hideWarningsBox"
              type="checkbox"
              title="Hide warnings"
              checked={state.hideWarnings}
            />
            <label className="form-check-label" htmlFor="hideWarningsBox">
              <FormattedMessage id="solidity.hideWarnings" />
            </label>
          </div>
          {isHardhatProject && (
            <div className="mt-3 remixui_compilerConfig form-check">
              <input
                className="form-check-input"
                onChange={updatehhCompilation}
                id="enableHardhat"
                type="checkbox"
                title="Enable Hardhat Compilation"
                checked={hhCompilation}
              />
              <label className="form-check-label" htmlFor="enableHardhat">
                <FormattedMessage id="solidity.enableHardhat" />
              </label>
              <a className="mt-1 text-nowrap" href="https://remix-ide.readthedocs.io/en/latest/hardhat.html#enable-hardhat-compilation" target={'_blank'}>
                <CustomTooltip
                  placement={'right'}
                  tooltipClasses="text-nowrap"
                  tooltipId="overlay-tooltip-hardhat"
                  tooltipText={
                    <span className="border bg-light text-dark p-1 pe-3" style={{ minWidth: '230px' }}>
                      <FormattedMessage id="solidity.learnHardhat" />
                    </span>
                  }
                >
                  <i className={'ms-2 fas fa-info'} aria-hidden="true"></i>
                </CustomTooltip>
              </a>
            </div>
          )}
          {isTruffleProject && (
            <div className="mt-3 remixui_compilerConfig form-check">
              <input
                className="form-check-input"
                onChange={updateTruffleCompilation}
                id="enableTruffle"
                type="checkbox"
                title="Enable Truffle Compilation"
                checked={truffleCompilation}
              />
              <label className="form-check-label" htmlFor="enableTruffle">
                <FormattedMessage id="solidity.enableTruffle" />
              </label>
              <a className="mt-1 text-nowrap" href="https://remix-ide.readthedocs.io/en/latest/truffle.html#enable-truffle-compilation" target={'_blank'}>
                <CustomTooltip
                  placement={'right'}
                  tooltipClasses="text-nowrap"
                  tooltipId="overlay-tooltip-truffle"
                  tooltipText={
                    <span className="border bg-light text-dark p-1 pe-3" style={{ minWidth: '230px' }}>
                      <FormattedMessage id="solidity.learnTruffle" />
                    </span>
                  }
                >
                  <i style={{ fontSize: 'medium' }} className={'ms-2 fas fa-info'} aria-hidden="true"></i>
                </CustomTooltip>
              </a>
            </div>
          )}
        </div>
        <div className="d-flex px-4 remixui_compilerConfigSection justify-content-between" onClick={() => {
          // Track advanced configuration toggle
          trackMatomoEvent({ category: 'compilerContainer', action: 'advancedConfigToggle', name: !toggleExpander ? 'expanded' : 'collapsed', isClick: true })
          toggleConfigurations()
        }}>
          <div className="d-flex">
            <label className="remixui_compilerConfigSection">
              <FormattedMessage id="solidity.advancedConfigurations" />
            </label>
          </div>
          <div>
            <span data-id="scConfigExpander" onClick={() => {
              // Track advanced configuration toggle
              trackMatomoEvent({ category: 'compilerContainer', action: 'advancedConfigToggle', name: !toggleExpander ? 'expanded' : 'collapsed', isClick: true })
              toggleConfigurations()
            }}>
              <i className={!toggleExpander ? 'fas fa-angle-right' : 'fas fa-angle-down'} aria-hidden="true"></i>
            </span>
          </div>
        </div>
        <div className={`px-4 pb-4 border-bottom flex-column ${toggleExpander ? 'd-flex' : 'd-none'}`}>
          <div className="d-flex pb-1 remixui_compilerConfig form-check">
            <input
              className="form-check-input"
              type="radio"
              name="configradio"
              value="manual"
              onChange={toggleConfigType}
              checked={!state.useFileConfiguration}
              id="scManualConfig"
            />
            <label className="form-check-label ms-1" htmlFor="scManualConfig" data-id="scManualConfiguration">
              <FormattedMessage id="solidity.compilerConfiguration" />
            </label>
          </div>
          <div className={`flex-column 'd-flex'}`}>
            <div className="mb-2 ms-4">
              <label className="remixui_compilerLabel form-check-label" htmlFor="compilerLanguageSelector">
                <FormattedMessage id="solidity.language" />
              </label>
              <CustomTooltip
                placement="right"
                tooltipId="compilerLabelTooltip"
                tooltipClasses="text-nowrap"
                tooltipText={
                  <span>
                    <FormattedMessage id="solidity.tooltipText6" />
                  </span>
                }
              >
                <div id="compilerLanguageSelectorWrapper">
                  <select
                    onChange={(e) => handleLanguageChange(e.target.value)}
                    disabled={state.useFileConfiguration}
                    value={state.language}
                    className="form-select"
                    id="compilerLanguageSelector"
                    style={{
                      pointerEvents: state.useFileConfiguration ? 'none' : 'auto'
                    }}
                  >
                    <option data-id={state.language === 'Solidity' ? 'selected' : ''} value="Solidity">
                      Solidity
                    </option>
                    <option data-id={state.language === 'Yul' ? 'selected' : ''} value="Yul">
                      Yul
                    </option>
                  </select>
                </div>
              </CustomTooltip>
            </div>
            <div className="mb-2 ms-4">
              <label className="remixui_compilerLabel form-check-label" htmlFor="evmVersionSelector">
                <FormattedMessage id="solidity.evmVersion" />
              </label>
              <select
                value={state.evmVersion}
                onChange={(e) => handleEvmVersionChange(e.target.value)}
                disabled={state.useFileConfiguration}
                className="form-select"
                id="evmVersionSelector"
              >
                {compileTabLogic.evmVersions.map((version, index) => (
                  <option key={index} data-id={state.evmVersion === version ? 'selected' : ''} value={version}>
                    {version === 'default' ? `default (${compileTabLogic.evmVersions[index + 1]})` : version}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-1 mt-3 border-dark pb-3 ms-4 remixui_compilerConfig ">
              <div className="justify-content-between align-items-center d-flex">
                <CustomTooltip
                  placement="top"
                  tooltipId="configfileOptimisationNumbeTooltip"
                  tooltipClasses="text-nowrap"
                  tooltipText={(!state.optimize ? "Enable " : "Disable ") + "opcode-based optimizer for the generated bytecode and the Yul optimizer for the Yul code"}
                >
                  <div className='form-check'>
                    <input
                      onChange={(e) => {
                        handleOptimizeChange(e.target.checked)
                      }}
                      disabled={state.useFileConfiguration}
                      className="form-check-input"
                      id="optimize"
                      type="checkbox"
                      checked={state.optimize}
                    />
                    <label className="form-check-label" htmlFor="optimize">
                      <FormattedMessage id="solidity.enableOptimization" />
                    </label>
                  </div>
                </CustomTooltip>
                <CustomTooltip
                  placement="top"
                  tooltipId="configfileOptimisationNumberTooltip"
                  tooltipClasses="text-nowrap"
                  tooltipText={intl.formatMessage({ id: 'solidity.inputTitle2' })}
                >
                  <input
                    min="1"
                    className="form-select ms-4"
                    id="runs"
                    placeholder="200"
                    value={state.runs}
                    type="number"
                    onChange={(e) => onChangeRuns(e.target.value)}
                    disabled={!state.optimize || state.useFileConfiguration}
                  />
                </CustomTooltip>
              </div>
            </div>
          </div>
          <div className="d-flex pb-1 remixui_compilerConfig form-check">
            <input
              className="form-check-input"
              type="radio"
              name="configradio"
              value="file"
              onChange={toggleConfigType}
              checked={state.useFileConfiguration}
              id="scFileConfig"
            />
            <label className="form-check-label ms-1" htmlFor="scFileConfig" data-id="scFileConfiguration">
              <FormattedMessage id="solidity.useConfigurationFile" />
            </label>
          </div>
          <RenderIf condition={state.useFileConfiguration}>
            <a data-id="view-solidity-config" className="cursor-pointer text-decoration-none ms-4" href='#' onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleConfigFileClick()
            }}>
              <i className="text-secondary mt-1 pe-1 far fa-edit"></i> Update config remix.config.json
            </a>
          </RenderIf>
        </div>
        <div className="px-4">
          <button
            id="compileBtn"
            data-id="compilerContainerCompileBtn"
            className="btn btn-primary btn-block d-block w-100 text-break remixui_disabled mb-1 mt-3"
            onClick={compile}
            disabled={disableCompileButton}
          >
            <CustomTooltip
              placement="auto"
              tooltipId="overlay-tooltip-compile"
              tooltipText={
                <div className="text-start">
                  {(
                    <div>
                      <b>Ctrl+S</b> <FormattedMessage id="solidity.toCompile" /> {state.compiledFileName.endsWith('.sol') ? state.compiledFileName : null}{' '}
                    </div>
                  )}
                </div>
              }
            >
              <div className="d-flex align-items-center justify-content-center">
                {<i ref={compileIcon} className="fas fa-sync me-2" aria-hidden="true"></i>}
                <div className="text-truncate overflow-hidden text-nowrap">
                  <span>
                    <FormattedMessage id="solidity.compile" />
                  </span>
                  <span className="ms-1 text-nowrap">
                    {typeof state.compiledFileName === 'string'
                      ? extractNameFromKey(state.compiledFileName) ||
                        `<${intl.formatMessage({
                          id: 'solidity.noFileSelected'
                        })}>`
                      : `<${intl.formatMessage({
                        id: 'solidity.noFileSelected'
                      })}>`}
                  </span>
                </div>
              </div>
            </CustomTooltip>
          </button>
          <div className="d-flex align-items-center">
            <button
              id="compileAndRunBtn"
              data-id="compilerContainerCompileAndRunBtn"
              className="btn btn-secondary btn-block d-block w-100 text-break  d-inline-block remixui_disabled mb-1 mt-1"
              onClick={compileAndRun}
              disabled={disableCompileButton}
            >
              <CustomTooltip
                placement={'auto-end'}
                tooltipId="overlay-tooltip-compile-run"
                tooltipText={
                  <div className="text-start">
                    {(
                      <div>
                        <b>Ctrl+Shift+S</b> <FormattedMessage id="solidity.tooltipText3" />
                      </div>
                    )}
                  </div>
                }
              >
                <span>
                  <FormattedMessage id="solidity.compileAndRunScript" />
                </span>
              </CustomTooltip>
            </button>
            <CustomTooltip
              placement="top"
              tooltipId="overlay-tooltip-compile-run-doc"
              tooltipText={
                <div className="text-start p-2">
                  <div><FormattedMessage id="solidity.tooltipText1" /></div>
                  <pre>
                    <code>
                      /**
                      <br />
                      * @title ContractName
                      <br />
                      * @dev ContractDescription
                      <br />
                      * @custom:dev-run-script file_path
                      <br />
                      */
                      <br />
                      contract ContractName {'{}'}
                      <br />
                    </code>
                  </pre>
                  <FormattedMessage id="solidity.tooltipText2" />
                </div>
              }
            >
              <a href="https://remix-ide.readthedocs.io/en/latest/running_js_scripts.html#compile-a-contract-and-run-a-script-on-the-fly" target="_blank">
                <i className="ps-2 ms-2 fas fa-info text-dark"></i>
              </a>
            </CustomTooltip>
            <CopyToClipboard tip={intl.formatMessage({ id: 'solidity.copyNatSpecTag' })} getContent={() => '@custom:dev-run-script file_path'} direction="top">
              <button className="btn remixui_copyButton  ms-2 my-1 text-dark">
                <i className="remixui_copyIcon far fa-copy" aria-hidden="true"></i>
              </button>
            </CopyToClipboard>
          </div>
        </div>
      </article>
    </section>
  )
}

export default CompilerContainer
