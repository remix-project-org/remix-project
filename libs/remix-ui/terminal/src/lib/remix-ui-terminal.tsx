/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState, useEffect, useReducer, useRef, SyntheticEvent, MouseEvent, useContext } from 'react' // eslint-disable-line
import { FormattedMessage, useIntl } from 'react-intl'
import {
  registerCommandAction,
  registerLogScriptRunnerAction,
  registerInfoScriptRunnerAction,
  registerErrorScriptRunnerAction,
  registerWarnScriptRunnerAction,
  listenOnNetworkAction,
  initListeningOnNetwork,
} from './actions/terminalAction'
import { isBigInt } from 'web3-validator'
import { initialState, registerCommandReducer, addCommandHistoryReducer, registerScriptRunnerReducer } from './reducers/terminalReducer'
import { getKeyOf, getValueOf, Objectfilter, matched } from './utils/utils'
import { allCommands, allPrograms } from './commands' // eslint-disable-line
import TerminalWelcomeMessage from './terminalWelcome' // eslint-disable-line
import { Toaster } from '@remix-ui/toaster' // eslint-disable-line
import { ModalDialog } from '@remix-ui/modal-dialog' // eslint-disable-line
import { CustomTooltip } from '@remix-ui/helper'

import './remix-ui-terminal.css'
import vm from 'vm'
import javascriptserialize from 'javascript-serialize'
import jsbeautify from 'js-beautify'
import RenderUnKnownTransactions from './components/RenderUnknownTransactions' // eslint-disable-line
import RenderCall from './components/RenderCall' // eslint-disable-line
import RenderKnownTransactions from './components/RenderKnownTransactions' // eslint-disable-line
import parse from 'html-react-parser'
import { EMPTY_BLOCK, KNOWN_TRANSACTION, RemixUiTerminalProps, SET_ISVM, SET_OPEN, UNKNOWN_TRANSACTION } from './types/terminalTypes'
import { wrapScript } from './utils/wrapScript'
import { TerminalContext } from './context'

/* eslint-disable-next-line */
export interface ClipboardEvent<T = Element> extends SyntheticEvent<T, any> {
  clipboardData: DataTransfer
}

