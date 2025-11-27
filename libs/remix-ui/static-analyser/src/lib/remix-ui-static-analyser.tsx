/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import React, {useEffect, useState, useReducer, useRef, Fragment, useContext} from 'react' // eslint-disable-line
import Button from './Button/StaticAnalyserButton' // eslint-disable-line
import { util } from '@remix-project/remix-lib'
import _ from 'lodash'
import * as semver from 'semver'
import {TreeView, TreeViewItem} from '@remix-ui/tree-view' // eslint-disable-line
import {RemixUiCheckbox} from '@remix-ui/checkbox' // eslint-disable-line
import ErrorRenderer from './ErrorRenderer' // eslint-disable-line
import { compilation } from './actions/staticAnalysisActions'
import { initialState, analysisReducer } from './reducers/staticAnalysisReducer'
import { CodeAnalysis } from '@remix-project/remix-analyzer'
import Tab from 'react-bootstrap/Tab'
import Tabs from 'react-bootstrap/Tabs'
import { AnalysisTab, SolHintReport } from '../staticanalyser'
import { run } from './actions/staticAnalysisActions'
import { BasicTitle, calculateWarningStateEntries } from './components/BasicTitle'
import { Nav, TabContainer } from 'react-bootstrap'
import { CustomTooltip } from '@remix-ui/helper'
import { appPlatformTypes, platformContext, AppContext } from '@remix-ui/app'
import { TrackingContext } from '@remix-ide/tracking'

/* eslint-disable-next-line */
export interface RemixUiStaticAnalyserProps {
  registry: any
  event: any
  analysisModule: AnalysisTab
}

type tabSelectionType = 'remix' | 'solhint' | 'slither' | 'none'

export const RemixUiStaticAnalyser = (props: RemixUiStaticAnalyserProps) => {
  const [runner] = useState(new CodeAnalysis())
  const platform = useContext(platformContext)
  const appContext = useContext(AppContext)
  const { trackMatomoEvent } = useContext(TrackingContext)

  const preProcessModules = (arr: any) => {
    return arr.map((Item, i) => {
      const itemObj = new Item()
      itemObj._index = i
      itemObj.categoryDisplayName = itemObj.category.displayName
      itemObj.categoryId = itemObj.category.id
      return itemObj
    })
  }

  const groupedModules = util.groupBy(preProcessModules(runner.modules()), 'categoryId')

  const getIndex = (modules, array) => {
    Object.values(modules).map((value: {_index}) => {
      if (Array.isArray(value)) {
        value.forEach((x) => {
          array.push(x._index.toString())
        })
      } else {
        array.push(value._index.toString())
      }
    })
  }

  const groupedModuleIndex = (modules) => {
    const indexOfCategory = []
    if (!_.isEmpty(modules)) {
      getIndex(modules, indexOfCategory)
    }
    return indexOfCategory
  }
  const [basicEnabled, setBasicEnabled] = useState(true)
  const [solhintEnabled, setSolhintEnabled] = useState(true) // assuming that solhint is always enabled
  const [showSlither, setShowSlither] = useState(false)
  const [slitherEnabled, setSlitherEnabled] = useState(false)
  const [startAnalysis, setStartAnalysis] = useState(false)
  const [isSupportedVersion, setIsSupportedVersion] = useState(false)
  let [showLibsWarning, setShowLibsWarning] = useState(false) // eslint-disable-line prefer-const
  const [categoryIndex, setCategoryIndex] = useState(groupedModuleIndex(groupedModules))
  const [warningState, setWarningState] = useState({})
  const [hideWarnings, setHideWarnings] = useState(false)
  const [hints, setHints] = useState<SolHintReport[]>([])
  const [slitherWarnings, setSlitherWarnings] = useState([])
  const [ssaWarnings, setSsaWarnings] = useState([])
  const [selectedTab, setSelectedTab] = useState<tabSelectionType>('remix')
  const warningContainer = useRef(null)
  const allWarnings = useRef({})
  const [state, dispatch] = useReducer(analysisReducer, initialState)
  const [runButtonTitle, setRunButtonTitle] = useState<string>(`Run analysis`)

  /**
   * Disable static analysis for contracts whose compiler version is
   * less than 0.4.12
   * @param version {string} - Solidity compiler version
   */
  const setDisableForRun = (version: string) => {
    const truncateVersion = (version: string) => {
      const tmp: RegExpExecArray | null = /^(\d+.\d+.\d+)/.exec(version)
      return tmp ? tmp[1] : version
    }
    if (version && version != '' && !semver.gt(truncateVersion(version), '0.4.12')) {
      setIsSupportedVersion(false)
      setRunButtonTitle('Select Solidity compiler version greater than 0.4.12.')
    } else {
      setIsSupportedVersion(true)
      setRunButtonTitle(`${state && state.data && state.file.length > 0 ? 'Run analysis' : 'To run analysis for selected tools, first compile a contract'}`)
    }
  }

  useEffect(() => {
    compilation(props.analysisModule, dispatch)
  }, [props])

  useEffect(() => {
    props.analysisModule.call('solidity', 'getCompilerState').then((compilerState) => setDisableForRun(compilerState.currentVersion))
    props.event.trigger('staticAnalysisWarning', [-1])
  }, [])

  useEffect(() => {
    props.event.trigger('staticAnalysisWarning', [-1])
  }, [state])

  useEffect(() => {
    props.analysisModule.on('solidity', 'compilationFinished', (fileName, source, languageVersion, data) => {
      setHints([])
      setSlitherWarnings([])
      setSsaWarnings([])
    })
  }, [state])

  useEffect(() => {
    const checkRemixdActive = async () => {
      const remixdActive = await props.analysisModule.call('manager', 'isActive', 'remixd') || platform === appPlatformTypes.desktop
      if (remixdActive) {
        setSlitherEnabled(true)
        setShowSlither(true)
      }
    }
    checkRemixdActive()
    props.event.trigger('staticAnalysisWarning', [-1])
  }, [props])

  useEffect(() => {
    props.analysisModule.on('filePanel', 'setWorkspace', (currentWorkspace) => {
      // Reset warning state
      setWarningState([])
      // Reset badge

      // Reset state
      dispatch({ type: '', payload: initialState })
      setHints([])
      setSlitherWarnings([])
      setSsaWarnings([])
      // Show 'Enable Slither Analysis' checkbox
      if ((currentWorkspace && currentWorkspace.isLocalhost === true) || platform === appPlatformTypes.desktop) {
        setShowSlither(true)
        setSlitherEnabled(true)
      } else {
        setShowSlither(false)
        setSlitherEnabled(false)
      }
      setTimeout(() => {
        props.event.trigger('staticAnalysisWarning', [-1])
      }, 500)
    })
    props.analysisModule.on('manager', 'pluginDeactivated', (plugin) => {
      // Hide 'Enable Slither Analysis' checkbox
      if (plugin.name === 'remixd') {
        // Reset warning state
        setWarningState([])
        setHints([])
        setSlitherWarnings([])
        setSlitherEnabled(false)
        setSsaWarnings([])
        // Reset badge
        props.event.trigger('staticAnalysisWarning', [-1])
        // Reset state
        dispatch({ type: '', payload: initialState })
        setShowSlither(false)
      }
    })
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    props.analysisModule.on('solidity', 'compilerLoaded', async (version: string, license: string) => {
      setDisableForRun(version)
      props.event.trigger('staticAnalysisWarning', [-1])
    })
    return () => {}
  }, [props])

  const hintErrors = hints.filter((hint) => hint.type === 'error')
  const noLibSlitherWarnings = slitherWarnings.filter((w) => !w.options.isLibrary)
  const slitherErrors = noLibSlitherWarnings.filter((slitherError) => slitherError.options.type === 'error')
  const remixAnalysisNoLibs = ssaWarnings.filter((ssa) => ssa.options.isLibrary === false)
  const remixAnalysisLessWarnings = ssaWarnings.filter((ssa) => ssa.options.type !== 'warning')

  const message = (name: string, warning: any, more?: string, fileName?: string, locationString?: string): string => {
    return `
      <span className='d-flex flex-column'>
      <span className='h6 fw-bold'>${name}</span>
      ${warning}
      ${
  more ? (
    <span>
      <a href={more} target="_blank">
              more
      </a>
    </span>
  ) : (
    <span> </span>
  )
}
      <span className="" title={Position in ${fileName}}>Pos: ${locationString}</span>
      </span>`
  }

  const filterWarnings = () => {
    let newWarningState = {}
    let newWarningCount = 0
    if (showLibsWarning) {
      for (const category in allWarnings.current) newWarningCount = newWarningCount + allWarnings.current[category].length
      newWarningState = allWarnings.current
    } else {
      for (const category in allWarnings.current) {
        const warnings = allWarnings.current[category]
        newWarningState[category] = []
        for (const warning of warnings) {
          if (!warning.options.isLibrary) {
            newWarningCount++
            newWarningState[category].push(warning)
          }
        }
      }
    }
    props.event.trigger('staticAnaysisWarning', [newWarningCount])
    setWarningState(newWarningState)
  }

  const showWarnings = (warningMessage, groupByKey) => {
    const resultArray = []
    warningMessage.map((x) => {
      resultArray.push(x)
    })
    function groupBy(objectArray, property) {
      return objectArray.reduce((acc, obj) => {
        const key = obj[property]
        if (!acc[key]) {
          acc[key] = []
        }
        // Add object to list for given key's value
        acc[key].push(obj)
        return acc
      }, {})
    }

    const groupedCategory = groupBy(resultArray, groupByKey)
    allWarnings.current = groupedCategory
    filterWarnings()
  }

  const handleCheckAllModules = (groupedModules) => {
    const index = groupedModuleIndex(groupedModules)
    if (index.every((el) => categoryIndex.includes(el))) {
      setCategoryIndex(
        categoryIndex.filter((el) => {
          return !index.includes(el)
        })
      )
    } else {
      setCategoryIndex(_.uniq([...categoryIndex, ...index]))
    }
  }

  const handleCheckOrUncheckCategory = (category) => {
    const index = groupedModuleIndex(category)
    if (index.every((el) => categoryIndex.includes(el))) {
      setCategoryIndex(
        categoryIndex.filter((el) => {
          return !index.includes(el)
        })
      )
    } else {
      setCategoryIndex(_.uniq([...categoryIndex, ...index]))
    }
  }

  const handleCheckSingle = (event, _index) => {
    _index = _index.toString()
    if (categoryIndex.includes(_index)) {
      setCategoryIndex(categoryIndex.filter((val) => val !== _index))
    } else {
      setCategoryIndex(_.uniq([...categoryIndex, _index]))
    }
  }

  const categoryItem = (categoryId, item, i) => {
    return (
      <div className="form-check" key={i}>
        <RemixUiCheckbox
          categoryId={categoryId}
          id={`staticanalysismodule_${categoryId}_${i}`}
          inputType="checkbox"
          name="checkSingleEntry"
          itemName={item.name}
          label={item.description}
          onClick={(event) => handleCheckSingle(event, item._index)}
          checked={categoryIndex.includes(item._index.toString())}
          onChange={() => {}}
        />
      </div>
    )
  }

  const categorySection = (category, categoryId, i) => {
    return (
      <div className="" key={i}>
        <div className="block">
          <TreeView>
            <TreeViewItem
              label={
                <label
                  htmlFor={`heading${categoryId}`}
                  style={{ cursor: 'pointer' }}
                  className="ps-3 card-header h6 d-flex justify-content-between fw-bold px-1 py-2 w-100"
                  data-bs-toggle="collapse"
                  data-bs-expanded="false"
                  data-bs-controls={`heading${categoryId}`}
                  data-bs-target={`#heading${categoryId}`}
                >
                  {category[0].categoryDisplayName}
                </label>
              }
              expand={false}
            >
              <div>
                <RemixUiCheckbox
                  onClick={() => handleCheckOrUncheckCategory(category)}
                  id={categoryId}
                  inputType="checkbox"
                  label={`Select ${category[0].categoryDisplayName}`}
                  name="checkCategoryEntry"
                  checked={category.map((x) => x._index.toString()).every((el) => categoryIndex.includes(el))}
                  onChange={() => {}}
                  title={category[0].categoryDisplayName}
                  tooltipPlacement="right"
                />
              </div>
              <div className="w-100 d-block px-2 my-1 entries collapse multi-collapse" id={`heading${categoryId}`}>
                {category.map((item, i) => {
                  return categoryItem(categoryId, item, i)
                })}
              </div>
            </TreeViewItem>
          </TreeView>
        </div>
      </div>
    )
  }

  useEffect(() => {
    if (!hideWarnings && !showLibsWarning) {
      const slitherTotal = slitherWarnings && state.data && state.source !== null ? slitherWarnings.filter((x) => !x.options.isLibrary && x.hasWarning).length : 0
      const ssaTotal = ssaWarnings && state.data && state.source !== null ? ssaWarnings.filter((x) => !x.options.isLibrary && x.hasWarning).length : 0
      const hintsTotal = hints && state.data && state.source !== null ? hints.length : 0
      props.event.trigger('staticAnaysisWarning', [
        slitherTotal + ssaTotal + hintsTotal === 0 ? -1 : !solhintEnabled && !basicEnabled && !slitherEnabled ? -1 : slitherTotal + ssaTotal + hintsTotal
      ])
    }
    if (!hideWarnings && showLibsWarning) {
      props.event.trigger('staticAnaysisWarning', [
        slitherWarnings.length + ssaWarnings.length + hints.length === 0
          ? -1
          : !solhintEnabled && !basicEnabled && !slitherEnabled
            ? -1
            : slitherWarnings.length + ssaWarnings.length + hints.length
      ])
    }
    if (hideWarnings) {
      const slitherTotal = slitherWarnings && state.data && state.source !== null ? slitherWarnings.filter((x) => x.options.type === 'error').length : 0
      const ssaTotal = ssaWarnings && state.data && state.source !== null ? ssaWarnings.filter((x) => x.options.type === 'error').length : 0
      const hintsTotal = hints && state.data && state.source !== null ? hints.filter((x) => x.type === 'error').length : 0
      props.event.trigger('staticAnaysisWarning', [slitherTotal + ssaTotal + hintsTotal === 0 ? -1 : slitherTotal + ssaTotal + hintsTotal])
    }
    if (hideWarnings && !solhintEnabled && !slitherEnabled && !basicEnabled) {
      props.event.trigger('staticAnaysisWarning', [-1])
    }
  }, [hideWarnings, showLibsWarning])

  useEffect(() => {
    let slitherTotal = 0
    if (slitherEnabled && showSlither && slitherWarnings && state.data && state.source !== null) {
      slitherTotal = slitherWarnings.filter((x) => !x.options.isLibrary && x.hasWarning).length
      props.analysisModule.slitherEnabled = true
    }
    let ssaTotal = 0
    if (basicEnabled && ssaWarnings && state.data && state.source !== null) {
      ssaTotal = ssaWarnings.filter((x) => !x.options.isLibrary && x.hasWarning).length
      props.analysisModule.basicEnabled = true
    }

    let hintsTotal = 0
    if (solhintEnabled && hints && state.data && state.source !== null) {
      hintsTotal = hints.length
      props.analysisModule.solhintEnabled = true
    }
    props.event.trigger('staticAnaysisWarning', [slitherTotal + ssaTotal + hintsTotal === 0 ? -1 : slitherTotal + ssaTotal + hintsTotal])
  }, [hints.length, slitherWarnings.length, ssaWarnings.length])

  useEffect(() => {
    let slitherTotal = 0
    if (slitherWarnings && slitherEnabled && showSlither && state.data && state.source !== null) {
      slitherTotal = slitherWarnings.filter((x) => !x.options.isLibrary && x.hasWarning).length
      props.analysisModule.slitherEnabled = true
    }

    let ssaTotal = 0
    if (ssaWarnings && basicEnabled && state.data && state.source !== null) {
      ssaTotal = ssaWarnings.filter((x) => !x.options.isLibrary && x.hasWarning).length
      props.analysisModule.basicEnabled = true
    }

    let hintsTotal = 0
    if (hints && solhintEnabled && state.data && state.source !== null) {
      hintsTotal = hints.length
    }
    props.event.trigger('staticAnaysisWarning', [slitherTotal + ssaTotal + hintsTotal === 0 ? -1 : slitherTotal + ssaTotal + hintsTotal])
  }, [solhintEnabled, basicEnabled, slitherEnabled, showSlither])

  const handleSlitherEnabled = async () => {
    const checkRemixd = await props.analysisModule.call('manager', 'isActive', 'remixd')
    if (showSlither) {
      setShowSlither(false)
      props.analysisModule.slitherEnabled = false
    }
    if (!showSlither) {
      setShowSlither(true)
      props.analysisModule.slitherEnabled = true
    }
  }

  const handleBasicEnabled = () => {
    if (basicEnabled) {
      setBasicEnabled(false)
      props.analysisModule.basicEnabled = false
      if (solhintEnabled) {
        setSelectedTab('solhint')
      }
      props.event.trigger('staticAnalysisWarning', [-1])
    } else {
      setBasicEnabled(true)
      if (!solhintEnabled) {
        setSelectedTab('remix')
      }
      props.analysisModule.basicEnabled = true
      props.event.trigger('staticAnalysisWarning', [-1])
    }
  }

  const handleLinterEnabled = () => {
    if (solhintEnabled) {
      setSolhintEnabled(false)
      props.analysisModule.solhintEnabled = false
      if (basicEnabled) {
        setSelectedTab('remix')
      }
      props.event.trigger('staticAnalysisWarning', [-1])
    } else {
      setSolhintEnabled(true)
      if (!basicEnabled) {
        setSelectedTab('solhint')
      }
      props.analysisModule.solhintEnabled = true
      props.event.trigger('staticAnalysisWarning', [-1])
    }
  }

  const handleShowLibsWarning = () => {
    if (showLibsWarning) {
      setShowLibsWarning(false)
    } else {
      setShowLibsWarning(true)
    }
    filterWarnings()
  }

  const handleHideWarnings = () => {
    setHideWarnings(!hideWarnings)
  }

  const tabKeys = [
    {
      tabKey: 'solhint',
      connectedState: solhintEnabled,
      child: (
        <>
          {hints.length > 0 ? (
            <div id="solhintlintingresult" className="mb-5">
              <div className="mb-4 pt-2">
                <Fragment>
                  {!hideWarnings
                    ? hints.map((hint, index) => (
                      <div
                        key={index}
                        className={`${hint.type === 'warning' ? 'alert alert-warning' : 'alert alert-danger'}`}
                        style={{
                          cursor: 'pointer',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                        onClick={async () => {
                          await props.analysisModule.call('editor', 'discardHighlight')
                          await props.analysisModule.call(
                            'editor',
                            'highlight',
                            {
                              end: {
                                line: hint.line,
                                column: hint.column + 1
                              },
                              start: {
                                line: hint.line,
                                column: hint.column
                              }
                            },
                            state.file,
                            '',
                            { focus: true }
                          )
                        }}
                      >
                        <div>
                          <span className="text-wrap">{hint.formattedMessage}</span>
                          <br />
                          <CustomTooltip placement="right" tooltipId="errorTooltip" tooltipText={`Position in ${state.file}`} tooltipClasses="text-nowrap">
                            <span>{`Pos: ${hint.column}:${hint.line}`}</span>
                          </CustomTooltip>
                        </div>
                      </div>
                    ))
                    : !hideWarnings && !showLibsWarning && !basicEnabled && solhintEnabled
                      ? hints.map((hint, index) => (
                        <div
                          key={index}
                          className={`${hint.type === 'warning' ? 'alert alert-warning' : 'alert alert-danger'}`}
                          style={{
                            cursor: 'pointer',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                          onClick={async () => {
                            await props.analysisModule.call('editor', 'discardHighlight')
                            await props.analysisModule.call(
                              'editor',
                              'highlight',
                              {
                                end: {
                                  line: hint.line,
                                  column: hint.column + 1
                                },
                                start: {
                                  line: hint.line,
                                  column: hint.column
                                }
                              },
                              state.file,
                              '',
                              { focus: true }
                            )
                          }}
                        >
                          <div>
                            <span className="text-wrap">{hint.formattedMessage}</span>
                            <br />
                            <CustomTooltip placement="right" tooltipId="errorTooltip" tooltipText={`Position in ${state.file}`} tooltipClasses="text-nowrap">
                              <span>{`Pos: ${hint.column}:${hint.line}`}</span>
                            </CustomTooltip>
                          </div>
                        </div>
                      ))
                      : hintErrors.map((hint, index) => (
                        <div
                          key={index}
                          className="alert alert-danger"
                          style={{
                            cursor: 'pointer',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                          onClick={async () => {
                            await props.analysisModule.call('editor', 'discardHighlight')
                            await props.analysisModule.call(
                              'editor',
                              'highlight',
                              {
                                end: {
                                  line: hint.line,
                                  column: hint.column + 1
                                },
                                start: {
                                  line: hint.line,
                                  column: hint.column
                                }
                              },
                              state.file,
                              '',
                              { focus: true }
                            )
                          }}
                        >
                          <div>
                            <span
                              className="text-wrap"
                              style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                            >
                              {hint.formattedMessage}
                            </span>
                            <br />
                            <CustomTooltip placement="right" tooltipId="errorTooltip" tooltipText={`Position in ${state.file}`} tooltipClasses="text-nowrap">
                              <span>{`Pos: ${hint.column}:${hint.line}`}</span>
                            </CustomTooltip>
                          </div>
                        </div>
                      ))}
                </Fragment>
              </div>
            </div>
          ) : state.data && state.file.length > 0 && state.source && startAnalysis && hints.length > 0 ? (
            <span className="ms-4 spinner-grow-sm d-flex justify-content-center">Loading...</span>
          ) : (
            <span className="display-6 text-center"></span>
          )}
        </>
      ),
      title: (
        <span>
          Solhint
          {hints.length > 0 ? (
            hideWarnings ? (
              <i className={`badge ${hints.filter((x) => x.type === 'error').length > 0 ? `bg-danger` : 'bg-warning'} rounded-pill mx-1 ms-1 text-center`}>
                {hintErrors.length}
              </i>
            ) : (
              <span className={`badge ${hints.filter((x) => x.type === 'error').length > 0 ? `bg-danger` : 'bg-warning'} rounded-pill ms-1 text-center`}>{hints.length}</span>
            )
          ) : null}
        </span>
      )
    },
    {
      tabKey: 'remix',
      connectedState: basicEnabled,
      title: <BasicTitle warningStateEntries={Object.entries(warningState)} hideWarnings={hideWarnings} showLibsWarnings={showLibsWarning} ssaWarnings={ssaWarnings} />,
      child: (
        <>
          {ssaWarnings.length > 0 ? (
            <div id="staticanalysisresult">
              <div className="mb-4 pt-2">
                <div>
                  {!hideWarnings && !showLibsWarning && ssaWarnings.length > 0
                    ? ssaWarnings
                      .filter((x) => !x.options.isLibrary && x.hasWarning)
                      .map((x, i) => (
                        <div data-id={`staticAnalysisModule${x.warningModuleName}${i}`} id={`staticAnalysisModule${x.warningModuleName}${i}`} key={i}>
                          <ErrorRenderer
                            name={`staticAnalysisModule${x.warningModuleName}${i}`}
                            message={x.msg}
                            opt={x.options}
                            warningErrors={''}
                            ssaState={state}
                            editor={props.analysisModule}
                          />
                        </div>
                      ))
                    : !hideWarnings && showLibsWarning && ssaWarnings.length > 0
                      ? ssaWarnings.map((x, i) => (
                        <div data-id={`staticAnalysisModule${x.warningModuleName}${i}`} id={`staticAnalysisModule${x.warningModuleName}${i}`} key={i}>
                          <ErrorRenderer
                            name={`staticAnalysisModule${x.warningModuleName}${i}`}
                            message={x.msg}
                            opt={x.options}
                            warningErrors={''}
                            ssaState={state}
                            editor={props.analysisModule}
                          />
                        </div>
                      ))
                      : !hideWarnings && !showLibsWarning && basicEnabled
                        ? ssaWarnings
                          .filter((x) => !x.options.isLibrary && x.hasWarning)
                          .map((x, i) => (
                            <div data-id={`staticAnalysisModule${x.warningModuleName}${i}`} id={`staticAnalysisModule${x.warningModuleName}${i}`} key={i}>
                              <ErrorRenderer
                                name={`staticAnalysisModule${x.warningModuleName}${i}`}
                                message={x.msg}
                                opt={x.options}
                                warningErrors={''}
                                ssaState={state}
                                editor={props.analysisModule}
                              />
                            </div>
                          ))
                        : null}
                </div>
              </div>
            </div>
          ) : state.data && state.file.length > 0 && state.source && startAnalysis && Object.entries(warningState).length > 0 ? (
            <span className="ms-4 spinner-grow-sm d-flex justify-content-center">Loading...</span>
          ) : (
            <span className="display-6 text-center"></span>
          )}
        </>
      )
    },
    {
      tabKey: 'slither',
      connectedState: slitherEnabled,
      title: (
        <span>
          Slither
          {slitherWarnings.length > 0 ? (
            hideWarnings ? (
              <span data-id='slitherErrors' className="badge text-bg-warning rounded-pill mx-1 ms-1">{slitherErrors.length}</span>
            ) : showLibsWarning && !hideWarnings ? (
              <span data-id='slitherWarnings' className={`badge ${slitherErrors.length > 0 ? `bg-danger` : 'bg-warning'} rounded-pill mx-1 ms-1 text-center`}>{slitherWarnings.length}</span>
            ) : (
              <span data-id='nolibslitherwarnings' className={`badge ${slitherErrors.length > 0 ? `bg-danger` : 'bg-warning'} rounded-pill mx-1 ms-1 text-center`}>{noLibSlitherWarnings.length}</span>
            )
          ) : null}
        </span>
      ),
      child: (
        <>
          {slitherWarnings.length > 0 ? (
            <div id="solhintlintingresult" className="mb-5">
              <div className="mb-4 pt-2">
                <Fragment>
                  {!hideWarnings
                    ? showLibsWarning
                      ? slitherWarnings.map((warning, index) => (
                        <div data-id={`staticAnalysisModule${warning.warningModuleName}${index}`} id={`staticAnalysisModule${warning.warningModuleName}${index}`} key={index}>
                          <ErrorRenderer
                            name={`staticAnalysisModule${warning.warningModuleName}${index}`}
                            message={warning.msg}
                            opt={warning.options}
                            ssaState={state}
                            warningErrors={''}
                            editor={props.analysisModule}
                          />
                        </div>
                      ))
                      : noLibSlitherWarnings.map((warning, index) => (
                        <div data-id={`staticAnalysisModule${warning.warningModuleName}${index}`} id={`staticAnalysisModule${warning.warningModuleName}${index}`} key={index}>
                          <ErrorRenderer
                            name={`staticAnalysisModule${warning.warningModuleName}${index}`}
                            message={warning.msg}
                            opt={warning.options}
                            warningErrors={''}
                            ssaState={state}
                            editor={props.analysisModule}
                          />
                        </div>
                      ))
                    : slitherWarnings
                      .filter((x) => x.options.type === 'error')
                      .map((warning, index) => (
                        <div data-id={`staticAnalysisModule${warning.warningModuleName}${index}`} id={`staticAnalysisModule${warning.warningModuleName}${index}`} key={index}>
                          <ErrorRenderer
                            name={`staticAnalysisModule${warning.warningModuleName}${index}`}
                            message={warning.msg}
                            opt={warning.options}
                            ssaState={state}
                            warningErrors={''}
                            editor={props.analysisModule}
                          />
                        </div>
                      ))}
                </Fragment>
              </div>
            </div>
          ) : state.data && state.file.length > 0 && state.source && startAnalysis && slitherWarnings.length > 0 ? (
            <span className="ms-4 spinner-grow-sm d-flex justify-content-center">Loading...</span>
          ) : (
            <span className="display-6 text-center"></span>
          )}
        </>
      )
    }
  ]

  const checkBasicStatus = () => {
    return Object.values(groupedModules)
      .map((value: any) => {
        return value.map((x) => {
          return x._index.toString()
        })
      })
      .flat()
      .every((el) => categoryIndex.includes(el))
  }

  useEffect(() => {
    const analyzeHandler = () => {
      run(
        state.data,
        state.source,
        state.file,
        state,
        props,
        isSupportedVersion,
        showSlither,
        categoryIndex,
        groupedModules,
        runner,
        trackMatomoEvent,
        message,
        showWarnings,
        allWarnings,
        warningContainer,
        calculateWarningStateEntries,
        warningState,
        setHints,
        hints,
        setSlitherWarnings,
        setSsaWarnings,
        slitherEnabled,
        setStartAnalysis,
        solhintEnabled,
        basicEnabled
      )
    }

    props.analysisModule.on('solidityStaticAnalysis', 'analyze', analyzeHandler)

    return () => {
      props.analysisModule.off('solidityStaticAnalysis', 'analyze')
    }
  }, [state.data, state.source, state.file, state, props])

  return (
    <div className="analysis_3ECCBV px-3 pb-1">
      <div className="my-2 d-flex flex-column align-items-left">
        <div className="d-flex flex-column mb-3" id="staticanalysisButton">
          <div className="mb-3 d-flex justify-content-start">
            <RemixUiCheckbox
              id="checkAllEntries"
              inputType="checkbox"
              title="Remix analysis runs a basic analysis."
              checked={
                basicEnabled &&
                Object.values(groupedModules)
                  .map((value: any) => {
                    return value.map((x) => {
                      return x._index.toString()
                    })
                  })
                  .flat()
                  .every((el) => categoryIndex.includes(el))
              }
              label="Remix"
              onClick={() => {
                handleBasicEnabled()
                handleCheckAllModules(groupedModules)
              }}
              onChange={() => {}}
              tooltipPlacement={'bottom-start'}
              optionalClassName="me-3"
            />

            <RemixUiCheckbox
              id="solhintstaticanalysis"
              inputType="checkbox"
              title="Solhint lints Solidity code for security and style guide validations"
              onClick={handleLinterEnabled}
              checked={solhintEnabled}
              label="Solhint"
              onChange={() => {}}
              tooltipPlacement={'bottom-start'}
              optionalClassName="me-3"
            />

            <RemixUiCheckbox
              id="enableSlither"
              inputType="checkbox"
              onClick={handleSlitherEnabled}
              checked={showSlither && slitherEnabled}
              disabled={slitherEnabled === false}
              tooltipPlacement="bottom-start"
              label="Slither"
              onChange={() => {}}
              optionalClassName="me-3"
              title={slitherEnabled ? 'Slither runs Slither static analysis' : 'To run Slither analysis, Remix IDE must be connected to your local filesystem with Remixd'}
            />
          </div>
          {state.data && state.file.length > 0 && state.source ? (
            <Button
              buttonText={`Analyze ${state.file}`}
              classList="btn btn-sm btn-primary btn-block"
              onClick={async () => {
                await run(
                  state.data,
                  state.source,
                  state.file,
                  state,
                  props,
                  isSupportedVersion,
                  showSlither,
                  categoryIndex,
                  groupedModules,
                  runner,
                  trackMatomoEvent,
                  message,
                  showWarnings,
                  allWarnings,
                  warningContainer,
                  calculateWarningStateEntries,
                  warningState,
                  setHints,
                  hints,
                  setSlitherWarnings,
                  setSsaWarnings,
                  slitherEnabled,
                  setStartAnalysis,
                  solhintEnabled,
                  basicEnabled
                )
              }}
              disabled={state.data === null || !isSupportedVersion || (!solhintEnabled && !basicEnabled)}
            />
          ) : (
            <Button
              buttonText={`Analyze ${state.file}`}
              title={`${runButtonTitle}`}
              classList="btn btn-sm btn-primary btn-block"
              onClick={async () => {
                await run(
                  state.data,
                  state.source,
                  state.file,
                  state,
                  props,
                  isSupportedVersion,
                  showSlither,
                  categoryIndex,
                  groupedModules,
                  runner,
                  trackMatomoEvent,
                  message,
                  showWarnings,
                  allWarnings,
                  warningContainer,
                  calculateWarningStateEntries,
                  warningState,
                  setHints,
                  hints,
                  setSlitherWarnings,
                  setSsaWarnings,
                  slitherEnabled,
                  setStartAnalysis,
                  solhintEnabled,
                  basicEnabled
                )
              }}
              disabled={state.data === null || !isSupportedVersion || (!solhintEnabled && !basicEnabled)}
            />
          )}
          {ssaWarnings.length > 0 || hints.length > 0 ? (
            <div className="d-flex border-top flex-column">
              {slitherWarnings.length > 0 || hints.length > 0 || ssaWarnings.length > 0 ? (
                <div className={`mt-4 p-2 d-flex ${slitherWarnings.length > 0 || hints.length > 0 || ssaWarnings.length > 0 ? 'border-top' : ''} flex-column`}>
                  <span>Last results for:</span>
                  <span className="text-break break-word word-break fw-bold" id="staticAnalysisCurrentFile">
                    {state.file}
                  </span>
                </div>
              ) : null}
              <div className="border-top mt-2 pt-2 mb-3" id="staticanalysisresult">
                <RemixUiCheckbox
                  id="showLibWarnings"
                  name="showLibWarnings"
                  categoryId="showLibWarnings"
                  inputType="checkbox"
                  checked={showLibsWarning}
                  label="Show warnings for external libraries"
                  onClick={handleShowLibsWarning}
                  onChange={() => {}}
                  tooltipPlacement="top-start"
                />
                <RemixUiCheckbox
                  id="hideWarnings"
                  name="hideWarnings"
                  inputType="checkbox"
                  checked={hideWarnings}
                  label="Show errors only"
                  onClick={handleHideWarnings}
                  onChange={() => {}}
                />
              </div>
              <TabContainer
                defaultActiveKey={tabKeys[1].tabKey}
                activeKey={selectedTab}
                onSelect={(tabKey: tabSelectionType) => {
                  setSelectedTab(tabKey)
                }}
              >
                <Nav variant="tabs">
                  {checkBasicStatus() ? (
                    <Nav.Item>
                      <Nav.Link className="text-decoration-none fw-bold px-2" eventKey={tabKeys[1].tabKey}>
                        {tabKeys[1].title}
                      </Nav.Link>
                    </Nav.Item>
                  ) : null}
                  {solhintEnabled ? (
                    <Nav.Item>
                      <Nav.Link className="text-decoration-none fw-bold px-2" eventKey={tabKeys[0].tabKey}>
                        {tabKeys[0].title}
                      </Nav.Link>
                    </Nav.Item>
                  ) : null}
                  {slitherEnabled && showSlither ? (
                    <Nav.Item>
                      <Nav.Link className="text-decoration-none fw-bold px-2" eventKey={tabKeys[2].tabKey}>
                        {tabKeys[2].title}
                      </Nav.Link>
                    </Nav.Item>
                  ) : null}
                </Nav>

                <Tab.Content>
                  <Tab.Pane eventKey={tabKeys[1].tabKey}>{basicEnabled ? tabKeys[1].child : null}</Tab.Pane>
                  <Tab.Pane eventKey={tabKeys[0].tabKey}>{solhintEnabled ? tabKeys[0].child : null}</Tab.Pane>
                  <Tab.Pane eventKey={tabKeys[2].tabKey}>{slitherEnabled && showSlither ? tabKeys[2].child : null}</Tab.Pane>
                </Tab.Content>
              </TabContainer>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default RemixUiStaticAnalyser