export const RemixUiTerminal = (props: RemixUiTerminalProps) => {
  const { call, _deps, on, config, event, version } = props.plugin
  const [_cmdIndex, setCmdIndex] = useState(-1)
  const [_cmdTemp, setCmdTemp] = useState('')
  const [isOpen, setIsOpen] = useState<boolean>(true)
  const { terminalState, dispatch } = useContext(TerminalContext)
  const [cmdHistory, cmdHistoryDispatch] = useReducer(addCommandHistoryReducer, initialState)
  const [, scriptRunnerDispatch] = useReducer(registerScriptRunnerReducer, initialState)
  const [toaster, setToaster] = useState(false)
  const [toastProvider, setToastProvider] = useState({
    show: false,
    fileName: '',
  })
  const [modalState, setModalState] = useState({
    message: '',
    title: '',
    okLabel: '',
    cancelLabel: '',
    hide: true,
    cancelFn: () => {},
    handleHide: () => {},
  })

  const [isVM, setIsVM] = useState(false)
  const [paste, setPaste] = useState(false)
  const [storage, setStorage] = useState<any>(null)
  const [autoCompletState, setAutoCompleteState] = useState({
    activeSuggestion: 0,
    data: {
      _options: [],
    },
    _startingElement: 0,
    autoCompleteSelectedItem: {},
    _elementToShow: 4,
    _selectedElement: 0,
    filteredCommands: [],
    filteredPrograms: [],
    showSuggestions: false,
    text: '',
    userInput: '',
    extraCommands: [],
    commandHistoryIndex: 0,
  })

  const [showTableHash, setShowTableHash] = useState([])

  // terminal inputRef
  const inputEl = useRef(null)
  const messagesEndRef = useRef(null)
  const typeWriterIndexes = useRef([])

  // terminal draggable
  const panelRef = useRef(null)
  const terminalMenu = useRef(null)

  const intl = useIntl()

  const scrollToBottom = () => {
    messagesEndRef.current && messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    props.plugin.on('network', 'providerChanged', (provider) => {
      dispatch({ type: SET_ISVM, payload: provider.startsWith('vm-') })
    })

    props.onReady({
      logHtml: (html) => {
        scriptRunnerDispatch({
          type: 'html',
          payload: {
            message: [html ? (html.innerText ? html.innerText : html) : null],
          },
        })
      },

      log: (message) => {
        if (typeof message === 'string') {
          message = {
            value: message,
            type: 'log',
          }
        }
        scriptRunnerDispatch({
          type: message.type ? message.type : 'log',
          payload: { message: [message.value]},
        })
      },
    })
  }, [])

  // events
  useEffect(() => {
    initListeningOnNetwork(props.plugin, scriptRunnerDispatch)
    registerLogScriptRunnerAction(on, 'log', terminalState.commands, scriptRunnerDispatch)
    registerInfoScriptRunnerAction(on, 'info', terminalState.commands, scriptRunnerDispatch)
    registerWarnScriptRunnerAction(on, 'warn', terminalState.commands, scriptRunnerDispatch)
    registerErrorScriptRunnerAction(on, 'error', terminalState.commands, scriptRunnerDispatch)
    registerCommandAction('html', _blocksRenderer('html'), { activate: true }, dispatch)
    registerCommandAction('log', _blocksRenderer('log'), { activate: true }, dispatch)
    registerCommandAction('info', _blocksRenderer('info'), { activate: true }, dispatch)
    registerCommandAction('warn', _blocksRenderer('warn'), { activate: true }, dispatch)
    registerCommandAction('error', _blocksRenderer('error'), { activate: true }, dispatch)

    registerCommandAction(
      'script',
      function execute(args, scopedCommands) {
        const script = String(args[0])
        _shell(script, scopedCommands, function (error, output) {
          if (error) scriptRunnerDispatch({ type: 'error', payload: { message: error } })
          if (output) scriptRunnerDispatch({ type: 'script', payload: { message: '5' } })
        })
      },
      { activate: true },
      dispatch
    )
  }, [autoCompletState.text])

  useEffect(() => {
    scrollToBottom()
  }, [terminalState.journalBlocks.length, toaster])

  function execute(file, cb) {
    function _execute(content, cb) {
      if (!content) {
        setToaster(true)
        if (cb) cb()
        return
      }
      terminalState.commands.script(content)
    }

    if (typeof file === 'undefined') {
      const content = _deps.editor.currentContent()
      _execute(content, cb)
      return
    }

    const provider = _deps.fileManager.fileProviderOf(file)
    console.log({ provider })

    if (!provider) {
      // toolTip(`provider for path ${file} not found`)
      setToastProvider({ show: true, fileName: file })
      if (cb) cb()
      return
    }
    provider.get(file, (error, content) => {
      console.log({ content })
      if (error) {
        // toolTip(error)
        // TODO: pop up
        if (cb) cb()
        return
      }

      _execute(content, cb)
    })
  }

  function loadgist(id, cb) {
    props.plugin.call('gistHandler', 'load', id)
    if (cb) cb()
  }

  const _shell = async (script, scopedCommands, done) => {
    // default shell
    if (script.indexOf('remix:') === 0) {
      return done(null, intl.formatMessage({ id: 'terminal.text1' }))
    }
    if (script.indexOf('remix.') === 0) {
      // we keep the old feature. This will basically only be called when the command is querying the "remix" object.
      // for all the other case, we use the Code Executor plugin
      const context = {
        remix: {
          exeCurrent: (script: any) => {
            return execute(undefined, script)
          },
          loadgist: (id: any) => {
            return loadgist(id, () => {})
          },
          execute: (fileName, callback) => {
            return execute(fileName, callback)
          },
        },
      }
      try {
        const cmds = vm.createContext(context)
        const result = vm.runInContext(script, cmds) // eslint-disable-line
        console.log({ result })
        return done(null, result)
      } catch (error) {
        return done(error.message)
      }
    }
    try {
      if (script.trim().startsWith('git')) {
        // await this.call('git', 'execute', script) code might be used in the future
      } else {
        await call('scriptRunnerBridge', 'execute', script)
      }
      done()
    } catch (error) {
      done(error.message || error)
    }
  }

  const focusinput = () => {
    inputEl.current.focus()
  }

  const handleKeyDown = (event) => {
    const suggestionCount = autoCompletState.activeSuggestion
    if (autoCompletState.userInput !== '' && (event.which === 27 || event.which === 8 || event.which === 46)) {
      // backspace or any key that should remove the autocompletion
      setAutoCompleteState((prevState) => ({
        ...prevState,
        showSuggestions: false,
      }))
    }
    if (autoCompletState.showSuggestions && (event.which === 13 || event.which === 9)) {
      if (autoCompletState.userInput.length === 1) {
        setAutoCompleteState((prevState) => ({
          ...prevState,
          activeSuggestion: 0,
          showSuggestions: false,
          userInput: Object.keys(autoCompletState.data._options[0]).toString(),
        }))
      } else {
        if (autoCompletState.showSuggestions && (event.which === 13 || event.which === 9)) {
          setAutoCompleteState((prevState) => ({
            ...prevState,
            activeSuggestion: 0,
            showSuggestions: false,
            userInput: autoCompletState.data._options[autoCompletState.activeSuggestion]
              ? Object.keys(autoCompletState.data._options[autoCompletState.activeSuggestion]).toString()
              : inputEl.current.value,
          }))
        } else {
          setAutoCompleteState((prevState) => ({
            ...prevState,
            activeSuggestion: 0,
            showSuggestions: false,
            userInput: autoCompletState.data._options.length === 1 ? Object.keys(autoCompletState.data._options[0]).toString() : inputEl.current.value,
          }))
        }
      }
    }
    if (event.which === 13 && !autoCompletState.showSuggestions) {
      if (event.ctrlKey) {
        // <ctrl+enter>
        // on enter, append the value in the cli input to the journal
        inputEl.current.focus()
      } else {
        // <enter>
        event.preventDefault()
        setCmdIndex(-1)
        setCmdTemp('')
        const script = autoCompletState.userInput.trim() // inputEl.current.innerText.trim()
        if (script.length) {
          cmdHistoryDispatch({ type: 'cmdHistory', payload: { script } })
          terminalState.commands.script(wrapScript(script))
        }
        setAutoCompleteState((prevState) => ({ ...prevState, userInput: '' }))
        inputEl.current.innerText = ''
        inputEl.current.focus()
        setAutoCompleteState((prevState) => ({
          ...prevState,
          showSuggestions: false,
        }))
      }
    } else if (terminalState._commandHistory.length && event.which === 38 && !autoCompletState.showSuggestions && autoCompletState.userInput === '') {
      event.preventDefault()
      setAutoCompleteState((prevState) => ({
        ...prevState,
        userInput: terminalState._commandHistory[0],
      }))
    } else if (event.which === 38 && autoCompletState.showSuggestions) {
      event.preventDefault()
      if (autoCompletState.activeSuggestion === 0) {
        return
      }
      setAutoCompleteState((prevState) => ({
        ...prevState,
        activeSuggestion: suggestionCount - 1,
        userInput: Object.keys(autoCompletState.data._options[autoCompletState.activeSuggestion]).toString(),
      }))
    } else if (event.which === 38 && !autoCompletState.showSuggestions) {
      // <arrowUp>
      if (cmdHistory.length - 1 > _cmdIndex) {
        setCmdIndex((prevState) => prevState++)
      }
      inputEl.current.innerText = cmdHistory[_cmdIndex]
      inputEl.current.focus()
    } else if (event.which === 40 && autoCompletState.showSuggestions) {
      event.preventDefault()
      if (autoCompletState.activeSuggestion + 1 === autoCompletState.data._options.length) {
        return
      }
      setAutoCompleteState((prevState) => ({
        ...prevState,
        activeSuggestion: suggestionCount + 1,
        userInput: Object.keys(autoCompletState.data._options[autoCompletState.activeSuggestion + 1]).toString(),
      }))
    } else if (event.which === 40 && !autoCompletState.showSuggestions) {
      if (_cmdIndex > -1) {
        setCmdIndex((prevState) => prevState--)
      }
      inputEl.current.innerText = _cmdIndex >= 0 ? cmdHistory[_cmdIndex] : _cmdTemp
      inputEl.current.focus()
    } else {
      setCmdTemp(inputEl.current.innerText)
    }
  }

  /* block contents that gets rendered from scriptRunner */

  const _blocksRenderer = (mode) => {
    if (mode === 'html') {
      return function logger(args) {
        if (args.length) {
          return args[0]
        }
      }
    }
    mode = {
      log: 'text-log',
      info: 'text-log',
      warn: 'text-warning',
      error: 'text-danger',
    }[mode] // defaults

    if (mode) {
      const filterUndefined = (el) => el !== undefined && el !== null
      return function logger(args) {
        const types = args.filter(filterUndefined).map((type) => type)
        const values = javascriptserialize.apply(null, args.filter(filterUndefined)).map(function (val, idx) {
          // eslint-disable-line
          if (typeof args[idx] === 'string') {
            const el = document.createElement('div')
            el.innerHTML = args[idx].replace(/(\r\n|\n|\r)/gm, '<br>')
            val = el.children.length === 0 ? el.firstChild : el
          }
          if (types[idx] === 'element') val = jsbeautify.html(val)
          return val
        })
        if (values.length) {
          return values
        }
      }
    } else {
      throw new Error('mode is not supported')
    }
  }

  useEffect(() => {
    if (terminalState.clearConsole){
      typeWriterIndexes.current = []
      inputEl.current.focus()
    }
  },[terminalState.clearConsole])

  /* end of block content that gets rendered from script Runner */

  /* start of autoComplete */

  const onChange = (event: any) => {
    event.preventDefault()
    const inputString = event.target.value
    if (matched(allPrograms, inputString) || inputString.includes('.')) {
      if (paste) {
        setPaste(false)
        setAutoCompleteState((prevState) => ({
          ...prevState,
          showSuggestions: false,
          userInput: inputString,
        }))
      } else {
        setAutoCompleteState((prevState) => ({
          ...prevState,
          showSuggestions: true,
          userInput: inputString,
        }))
      }
      const textList = inputString.split('.')
      if (textList.length === 1) {
        setAutoCompleteState((prevState) => ({
          ...prevState,
          data: { _options: []},
        }))
        const result = Objectfilter(allPrograms, autoCompletState.userInput)
        setAutoCompleteState((prevState) => ({
          ...prevState,
          data: { _options: result },
        }))
      } else {
        setAutoCompleteState((prevState) => ({
          ...prevState,
          data: { _options: []},
        }))
        const result = Objectfilter(allCommands, autoCompletState.userInput)
        setAutoCompleteState((prevState) => ({
          ...prevState,
          data: { _options: result },
        }))
      }
    } else {
      setAutoCompleteState((prevState) => ({
        ...prevState,
        showSuggestions: false,
        userInput: inputString,
      }))
    }
  }

  const handleClickSelect = (item: string) => {
    const result: string = (getKeyOf(item) as string) || (getValueOf(item) as string)
    setAutoCompleteState((prevState) => ({
      ...prevState,
      showSuggestions: false,
      userInput: result,
    }))
    inputEl.current.focus()
  }

  const handleSelect = (event) => {
    const suggestionCount = autoCompletState.activeSuggestion
    if (event.keyCode === 38) {
      if (autoCompletState.activeSuggestion === 0) {
        return
      }
      setAutoCompleteState((prevState) => ({
        ...prevState,
        activeSuggestion: suggestionCount - 1,
      }))
    } else if (event.keyCode === 40) {
      if (autoCompletState.activeSuggestion - 1 === autoCompletState.data._options.length) {
        return
      }
      setAutoCompleteState((prevState) => ({
        ...prevState,
        activeSuggestion: suggestionCount + 1,
      }))
    }
  }

  const modal = (title: string, message: string, okLabel: string, hide: boolean, okFn: () => void, cancelLabel?: string, cancelFn?: () => void) => {
    setModalState((prevState) => ({
      ...prevState,
      title,
      message,
      okLabel,
      okFn,
      cancelLabel,
      cancelFn,
      hide,
    }))
  }

  const handleHideModal = () => {
    setModalState((prevState) => ({ ...prevState, hide: true }))
  }

  const txDetails = (event, tx) => {
    if (showTableHash.includes(tx.hash)) {
      const index = showTableHash.indexOf(tx.hash)
      if (index > -1) {
        setShowTableHash((prevState) => prevState.filter((x) => x !== tx.hash))
      }
    } else {
      setShowTableHash((prevState) => [...prevState, tx.hash])
    }
    scrollToBottom()
  }

  const handleAutoComplete = () => (
    <div
      className="remix_ui_terminal_popup bg-light ms-4 p-2 position-absolute text-start "
      style={{
        display:
          autoCompletState.showSuggestions && autoCompletState.userInput !== '' && autoCompletState.userInput.length > 0 && autoCompletState.data._options.length > 0
            ? 'block'
            : 'none',
      }}
    >
      <div>
        {autoCompletState.data._options.map((item, index) => {
          return (
            <div
              key={index}
              data-id="autoCompletePopUpAutoCompleteItem"
              className={`remix_ui_terminal_autoCompleteItem item ${autoCompletState.data._options[autoCompletState.activeSuggestion] === item ? 'border border-primary ' : ''}`}
              onKeyDown={handleSelect}
              onClick={() => handleClickSelect(item)}
            >
              <div>{getKeyOf(item)}</div>
              <div>
                <>{getValueOf(item)}</>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
  /* end of autoComplete */

  const handlePaste = () => {
    setPaste(true)
    setAutoCompleteState((prevState) => ({
      ...prevState,
      activeSuggestion: 0,
      showSuggestions: false,
    }))
  }

  useEffect(() => {
    ;(async () => {
      const storage = await props.plugin.call('storage', 'formatString', await props.plugin.call('storage', 'getStorage'))
      setStorage(storage)
    })()

    props.plugin.on('layout', 'change', (panels) => {
      setIsOpen(!panels.terminal.minimized)
      dispatch({ type: SET_OPEN, payload: !panels.terminal.minimized })
    })

    return () => {
      props.plugin.off('layout', 'change')
    }
  }, [])

  const classNameBlock = 'remix_ui_terminal_block px-4 py-1 text-break'

  const replacer = (key, value) => {
    if (isBigInt(value)) value = value.toString()
    if (typeof value === 'function') value = value.toString()
    return value
  }

  const includeSearch = (x, searchInput) => {
    try {
      const value = JSON.stringify(x, replacer)
      return value.indexOf(searchInput) !== -1 || value.indexOf(searchInput.toLowerCase()) !== -1
    } catch (e) {
      console.error(e)
      return true
    }
  }

  return (
    ( props.visible &&
      <div style={{ flexGrow: 1 }} className="remix_ui_terminal_panel h-100 mb-2" ref={panelRef}>
        <div tabIndex={-1} className="remix_ui_terminal_container d-flex h-100 m-0 flex-column" data-id="terminalContainer">
          {handleAutoComplete()}
          <div className="position-relative d-flex flex-column-reverse h-100">
            <div id="journal" className="remix_ui_terminal_journal d-flex flex-column pt-3 pb-4 px-2 mx-2 me-0" data-id="terminalJournal">
              {!terminalState.clearConsole && <TerminalWelcomeMessage storage={storage} packageJson={version} />}
              {terminalState.journalBlocks &&
              terminalState.journalBlocks.map((x, index) => {
                if (x.name === EMPTY_BLOCK) {
                  return (
                    <div className={classNameBlock} data-id="block" key={index}>
                      <span className="remix_ui_terminal_tx">
                        <div className="remix_ui_terminal_txItem">
                          [<span className="remix_ui_terminal_txItemTitle">block:{x.message} - </span> 0 {'transactions'} ]
                        </div>
                      </span>
                    </div>
                  )
                } else if (x.name === UNKNOWN_TRANSACTION) {
                  return x.message
                    .filter((x) => includeSearch(x, terminalState.searchInput))
                    .map((trans) => {
                      return (
                        <div className={classNameBlock} data-id={`block_tx${trans.tx.hash}`} key={index}>
                          {' '}
                          {
                            <RenderUnKnownTransactions
                              tx={trans.tx}
                              receipt={trans.receipt}
                              index={index}
                              plugin={props.plugin}
                              showTableHash={showTableHash}
                              txDetails={txDetails}
                              modal={modal}
                              provider={x.provider}
                            />
                          }
                        </div>
                      )
                    })
                } else if (x.name === KNOWN_TRANSACTION) {
                  return x.message
                    .filter((x) => includeSearch(x, terminalState.searchInput))
                    .map((trans) => {
                      return (
                        <div className={classNameBlock} data-id={`block_tx${trans.tx.hash}`} key={index}>
                          {trans.tx.isCall ? (
                            <RenderCall
                              tx={trans.tx}
                              resolvedData={trans.resolvedData}
                              logs={trans.logs}
                              index={index}
                              plugin={props.plugin}
                              showTableHash={showTableHash}
                              txDetails={txDetails}
                              modal={modal}
                            />
                          ) : (
                            <RenderKnownTransactions
                              tx={trans.tx}
                              receipt={trans.receipt}
                              resolvedData={trans.resolvedData}
                              logs={trans.logs}
                              index={index}
                              plugin={props.plugin}
                              showTableHash={showTableHash}
                              txDetails={txDetails}
                              modal={modal}
                              provider={x.provider}
                            />
                          )}
                        </div>
                      )
                    })
                } else if (Array.isArray(x.message)) {
                  if (terminalState.searchInput !== '') return []
                  return x.message.map((msg, i) => {
                    // strictly check condition on 0, false, except undefined, NaN.
                    // if you type `undefined`, terminal automatically throws error, it's error message: "undefined" is not valid JSON
                    // if you type `NaN`, terminal would give `null`
                    if (msg === false || msg === 0) msg = msg.toString()
                    else if (!msg) msg = 'null'
                    if (React.isValidElement(msg)) {
                      return (
                        <div className="px-4 block" data-id="block" key={i}>
                          <span className={x.style}>{msg}</span>
                        </div>
                      )
                    } else if (typeof msg === 'object') {
                      if (msg.value && isHtml(msg.value)) {
                        return (
                          <div className={classNameBlock} data-id="block" key={i}>
                            <span className={x.style}>{parse(msg.value)} </span>
                          </div>
                        )
                      }
                      let stringified
                      try {
                        stringified = JSON.stringify(msg)
                      } catch (e) {
                        console.error(e)
                        stringified = '< value not displayable >'
                      }
                      return (
                        <div className={classNameBlock} data-id="block" key={i}>
                          <span className={x.style}>{stringified} </span>
                        </div>
                      )
                    } else {
                      // typeWriterIndexes: we don't want to rerender using typewriter when the react component updates
                      if (x.typewriter && !typeWriterIndexes.current.includes(index)) {
                        typeWriterIndexes.current.push(index)
                        return (
                          <div className={classNameBlock} data-id="block" key={index}>
                            <span ref={(element) => {
                              typewrite(element, msg ? msg.toString() : null, () => scrollToBottom()
                              )
                            }} className={x.style}>
                            </span>
                          </div>
                        )
                      } else {
                        return (
                          <div className={classNameBlock} data-id="block" key={i}><span className={x.style}>{msg ? msg.toString() : null}</span></div>
                        )
                      }
                    }
                  })
                } else {
                  // typeWriterIndexes: we don't want to rerender using typewriter when the react component updates
                  if (x.typewriter && !typeWriterIndexes.current.includes(index)) {
                    typeWriterIndexes.current.push(index)
                    return (
                      <div className={classNameBlock} data-id="block" key={index}> <span ref={(element) => {
                        typewrite(element, x.message, () => scrollToBottom())
                      }} className={x.style}></span></div>
                    )
                  } else {
                    if (typeof x.message !== 'function') {
                      return (
                        <div className={classNameBlock} data-id="block" key={index}> <span className={x.style}> {x.message}</span></div>
                      )
                    }
                  }
                }
              })}
              <div ref={messagesEndRef} />
            </div>
            {isOpen && (
              <div id="terminalCli" data-id="terminalCli" className="remix_ui_terminal_cli position-absolute w-100" onClick={focusinput}>
                <span className="remix_ui_terminal_prompt blink mx-1 fw-bold text-dark">{'>'}</span>
                <input
                  className="remix_ui_terminal_input ms-1 text-dark text-break border-0"
                  ref={inputEl}
                  spellCheck="false"
                  contentEditable="true"
                  id="terminalCliInput"
                  data-id="terminalCliInput"
                  onChange={(event) => onChange(event)}
                  onKeyDown={(event) => handleKeyDown(event)}
                  value={autoCompletState.userInput}
                  onPaste={handlePaste}
                ></input>
              </div>
            )}
          </div>
        </div>
        <ModalDialog
          id="terminal"
          title={modalState.title}
          message={modalState.message}
          hide={modalState.hide}
          okLabel={modalState.okLabel}
          cancelLabel={modalState.cancelLabel}
          cancelFn={modalState.cancelFn}
          handleHide={handleHideModal}
        />
        {toaster && <Toaster message={intl.formatMessage({ id: 'terminal.toasterMsg1' })} />}
        {toastProvider.show && <Toaster message={intl.formatMessage({ id: 'terminal.toasterMsg2' }, { fileName: toastProvider.fileName })} />}
      </div>
    ))
}

const typewrite = (elementsRef, message, callback) => {
  (() => {
    let count = 0
    const id = setInterval(() => {
      if (!elementsRef) return
      count++
      elementsRef.innerText = message.substr(0, count)
      // scroll when new line ` <br>
      if (elementsRef.lastChild.tagName === `BR`) callback()
      if (message.length === count) {
        clearInterval(id)
        callback()
      }
    }, 5)
  })()
}

function isHtml (value) {
  if (!value.indexOf) return false
  return value.indexOf('<div') !== -1 || value.indexOf('<span') !== -1 || value.indexOf('<p') !== -1 || value.indexOf('<label') !== -1 || value.indexOf('<b') !== -1
}

export default RemixUiTerminal
