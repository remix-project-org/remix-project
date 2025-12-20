import React, { useState, useRef, useEffect, useReducer, useContext } from 'react' // eslint-disable-line
import { FormattedMessage, useIntl } from 'react-intl'
import { diffLines } from 'diff'
import { isArray } from 'lodash'
import Editor, { DiffEditor, loader, Monaco } from '@monaco-editor/react'
import { AppContext, AppModal } from '@remix-ui/app'
import { MatomoEvent, EditorEvent, AIEvent } from '@remix-api'
//@ts-ignore
import { TrackingContext } from '@remix-ide/tracking'
import { ConsoleLogs, EventManager, QueryParams } from '@remix-project/remix-lib'
import { reducerActions, reducerListener, initialState } from './actions/editor'
import { solidityTokensProvider, solidityLanguageConfig } from './syntaxes/solidity'
import { cairoTokensProvider, cairoLanguageConfig } from './syntaxes/cairo'
import { zokratesTokensProvider, zokratesLanguageConfig } from './syntaxes/zokrates'
import { moveTokenProvider, moveLanguageConfig } from './syntaxes/move'
import { tomlLanguageConfig, tomlTokenProvider } from './syntaxes/toml'
import { monacoTypes } from '@remix-ui/editor'
import { loadTypes } from './web-types'
import { extractFunctionComments, retrieveNodesAtPosition } from './helpers/retrieveNodesAtPosition'
import { showCustomDiff, extractLineNumberRangesWithText, ChangeType, ChangeTypeMap } from './helpers/showCustomDiff'
import { RemixHoverProvider } from './providers/hoverProvider'
import { RemixReferenceProvider } from './providers/referenceProvider'
import { RemixCompletionProvider } from './providers/completionProvider'
import { RemixSolidityDocumentationProvider } from './providers/documentationProvider'
import { RemixHighLightProvider } from './providers/highlightProvider'
import { RemixDefinitionProvider } from './providers/definitionProvider'
import { RemixCodeActionProvider } from './providers/codeActionProvider'
import './remix-ui-editor.css'
import { circomLanguageConfig, circomTokensProvider } from './syntaxes/circom'
import { noirLanguageConfig, noirTokensProvider } from './syntaxes/noir'
import { sqlLanguageConfig, sqlTokensProvider } from './syntaxes/sql'
import type { IPosition, IRange } from 'monaco-editor'
import { GenerationParams } from '@remix/remix-ai-core';
import { RemixInLineCompletionProvider } from './providers/inlineCompletionProvider'
import { RemixTSCompletionProvider } from './providers/tsCompletionProvider'
const _paq = (window._paq = window._paq || []) // eslint-disable-line

// Key for localStorage
const HIDE_PASTE_WARNING_KEY = 'remixide.hide_paste_warning';

enum MarkerSeverity {
  Hint = 1,
  Info = 2,
  Warning = 4,
  Error = 8,
}

type sourceAnnotation = {
  row: number
  column: number
  text: string
  type: 'error' | 'warning' | 'info'
  hide: boolean
  from: string // plugin name
}

type sourceMarker = {
  position: {
    start: {
      line: number
      column: number
    }
    end: {
      line: number
      column: number
    }
  }
  from: string // plugin name
  hide: boolean
}

export type lineText = {
  position: {
    start: {
      line: number
      column: number
    }
    end: {
      line: number
      column: number
    }
  }
  from?: string // plugin name
  content: string
  className: string
  afterContentClassName: string
  hide: boolean
  hoverMessage: monacoTypes.IMarkdownString | monacoTypes.IMarkdownString[]
}

type errorMarker = {
  message: string
  severity: monacoTypes.MarkerSeverity | 'warning' | 'info' | 'error' | 'hint'
  position: {
    start: {
      line: number
      column: number
    }
    end: {
      line: number
      column: number
    }
  }
  file: string
}

loader.config({ paths: { vs: 'assets/js/monaco-editor/min/vs' } })

const queryParams = new QueryParams()
// @ts-ignore
const queryLocale = queryParams.get().lang
const locales = {
  zh: 'zh-cn',
  en: '',
  fr: 'fr',
  it: 'it',
  es: 'es'
}
loader.config({ "vs/nls": { availableLanguages: { "*": locales[queryLocale] || '' } } })

export type DecorationsReturn = {
  currentDecorations: Array<string>
  registeredDecorations?: Array<any>
}

export type PluginType = {
  on: (plugin: string, event: string, listener: any) => void
  call: (plugin: string, method: string, arg1?: any, arg2?: any, arg3?: any, arg4?: any) => any
}

export type EditorAPIType = {
  findMatches: (uri: string, value: string) => any
  getFontSize: () => number
  getValue: (uri: string) => string
  getCursorPosition: (offset?: boolean) => number | monacoTypes.IPosition
  getHoverPosition: (position: monacoTypes.IPosition) => number
  addDecoration: (marker: sourceMarker, filePath: string, typeOfDecoration: string) => DecorationsReturn
  clearDecorationsByPlugin: (filePath: string, plugin: string, typeOfDecoration: string, registeredDecorations: any, currentDecorations: any) => DecorationsReturn
  keepDecorationsFor: (filePath: string, plugin: string, typeOfDecoration: string, registeredDecorations: any, currentDecorations: any) => DecorationsReturn
  addErrorMarker: (errors: errorMarker[], from: string) => void
  clearErrorMarkers: (sources: string[] | { [fileName: string]: any }, from: string) => void
  getPositionAt: (offset: number) => monacoTypes.IPosition
  showCustomDiff: (file: string, content: string) => Promise<void>
}

/* eslint-disable-next-line */
export interface EditorUIProps {
  contextualListener: any
  activated: boolean
  themeType: string
  currentFile: string
  currentDiffFile: string
  isDiff: boolean
  events: {
    onBreakPointAdded: (file: string, line: number) => void
    onBreakPointCleared: (file: string, line: number) => void
    onDidChangeContent: (file: string) => void
    onEditorMounted: () => void
  }
  plugin: PluginType
  editorAPI: EditorAPIType
  setMonaco: (monaco: Monaco) => void
}
const contextMenuEvent = new EventManager()
export const EditorUI = (props: EditorUIProps) => {
  const intl = useIntl()
  const appContext = useContext(AppContext)
  //@ts-ignore
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = EditorEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }
  const changedTypeMap = useRef<ChangeTypeMap>({})
  const pendingCustomDiff = useRef({})
  const [, setCurrentBreakpoints] = useState({})
  const [isSplit, setIsSplit] = useState(true)
  const [currentDiffFile, setCurrentDiffFile] = useState(props.currentDiffFile || '')
  const [decoratorListCollection, setDecoratorListCollection] = useState<Record<string, monacoTypes.editor.IEditorDecorationsCollection>>({})
  const [disposedWidgets, setDisposedWidgets] = useState<Record<string, Record<string, monacoTypes.IRange[]>>>({})
  const defaultEditorValue = `
  \t\t\t\t\t\t\t ____    _____   __  __   ___  __  __   ___   ____    _____
  \t\t\t\t\t\t\t|  _ \\  | ____| |  \\/  | |_ _| \\ \\/ /  |_ _| |  _ \\  | ____|
  \t\t\t\t\t\t\t| |_) | |  _|   | |\\/| |  | |   \\  /    | |  | | | | |  _|
  \t\t\t\t\t\t\t|  _ <  | |___  | |  | |  | |   /  \\    | |  | |_| | | |___
  \t\t\t\t\t\t\t|_| \\_\\ |_____| |_|  |_| |___| /_/\\_\\  |___| |____/  |_____|\n\n
  \t\t\t\t\t\t\t${intl.formatMessage({ id: 'editor.keyboardShortcuts' })}:\n
  \t\t\t\t\t\t\t\tCTRL + S: ${intl.formatMessage({ id: 'editor.keyboardShortcuts.text1' })}\n
  \t\t\t\t\t\t\t\tCTRL + Shift + F : ${intl.formatMessage({ id: 'editor.keyboardShortcuts.text2' })}\n
  \t\t\t\t\t\t\t\tCTRL + Shift + A : ${intl.formatMessage({ id: 'editor.keyboardShortcuts.text3' })}\n
  \t\t\t\t\t\t\t\tCTRL + SHIFT + S: ${intl.formatMessage({ id: 'editor.keyboardShortcuts.text4' })}\n
  \t\t\t\t\t\t\t${intl.formatMessage({ id: 'editor.editorKeyboardShortcuts' })}:\n
  \t\t\t\t\t\t\t\tCTRL + Alt + F : ${intl.formatMessage({ id: 'editor.editorKeyboardShortcuts.text1' })}\n
  \t\t\t\t\t\t\t${intl.formatMessage({ id: 'editor.importantLinks' })}:\n
  \t\t\t\t\t\t\t\t${intl.formatMessage({ id: 'editor.importantLinks.text1' })}: https://remix.live/\n
  \t\t\t\t\t\t\t\t${intl.formatMessage({ id: 'editor.importantLinks.text2' })}: https://remix-ide.readthedocs.io/en/latest/\n
  \t\t\t\t\t\t\t\tGithub: https://github.com/ethereum/remix-project\n
  \t\t\t\t\t\t\t\tDiscord: https://discord.gg/qhpCQGWkmf\n
  \t\t\t\t\t\t\t\tMedium: https://medium.com/remix-ide\n
  \t\t\t\t\t\t\t\tX: https://x.com/ethereumremix\n
  `
  const pasteCodeRef = useRef(false)
  const editorRef = useRef(null)
  const monacoRef = useRef<Monaco>(null)
  const diffEditorRef = useRef<any>(null)

  const currentFunction = useRef('')
  const currentFileRef = useRef('')
  const currentUrlRef = useRef('')
  const currentDecoratorListCollectionRef = useRef({})
  const inlineCompletionProviderRef = useRef<RemixInLineCompletionProvider|null>(null)

  // const currentDecorations = useRef({ sourceAnnotationsPerFile: {}, markerPerFile: {} }) // decorations that are currently in use by the editor
  // const registeredDecorations = useRef({}) // registered decorations

  const [editorModelsState, dispatch] = useReducer(reducerActions, initialState)

  const formatColor = (name) => {
    let color = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    if (color.length === 4 && color.startsWith('#')) {
      color = color.concat(color.substr(1))
    }
    return color
  }

  const defineAndSetTheme = (monaco) => {
    const themeType = props.themeType === 'dark' ? 'vs-dark' : 'vs'
    const themeName = props.themeType === 'dark' ? 'remix-dark' : 'remix-light'
    const isDark = props.themeType === 'dark'

    // see https://microsoft.github.io/monaco-editor/playground.html#customizing-the-appearence-exposed-colors
    const lightColor = formatColor('--bs-light')
    const infoColor = formatColor('--bs-info')
    const darkColor = formatColor('--bs-dark')
    const secondaryColor = formatColor('--bs-body-bg')
    const primaryColor = formatColor('--bs-primary')
    const textColor = formatColor('--bs-body-color') || darkColor
    const textbackground = formatColor('--bs-body-bg') || lightColor
    const blueColor = formatColor('--bs-blue')
    const successColor = formatColor('--bs-success')
    const warningColor = formatColor('--bs-warning')
    const yellowColor = formatColor('--bs-yellow')
    const pinkColor = formatColor('--bs-pink')
    const locationColor = '#9e7e08'
    // const purpleColor = formatColor('--purple')
    const dangerColor = formatColor('--bs-danger')
    const greenColor = formatColor('--bs-green')
    const orangeColor = formatColor('--bs-orange')
    const grayColor = formatColor('--bs-gray')

    monaco.editor.defineTheme(themeName, {
      base: themeType,
      inherit: true, // can also be false to completely replace the builtin rules
      rules: [
        { background: darkColor.replace('#', '') },
        { foreground: textColor.replace('#', '') },

        // global variables
        { token: 'keyword.abi', foreground: blueColor },
        { token: 'keyword.block', foreground: blueColor },
        { token: 'keyword.bytes', foreground: blueColor },
        { token: 'keyword.msg', foreground: blueColor },
        { token: 'keyword.tx', foreground: blueColor },

        // global functions
        { token: 'keyword.assert', foreground: blueColor },
        { token: 'keyword.require', foreground: blueColor },
        { token: 'keyword.revert', foreground: blueColor },
        { token: 'keyword.blockhash', foreground: blueColor },
        { token: 'keyword.keccak256', foreground: blueColor },
        { token: 'keyword.sha256', foreground: blueColor },
        { token: 'keyword.ripemd160', foreground: blueColor },
        { token: 'keyword.ecrecover', foreground: blueColor },
        { token: 'keyword.addmod', foreground: blueColor },
        { token: 'keyword.mulmod', foreground: blueColor },
        { token: 'keyword.selfdestruct', foreground: blueColor },
        { token: 'keyword.type ', foreground: blueColor },
        { token: 'keyword.gasleft', foreground: blueColor },
        { token: 'function', foreground: blueColor, fontStyle: 'bold' },

        // specials
        { token: 'keyword.super', foreground: infoColor },
        { token: 'keyword.this', foreground: infoColor },
        { token: 'keyword.virtual', foreground: infoColor },

        // for state variables
        { token: 'keyword.constants', foreground: grayColor },
        { token: 'keyword.override', foreground: grayColor },
        { token: 'keyword.immutable', foreground: grayColor },

        // data location
        { token: 'keyword.memory', foreground: locationColor },
        { token: 'keyword.storage', foreground: locationColor },
        { token: 'keyword.calldata', foreground: locationColor },

        // for Events
        { token: 'keyword.indexed', foreground: yellowColor },
        { token: 'keyword.anonymous', foreground: yellowColor },

        // for functions
        { token: 'keyword.external', foreground: successColor },
        { token: 'keyword.internal', foreground: successColor },
        { token: 'keyword.private', foreground: successColor },
        { token: 'keyword.public', foreground: successColor },
        { token: 'keyword.view', foreground: successColor },
        { token: 'keyword.pure', foreground: successColor },
        { token: 'keyword.payable', foreground: successColor },
        { token: 'keyword.nonpayable', foreground: successColor },

        // Errors
        { token: 'keyword.Error', foreground: dangerColor },
        { token: 'keyword.Panic', foreground: dangerColor },

        // special functions
        { token: 'keyword.fallback', foreground: pinkColor },
        { token: 'keyword.receive', foreground: pinkColor },
        { token: 'keyword.constructor', foreground: pinkColor },

        // identifiers
        { token: 'keyword.identifier', foreground: warningColor },
        { token: 'keyword.for', foreground: warningColor },
        { token: 'keyword.break', foreground: warningColor },
        { token: 'keyword.continue', foreground: warningColor },
        { token: 'keyword.while', foreground: warningColor },
        { token: 'keyword.do', foreground: warningColor },
        { token: 'keyword.delete', foreground: warningColor },

        { token: 'keyword.if', foreground: yellowColor },
        { token: 'keyword.else', foreground: yellowColor },

        { token: 'keyword.throw', foreground: orangeColor },
        { token: 'keyword.catch', foreground: orangeColor },
        { token: 'keyword.try', foreground: orangeColor },

        // returns
        { token: 'keyword.returns', foreground: greenColor },
        { token: 'keyword.return', foreground: greenColor },
      ],
      colors: {
        // see https://code.visualstudio.com/api/references/theme-color for more settings
        'editor.background': lightColor,
        'editorSuggestWidget.background': lightColor,
        'editorSuggestWidget.selectedBackground': secondaryColor,
        'editorSuggestWidget.selectedForeground': textColor,
        'editorSuggestWidget.highlightForeground': primaryColor,
        'editorSuggestWidget.focusHighlightForeground': infoColor,
        'editor.lineHighlightBorder': textbackground,
        'editor.lineHighlightBackground': textbackground === darkColor ? lightColor : secondaryColor,
        'editorGutter.background': lightColor,
        //'editor.selectionHighlightBackground': secondaryColor,
        'minimap.background': lightColor,
        'menu.foreground': textColor,
        'menu.background': textbackground,
        'menu.selectionBackground': secondaryColor,
        'menu.selectionForeground': textColor,
        'menu.selectionBorder': secondaryColor,
      },
    })
    monacoRef.current.editor.setTheme(themeName)
  }

  useEffect(() => {
    if (!monacoRef.current) return
    defineAndSetTheme(monacoRef.current)
  }, [props.themeType]) // Only re-run when theme type changes

  // Listen for theme changes to redefine the theme when CSS is loaded
  useEffect(() => {
    if (!monacoRef.current) return

    const handleThemeChange = () => {
      // Small delay to ensure CSS variables are available after theme switch
      setTimeout(() => {
        defineAndSetTheme(monacoRef.current)
      }, 100)
    }

    props.plugin.on('theme', 'themeChanged', handleThemeChange)
  }, [monacoRef.current])

  useEffect(() => {
    props.plugin.on('fileManager', 'currentFileChanged', (file: string) => {
      if (file + '-ai' !== currentDiffFile) {
        removeAllWidgets()
      }
    })
  }, [])

  /**
   * add widget ranges to disposedWidgets when decoratorListCollection changes,
   * this is used to restore the widgets when the file is changed.
   */
  useEffect(() => {
    if (decoratorListCollection && currentFileRef.current && (props.currentFile === currentFileRef.current)) {
      const widgetsToDispose = {}
      Object.keys(decoratorListCollection).forEach((widgetId) => {
        const ranges = decoratorListCollection[widgetId].getRanges()
        const changeType = changedTypeMap.current[widgetId]
        widgetsToDispose[widgetId] = changeType === 'removed' ? [null, ranges[0]] : ranges
      })
      setDisposedWidgets({ ...disposedWidgets, [currentFileRef.current]: widgetsToDispose })
    }
    currentDecoratorListCollectionRef.current = decoratorListCollection
  }, [decoratorListCollection])

  /**
   * restore the widgets when the file is changed.
   * currentFileRef.current is the previous file, props.currentFile is the new file.
   */
  useEffect(() => {
    if (currentFileRef.current) {
      if (props.currentFile !== currentFileRef.current) {

        // add the widgets that are still pending to be applied
        const pendingDiff = pendingCustomDiff.current[props.currentFile]
        if (pendingDiff) {
          showCustomDiff(pendingDiff, props.currentFile, editorRef.current, monacoRef.current, addDecoratorCollection, addAcceptDeclineWidget, setDecoratorListCollection, acceptHandler, rejectHandler, acceptAllHandler, rejectAllHandler, setCurrentDiffFile, changedTypeMap.current)
          delete pendingCustomDiff.current[props.currentFile]
        }
        // restore the widgets if they exist to the new file and were already applied
        const restoredWidgets = disposedWidgets[props.currentFile]
        if (restoredWidgets) {
          Object.keys(restoredWidgets).forEach((widgetId) => {
            const ranges = restoredWidgets[widgetId]
            const decoratorList = addDecoratorCollection(widgetId, ranges)

            setTimeout(() => {
              const newEntryRange = decoratorList.getRange(0)
              addAcceptDeclineWidget(widgetId, editorRef.current, { column: 0, lineNumber: newEntryRange.startLineNumber + 1 }, () => acceptHandler(decoratorList, widgetId), () => rejectHandler(decoratorList, widgetId), acceptAllHandler, rejectAllHandler)
            }, 150)
            setDecoratorListCollection(decoratorListCollection => ({ ...decoratorListCollection, [widgetId]: decoratorList }))
          })
          // set the current diff file, this is needed to avoid removeAllWidgets called more than once, because the currentFileChanged event is broken and fired more than once.
          setCurrentDiffFile(props.currentFile + '-ai')
        }
        // remove widgets from the previous file, this is needed to avoid widgets from the previous file to be shown when the new file is loaded.
        if (disposedWidgets[currentFileRef.current]) {
          Object.keys(disposedWidgets[currentFileRef.current]).forEach((widgetId) => {
            editorRef.current.removeContentWidget({
              getId: () => widgetId
            })
          })
        }
      }
    }
  }, [props.currentFile])

  useEffect(() => {
    if (!(editorRef.current || diffEditorRef.current ) || !props.currentFile) return
    currentFileRef.current = props.currentFile
    props.plugin.call('fileManager', 'getUrlFromPath', currentFileRef.current).then((url) => (currentUrlRef.current = url.file))

    const file = editorModelsState[props.currentFile]

    props.isDiff && diffEditorRef && diffEditorRef.current && diffEditorRef.current.setModel({
      original: editorModelsState[props.currentDiffFile].model,
      modified: file.model
    })

    props.isDiff && diffEditorRef.current.getModifiedEditor().updateOptions({ readOnly: editorModelsState[props.currentFile].readOnly })

    editorRef.current.setModel(file.model)
    editorRef.current.updateOptions({
      readOnly: editorModelsState[props.currentFile].readOnly,
    })
    if (file.language === 'sol') {
      monacoRef.current.editor.setModelLanguage(file.model, 'remix-solidity')
    } else if (file.language === 'cairo') {
      monacoRef.current.editor.setModelLanguage(file.model, 'remix-cairo')
    } else if (file.language === 'zokrates') {
      monacoRef.current.editor.setModelLanguage(file.model, 'remix-zokrates')
    } else if (file.language === 'move') {
      monacoRef.current.editor.setModelLanguage(file.model, 'remix-move')
    } else if (file.language === 'circom') {
      monacoRef.current.editor.setModelLanguage(file.model, 'remix-circom')
    } else if (file.language === 'toml') {
      monacoRef.current.editor.setModelLanguage(file.model, 'remix-toml')
    } else if (file.language === 'noir') {
      monacoRef.current.editor.setModelLanguage(file.model, 'remix-noir')
    } else if (file.language === 'sql') {
      monacoRef.current.editor.setModelLanguage(file.model, 'remix-sql')
    } else if (file.language === 'md') {
      monacoRef.current.editor.setModelLanguage(file.model, 'markdown')
    }
  }, [props.currentFile, props.isDiff])

  const convertToMonacoDecoration = (decoration: lineText | sourceAnnotation | sourceMarker, typeOfDecoration: string) => {
    if (typeOfDecoration === 'sourceAnnotationsPerFile') {
      decoration = decoration as sourceAnnotation
      return {
        type: typeOfDecoration,
        range: new monacoRef.current.Range(decoration.row + 1, 1, decoration.row + 1, 1),
        options: {
          isWholeLine: false,
          glyphMarginHoverMessage: {
            value: (decoration.from ? `from ${decoration.from}:\n` : '') + decoration.text,
          },
          glyphMarginClassName: `fal fa-exclamation-square text-${decoration.type === 'error' ? 'danger' : decoration.type === 'warning' ? 'warning' : 'info'}`,
        },
      }
    }
    if (typeOfDecoration === 'markerPerFile') {
      decoration = decoration as sourceMarker
      let isWholeLine = false
      if (
        (decoration.position.start.line === decoration.position.end.line && decoration.position.end.column - decoration.position.start.column < 2) ||
        decoration.position.start.line !== decoration.position.end.line
      ) {
        // in this case we force highlighting the whole line (doesn't make sense to highlight 2 chars)
        isWholeLine = true
      }
      return {
        type: typeOfDecoration,
        range: new monacoRef.current.Range(
          decoration.position.start.line + 1,
          decoration.position.start.column + 1,
          decoration.position.end.line + 1,
          decoration.position.end.column + 1
        ),
        options: {
          isWholeLine,
          inlineClassName: `${isWholeLine ? 'alert-info' : 'inline-class'}  border-0 highlightLine${decoration.position.start.line + 1}`,
        },
      }
    }
    if (typeOfDecoration === 'lineTextPerFile') {
      const lineTextDecoration = decoration as lineText
      return {
        type: typeOfDecoration,
        range: new monacoRef.current.Range(
          lineTextDecoration.position.start.line + 1,
          lineTextDecoration.position.start.column + 1,
          lineTextDecoration.position.start.line + 1,
          1024
        ),
        options: {
          after: {
            content: ` ${lineTextDecoration.content}`,
            inlineClassName: `${lineTextDecoration.className}`,
          },
          afterContentClassName: `${lineTextDecoration.afterContentClassName}`,
          hoverMessage: lineTextDecoration.hoverMessage,
        },
      }
    }
  }

  props.editorAPI.clearDecorationsByPlugin = (filePath: string, plugin: string, typeOfDecoration: string, registeredDecorations: any, currentDecorations: any) => {
    const model = editorModelsState[filePath]?.model
    if (!model)
      return {
        currentDecorations: [],
        registeredDecorations: [],
      }
    const decorations = []
    const newRegisteredDecorations = []
    if (registeredDecorations) {
      for (const decoration of registeredDecorations) {
        if (decoration.type === typeOfDecoration && decoration.value.from !== plugin) {
          decorations.push(convertToMonacoDecoration(decoration.value, typeOfDecoration))
          newRegisteredDecorations.push(decoration)
        }
      }
    }
    return {
      currentDecorations: model.deltaDecorations(currentDecorations, decorations),
      registeredDecorations: newRegisteredDecorations,
    }
  }

  props.editorAPI.keepDecorationsFor = (filePath: string, plugin: string, typeOfDecoration: string, registeredDecorations: any, currentDecorations: any) => {
    const model = editorModelsState[filePath]?.model
    if (!model)
      return {
        currentDecorations: [],
      }
    const decorations = []
    if (registeredDecorations) {
      for (const decoration of registeredDecorations) {
        if (decoration.value.from === plugin) {
          decorations.push(convertToMonacoDecoration(decoration.value, typeOfDecoration))
        }
      }
    }
    return {
      currentDecorations: model.deltaDecorations(currentDecorations, decorations),
    }
  }

  const addDecoration = (decoration: sourceAnnotation | sourceMarker, filePath: string, typeOfDecoration: string) => {
    const model = editorModelsState[filePath]?.model
    if (!model) return { currentDecorations: []}
    const monacoDecoration = convertToMonacoDecoration(decoration, typeOfDecoration)
    return {
      currentDecorations: model.deltaDecorations([], [monacoDecoration]),
      registeredDecorations: [{ value: decoration, type: typeOfDecoration }],
    }
  }

  props.editorAPI.addDecoration = (marker: sourceMarker, filePath: string, typeOfDecoration: string) => {
    return addDecoration(marker, filePath, typeOfDecoration)
  }

  props.editorAPI.addErrorMarker = async (errors: errorMarker[], from: string) => {
    const allMarkersPerfile: Record<string, Array<monacoTypes.editor.IMarkerData>> = {}

    for (const error of errors) {
      let filePath = error.file

      if (!filePath) return
      const fileFromUrl = await props.plugin.call('fileManager', 'getPathFromUrl', filePath)
      filePath = fileFromUrl.file
      const model = editorModelsState[filePath]?.model
      const errorServerityMap = {
        error: MarkerSeverity.Error,
        warning: MarkerSeverity.Warning,
        info: MarkerSeverity.Info,
      }
      if (model) {
        const markerData: monacoTypes.editor.IMarkerData = {
          severity: typeof error.severity === 'string' ? errorServerityMap[error.severity] : error.severity,
          startLineNumber: (error.position.start && error.position.start.line) || 0,
          startColumn: (error.position.start && error.position.start.column) || 0,
          endLineNumber: (error.position.end && error.position.end.line) || 0,
          endColumn: (error.position.end && error.position.end.column) || 0,
          message: error.message,
        }
        if (!allMarkersPerfile[filePath]) {
          allMarkersPerfile[filePath] = []
        }
        allMarkersPerfile[filePath].push(markerData)
      }
    }
    for (const filePath in allMarkersPerfile) {
      const model = editorModelsState[filePath]?.model
      if (model) {
        monacoRef.current.editor.setModelMarkers(model, from, allMarkersPerfile[filePath])
      }
    }
  }

  props.editorAPI.clearErrorMarkers = async (sources: string[] | { [fileName: string]: any }, from: string) => {
    if (sources) {
      for (const source of Array.isArray(sources) ? sources : Object.keys(sources)) {
        const filePath = source
        const model = editorModelsState[filePath]?.model
        if (model) {
          monacoRef.current.editor.setModelMarkers(model, from, [])
        }
      }
    }
  }

  props.editorAPI.findMatches = (uri: string, value: string) => {
    if (!editorRef.current) return
    const model = editorModelsState[uri]?.model
    if (model) return model.findMatches(value)
  }

  props.editorAPI.getValue = (uri: string) => {
    if (!editorRef.current) return

    const model = editorModelsState[uri]?.model
    if (model) {
      return model.getValue()
    }
  }

  props.editorAPI.getCursorPosition = (offset: boolean = true) => {
    if (!monacoRef.current) return
    const model = editorModelsState[currentFileRef.current]?.model
    if (model) {
      return offset ? model.getOffsetAt(editorRef.current.getPosition()) : editorRef.current.getPosition()
    }
  }

  props.editorAPI.getPositionAt = (offset: number) => {
    if (!monacoRef.current) return
    const model = editorModelsState[currentFileRef.current]?.model
    if (model) {
      return model.getPositionAt(offset)
    }
  }

  props.editorAPI.getHoverPosition = (position: monacoTypes.Position) => {
    if (!monacoRef.current) return
    const model = editorModelsState[currentFileRef.current]?.model
    if (model) {
      return model.getOffsetAt(position)
    } else {
      return 0
    }
  }

  props.editorAPI.getFontSize = () => {
    if (!editorRef.current) return
    return editorRef.current.getOption(51)
  }
  ;(window as any).addRemixBreakpoint = (position) => {
    // make it available from e2e testing...
    const model = editorRef.current.getModel()
    if (model) {
      setCurrentBreakpoints((prevState) => {
        const currentFile = currentUrlRef.current
        if (!prevState[currentFile]) prevState[currentFile] = {}
        const decoration = Object.keys(prevState[currentFile]).filter((line) => parseInt(line) === position.lineNumber)
        if (decoration.length) {
          props.events.onBreakPointCleared(currentFile, position.lineNumber)
          model.deltaDecorations([prevState[currentFile][position.lineNumber]], [])
          delete prevState[currentFile][position.lineNumber]
        } else {
          props.events.onBreakPointAdded(currentFile, position.lineNumber)
          const decorationIds = model.deltaDecorations(
            [],
            [
              {
                range: new monacoRef.current.Range(position.lineNumber, 1, position.lineNumber, 1),
                options: {
                  isWholeLine: false,
                  glyphMarginClassName: 'fas fa-circle text-info',
                },
              },
            ]
          )
          prevState[currentFile][position.lineNumber] = decorationIds[0]
        }
        return prevState
      })
    }
  }

  props.editorAPI.showCustomDiff = async (file: string, content: string) => {
    const currentContent = await props.plugin.call('fileManager', 'readFile', file)
    const diff = diffLines(currentContent, content)
    const changes: ChangeType[] = extractLineNumberRangesWithText(diff)
    if (props.currentFile === file) {
      showCustomDiff(changes, file, editorRef.current, monacoRef.current, addDecoratorCollection, addAcceptDeclineWidget, setDecoratorListCollection, acceptHandler, rejectHandler, acceptAllHandler, rejectAllHandler, setCurrentDiffFile, changedTypeMap.current)
    } else {
      pendingCustomDiff.current[file] = changes
    }
  }

  function removeAllWidgets() {
    const widgetIds = Object.keys(decoratorListCollection)
    if (widgetIds.length === 0) return
    if (document.getElementById(widgetIds[0]) === null) return
    setDecoratorListCollection(decoratorListCollection => {
      Object.keys(decoratorListCollection).forEach((widgetId) => {
        editorRef.current.removeContentWidget({
          getId: () => widgetId
        })
      })
      return decoratorListCollection
    })
  }

  function setReducerListener() {
    if (diffEditorRef.current && diffEditorRef.current.getModifiedEditor() && editorRef.current){
      reducerListener(props.plugin, dispatch, monacoRef.current, [diffEditorRef.current.getModifiedEditor(), editorRef.current], props.events)
    }
  }

  function handleDiffEditorDidMount(editor: any) {
    diffEditorRef.current = editor
    setReducerListener()
  }

  function handleEditorDidMount(editor) {
    editorRef.current = editor
    defineAndSetTheme(monacoRef.current)
    setReducerListener()
    props.events.onEditorMounted()
    editor.onMouseUp((e) => {
      // see https://microsoft.github.io/monaco-editor/typedoc/enums/editor.MouseTargetType.html
      // 2 is GUTTER_GLYPH_MARGIN
      // 3 is GUTTER_LINE_NUMBERS
      if (e && e.target && (e.target.type === 2 || e.target.type === 3)) {
        ;(window as any).addRemixBreakpoint(e.target.position)
      }
    })

    editor.onDidChangeModelContent((e) => {
      if (inlineCompletionProviderRef.current && inlineCompletionProviderRef.current.currentCompletion) {
        const changes = e.changes;
        // Check if the change matches the current completion
        if (changes.some(change => change.text === inlineCompletionProviderRef.current.currentCompletion.item.insertText)) {
          inlineCompletionProviderRef.current.currentCompletion.onAccepted()
          inlineCompletionProviderRef.current.currentCompletion.accepted = true
          trackMatomoEvent<AIEvent>({ category: 'ai', action: 'remixAI', name: 'Copilot_Completion_Accepted', isClick: true })
        }
      }
    });

    editor.onDidPaste(async (e) => {
      const shouldShowWarning = localStorage.getItem(HIDE_PASTE_WARNING_KEY) !== 'true';
      // Only show the modal if the user hasn't opted out
      if (shouldShowWarning && !pasteCodeRef.current && e && e.range && e.range.startLineNumber >= 0 && e.range.endLineNumber >= 0 && e.range.endLineNumber - e.range.startLineNumber > 10) {
        // get the file name
        const pastedCode = editor.getModel().getValueInRange(e.range)
        const pastedCodePrompt = intl.formatMessage({ id: 'editor.PastedCodeSafety' }, { content:pastedCode })

        // State for the checkbox inside this specific modal instance
        let dontShowAgainChecked = false;
        const handleClose = (askAI = false) => {
          if (dontShowAgainChecked) {
            try {
              localStorage.setItem(HIDE_PASTE_WARNING_KEY, 'true');
            } catch (e) {
              console.error("Failed to write to localStorage:", e);
            }
          }
          if (askAI) {
            // Proceed with the original okFn logic
            (async () => {
              await props.plugin.call('popupPanel', 'showPopupPanel', true)
              setTimeout(async () => {
                props.plugin.call('remixAI', 'chatPipe', 'vulnerability_check', pastedCodePrompt)
              }, 500)
              trackMatomoEvent<AIEvent>({ category: 'ai', action: 'remixAI', name: 'vulnerability_check_pasted_code', isClick: true })
            })();
          }
        };

        const modalContent: AppModal = {
          id: 'newCodePasted',
          title: "New code pasted",
          okLabel: 'Ask RemixAI',
          cancelLabel: 'Close',
          cancelFn: () => handleClose(false), // Pass false for askAI
          okFn: () => handleClose(true), // Pass true for askAI
          message: (
            <div>
              {' '}
              <i className="fas fa-exclamation-triangle text-danger me-1"></i>
              <FormattedMessage id="editor.title1.message1" />
              <div>
                <FormattedMessage id="editor.title1.message2" />
                <div className="mt-2">
                  <FormattedMessage id="editor.title1.message3" values={{ span: (chunks) => <span className="text-warning">{chunks}</span> }} />
                </div>
                <div className="text-warning  mt-2">
                  <FormattedMessage id="editor.title1.message4" />
                </div>
                <div className="mt-2">
                  <FormattedMessage id="editor.title1.message5" />
                </div>
                <div className="mt-2">
                  <FormattedMessage
                    id="editor.title1.message6"
                    values={{
                      a: (chunks) => (
                        <a target="_blank" href="https://remix-ide.readthedocs.io/en/latest/security.html">
                          {chunks}
                        </a>
                      ),
                    }}
                  />
                </div>
              </div>
              {/* Added Checkbox section below */}
              <div className="mt-3">
                <label htmlFor="donotshowagain" className="text-dark">
                  <input
                    type="checkbox"
                    id="donotshowagain"
                    className="me-2"
                    onChange={(e) => dontShowAgainChecked = e.target.checked}
                  />
                  <FormattedMessage id="editor.doNotShowAgain" defaultMessage="Do not show this warning again" /> {/* Consider adding this to locale files */}
                </label>
              </div>
            </div>
          )
        }
        props.plugin.call('notification', 'modal', modalContent)
        trackMatomoEvent({ category: 'editor', action: 'onDidPaste', name: 'more_than_10_lines', isClick: false })
      }
    })

    // add context menu items
    const zoominAction = {
      id: 'zoomIn',
      label: intl.formatMessage({ id: 'editor.zoomIn' }),
      contextMenuOrder: 0, // choose the order
      contextMenuGroupId: 'zooming', // create a new grouping
      keybindings: [
        // eslint-disable-next-line no-bitwise
        monacoRef.current.KeyMod.CtrlCmd | monacoRef.current.KeyCode.Equal,
      ],
      run: () => {
        editor.trigger('keyboard', 'editor.action.fontZoomIn', {});
      }
    }
    const zoomOutAction = {
      id: 'zoomOut',
      label: intl.formatMessage({ id: 'editor.zoomOut' }),
      contextMenuOrder: 0, // choose the order
      contextMenuGroupId: 'zooming', // create a new grouping
      keybindings: [
        // eslint-disable-next-line no-bitwise
        monacoRef.current.KeyMod.CtrlCmd | monacoRef.current.KeyCode.Minus,
      ],
      run: () => {
        editor.trigger('keyboard', 'editor.action.fontZoomOut', {});
      }
    }
    const formatAction = {
      id: 'autoFormat',
      label: intl.formatMessage({ id: 'editor.formatCode' }),
      contextMenuOrder: 0, // choose the order
      contextMenuGroupId: 'formatting', // create a new grouping
      keybindings: [
        // eslint-disable-next-line no-bitwise
        monacoRef.current.KeyMod.Shift | monacoRef.current.KeyMod.Alt | monacoRef.current.KeyCode.KeyF,
      ],
      run: async () => {
        const file = await props.plugin.call('fileManager', 'getCurrentFile')
        await props.plugin.call('codeFormatter', 'format', file)
      },
    }

    let gptGenerateDocumentationAction

    const executeGptGenerateDocumentationAction = (functionNode) => {
      return {
        id: 'generateDocumentation',
        label: intl.formatMessage({ id: 'editor.generateDocumentation' }),
        contextMenuOrder: 0, // choose the order
        contextMenuGroupId: 'gtp', // create a new grouping
        keybindings: [
        // Keybinding for Ctrl + H
          monacoRef.current.KeyMod.CtrlCmd | monacoRef.current.KeyCode.KeyH,
        ],
        run: async () => {
          if (functionNode) {
            const uri = currentFileRef.current + '-ai'
            const content = editorRef.current.getModel().getValue()
            const query = intl.formatMessage({ id: 'editor.generateDocumentationByAI' }, { content, currentFunction: currentFunction.current })
            const params = GenerationParams
            params.stream_result = false
            const result = await props.plugin.call('remixAI', 'code_explaining', query, '', params)
            const output = result['result']
            const outputFunctionComments = extractFunctionComments(output, 1, false)
            const funcRange = await props.plugin.call('codeParser', "getLineColumnOfNode", { src: functionNode.src })
            const newLineCount = (outputFunctionComments[currentFunction.current] || '').split('\n').length

            if (functionNode.documentation) {
              const docsRange = await props.plugin.call('codeParser', "getLineColumnOfNode", { src: functionNode.documentation.src })
              const docs = editorRef.current.getModel().getValueInRange(new monacoRef.current.Range(docsRange.start.line, docsRange.start.column, funcRange.start.line, 1000))
              const oldLineCount = (docs || '').split('\n').length - 1
              const ranges = [
                new monacoRef.current.Range(docsRange.start.line + 1, 0, docsRange.start.line + newLineCount, 1000),
                new monacoRef.current.Range(docsRange.start.line + newLineCount + 1, 0, docsRange.start.line + newLineCount + oldLineCount, 1000)
              ]

              editorRef.current.executeEdits('docsChange', [
                {
                  range: new monacoRef.current.Range(docsRange.start.line + 1, 0, docsRange.start.line + 1, 0),
                  text: outputFunctionComments[currentFunction.current] + '\n',
                },
              ])
              const widgetId = `accept_decline_widget${Math.random().toString(36).substring(2, 15)}`
              const decoratorList = addDecoratorCollection(widgetId, ranges)

              setCurrentDiffFile(uri)
              changedTypeMap.current[widgetId] = 'modified'
              setDecoratorListCollection(decoratorListCollection => {
                Object.keys(decoratorListCollection).forEach((widgetId) => {
                  const decoratorList = decoratorListCollection[widgetId]
                  if (decoratorList) rejectHandler(decoratorList, widgetId)
                  editorRef.current.removeContentWidget({
                    getId: () => widgetId
                  })
                })
                return { [widgetId]: decoratorList }
              })
              setTimeout(() => {
                const newEntryRange = decoratorList.getRange(0)
                addAcceptDeclineWidget(widgetId, editorRef.current, { column: 0, lineNumber: newEntryRange.startLineNumber + 1 }, () => acceptHandler(decoratorList, widgetId), () => rejectHandler(decoratorList, widgetId))
              }, 150)
            } else {
              editorRef.current.executeEdits('newDocs', [
                {
                  range: new monacoRef.current.Range(funcRange.start.line + 1, 0, funcRange.start.line + 1, 0),
                  text: outputFunctionComments[currentFunction.current] + '\n',
                },
              ])
              const ranges = [new monacoRef.current.Range(funcRange.start.line + 1, 0, funcRange.start.line + newLineCount, 1000)]
              const widgetId = `accept_decline_widget${Math.random().toString(36).substring(2, 15)}`
              const decoratorList = addDecoratorCollection(widgetId, ranges)

              setCurrentDiffFile(uri)
              changedTypeMap.current[widgetId] = 'added'
              setDecoratorListCollection(decoratorListCollection => {
                Object.keys(decoratorListCollection).forEach((widgetId) => {
                  const decoratorList = decoratorListCollection[widgetId]
                  if (decoratorList) rejectHandler(decoratorList, widgetId)
                  editorRef.current.removeContentWidget({
                    getId: () => widgetId
                  })
                })
                return { [widgetId]: decoratorList }
              })

              setTimeout(() => {
                const newEntryRange = decoratorList.getRange(0)
                addAcceptDeclineWidget(widgetId, editorRef.current, { column: 0, lineNumber: newEntryRange.startLineNumber + 1 }, () => acceptHandler(decoratorList, widgetId), () => rejectHandler(decoratorList, widgetId))
              }, 150)
            }
          }
          trackMatomoEvent<AIEvent>({ category: 'ai', action: 'remixAI', name: 'generateDocumentation', isClick: true })
        },
      }
    }

    let gptExplainFunctionAction
    const executegptExplainFunctionAction = {
      id: 'explainFunction',
      label: intl.formatMessage({ id: 'editor.explainFunction' }),
      contextMenuOrder: 1, // choose the order
      contextMenuGroupId: 'gtp', // create a new grouping
      run: async () => {
        const file = await props.plugin.call('fileManager', 'getCurrentFile')
        const context = await props.plugin.call('fileManager', 'readFile', file)
        const message = intl.formatMessage({ id: 'editor.explainFunctionByAI' }, { content:context, currentFunction: currentFunction.current })
        await props.plugin.call('popupPanel', 'showPopupPanel', true)
        setTimeout(async () => {
          // Show right side panel if it's hidden
          const isPanelHidden = await props.plugin.call('rightSidePanel', 'isPanelHidden')
          if (isPanelHidden) {
            await props.plugin.call('rightSidePanel', 'togglePanel')
          }
          await props.plugin.call('remixAI' as any, 'chatPipe', 'code_explaining', message, context)
        }, 500)
        trackMatomoEvent<AIEvent>({ category: 'ai', action: 'remixAI', name: 'explainFunction', isClick: true })
      },
    }

    let solgptExplainFunctionAction
    const executeSolgptExplainFunctionAction = {
      id: 'solExplainFunction',
      label: intl.formatMessage({ id: 'editor.explainFunctionSol' }),
      contextMenuOrder: 1, // choose the order
      contextMenuGroupId: 'sol-gtp', // create a new grouping
      keybindings: [
        // Keybinding for Ctrl + E
        monacoRef.current.KeyMod.CtrlCmd | monacoRef.current.KeyCode.KeyE
      ],
      run: async () => {
        const file = await props.plugin.call('fileManager', 'getCurrentFile')
        const content = await props.plugin.call('fileManager', 'readFile', file)
        const selectedCode = editor.getModel().getValueInRange(editor.getSelection())
        const pipeMessage = intl.formatMessage({ id: 'editor.ExplainPipeMessage' }, { content:selectedCode })

        await props.plugin.call('popupPanel', 'showPopupPanel', true)
        setTimeout(async () => {
          // Show right side panel if it's hidden
          const isPanelHidden = await props.plugin.call('rightSidePanel', 'isPanelHidden')
          if (isPanelHidden) {
            await props.plugin.call('rightSidePanel', 'togglePanel')
          }
          await props.plugin.call('remixAI' as any, 'chatPipe', 'code_explaining', selectedCode, content, pipeMessage)
        }, 500)
        trackMatomoEvent<AIEvent>({ category: 'ai', action: 'remixAI', name: 'explainFunction', isClick: true })
      },
    }

    const freeFunctionCondition = editor.createContextKey('freeFunctionCondition', false)
    let freeFunctionAction
    const executeFreeFunctionAction = {
      id: 'executeFreeFunction',
      label: intl.formatMessage({ id: 'editor.executeFreeFunction' }),
      contextMenuOrder: 0, // choose the order
      contextMenuGroupId: 'execute', // create a new grouping
      precondition: 'freeFunctionCondition',
      keybindings: [
        // eslint-disable-next-line no-bitwise
        monacoRef.current.KeyMod.Shift | monacoRef.current.KeyMod.Alt | monacoRef.current.KeyCode.KeyR,
      ],
      run: async () => {
        const position = editorRef.current.getPosition()
        const offset = editorRef.current.getModel().getOffsetAt(position)
        const { nodesAtPosition } = await retrieveNodesAtPosition(offset, props.plugin)
        // find the contract and get the nodes of the contract and the base contracts and imports
        if (nodesAtPosition && isArray(nodesAtPosition) && nodesAtPosition.length) {
          const freeFunctionNode = nodesAtPosition.find((node) => node.kind === 'freeFunction')
          if (freeFunctionNode) {
            const file = await props.plugin.call('fileManager', 'getCurrentFile')
            props.plugin.call('solidity-script', 'execute', file, freeFunctionNode.name)
          } else {
            props.plugin.call('notification', 'toast', intl.formatMessage({ id: 'editor.toastText1' }))
          }
        } else {
          props.plugin.call('notification', 'toast', intl.formatMessage({ id: 'editor.toastText2' }))
        }
      },
    }
    editor.addAction(formatAction)
    editor.addAction(zoomOutAction)
    editor.addAction(zoominAction)
    freeFunctionAction = editor.addAction(executeFreeFunctionAction)
    gptGenerateDocumentationAction = editor.addAction(executeGptGenerateDocumentationAction(null))
    gptExplainFunctionAction = editor.addAction(executegptExplainFunctionAction)
    solgptExplainFunctionAction = editor.addAction(executeSolgptExplainFunctionAction)

    // we have to add the command because the menu action isn't always available (see onContextMenuHandlerForFreeFunction)
    editor.addCommand(monacoRef.current.KeyMod.Shift | monacoRef.current.KeyMod.Alt | monacoRef.current.KeyCode.KeyR, () => executeFreeFunctionAction.run())

    const contextmenu = editor.getContribution('editor.contrib.contextmenu')
    const orgContextMenuMethod = contextmenu._onContextMenu
    const onContextMenuHandlerForFreeFunction = async (offset: number) => {
      if (freeFunctionAction) {
        freeFunctionAction.dispose()
        freeFunctionAction = null
      }
      if (gptGenerateDocumentationAction) {
        gptGenerateDocumentationAction.dispose()
        gptGenerateDocumentationAction = null
      }
      if (gptExplainFunctionAction) {
        gptExplainFunctionAction.dispose()
        gptExplainFunctionAction = null
      }
      if (solgptExplainFunctionAction) {
        solgptExplainFunctionAction.dispose()
        solgptExplainFunctionAction = null
      }

      const file = await props.plugin.call('fileManager', 'getCurrentFile')
      if (!file.endsWith('.sol')) {
        freeFunctionCondition.set(false)
        return
      }

      const { nodesAtPosition } = await retrieveNodesAtPosition(offset, props.plugin)
      const freeFunctionNode = nodesAtPosition.find((node) => node.kind === 'freeFunction')
      if (freeFunctionNode) {
        executeFreeFunctionAction.label = intl.formatMessage({ id: 'editor.executeFreeFunction2' }, { name: freeFunctionNode.name })
        freeFunctionAction = editor.addAction(executeFreeFunctionAction)
        freeFunctionCondition.set(true)
      }

      const functionImpl = nodesAtPosition.find((node) => node.kind === 'function')
      if (functionImpl) {
        currentFunction.current = functionImpl.name
        const generateDocumentationAction = executeGptGenerateDocumentationAction(functionImpl)

        generateDocumentationAction.label = intl.formatMessage({ id: 'editor.generateDocumentation2' }, { name: functionImpl.name })
        gptGenerateDocumentationAction = editor.addAction(generateDocumentationAction)
        executegptExplainFunctionAction.label = intl.formatMessage({ id: 'editor.explainFunction2' }, { name: functionImpl.name })
        gptExplainFunctionAction = editor.addAction(executegptExplainFunctionAction)
        executeSolgptExplainFunctionAction.label = intl.formatMessage({ id: 'editor.explainFunctionSol' })
        solgptExplainFunctionAction = editor.addAction(executeSolgptExplainFunctionAction)
      } else {
        // do not allow single character explaining
        if (editor.getModel().getValueInRange(editor.getSelection()).length <=1){ return}
        executeSolgptExplainFunctionAction.label = intl.formatMessage({ id: 'editor.explainFunctionSol' })
        solgptExplainFunctionAction = editor.addAction(executeSolgptExplainFunctionAction)
      }
    }
    contextmenu._onContextMenu = (...args) => {
      if (args[0]) args[0].event?.preventDefault()
      const position = args[0].target.position
      const offset = editorRef.current.getModel().getOffsetAt(position)
      onContextMenuHandlerForFreeFunction(offset)
        .then(() => orgContextMenuMethod.apply(contextmenu, args))
        .catch(() => orgContextMenuMethod.apply(contextmenu, args))
    }

    const editorService = editor._codeEditorService
    const openEditorBase = editorService.openCodeEditor.bind(editorService)
    editorService.openCodeEditor = async (input, source) => {
      if (input && input.resource && input.resource.path.includes('__shims__')) {
        return openEditorBase(input, source)
      }
      const result = await openEditorBase(input, source)
      if (input && input.resource && input.resource.path) {
        try {
          await props.plugin.call('fileManager', 'open', input.resource.path)
          if (input.options && input.options.selection) {
            editor.revealRange(input.options.selection)
            editor.setPosition({
              column: input.options.selection.startColumn,
              lineNumber: input.options.selection.startLineNumber,
            })
          }
        } catch (e) {
          console.log(e)
        }
      }
      return result
    }
    // just for e2e testing
    const loadedElement = document.createElement('span')
    loadedElement.setAttribute('data-id', 'editorloaded')
    document.body.appendChild(loadedElement)
  }

  function handleEditorWillMount(monaco) {

    monacoRef.current = monaco
    props.setMonaco(monaco)
    // Register a new language
    monacoRef.current.languages.register({ id: 'remix-solidity' })
    monacoRef.current.languages.register({ id: 'remix-cairo' })
    monacoRef.current.languages.register({ id: 'remix-zokrates' })
    monacoRef.current.languages.register({ id: 'remix-move' })
    monacoRef.current.languages.register({ id: 'remix-circom' })
    monacoRef.current.languages.register({ id: 'remix-toml' })
    monacoRef.current.languages.register({ id: 'remix-noir' })
    monacoRef.current.languages.register({ id: 'remix-sql' })

    // Allow JSON schema requests
    monacoRef.current.languages.json.jsonDefaults.setDiagnosticsOptions({ enableSchemaRequest: true })

    monacoRef.current.languages.registerCompletionItemProvider('typescript', new RemixTSCompletionProvider(monaco))
    monacoRef.current.languages.registerCompletionItemProvider('javascript', new RemixTSCompletionProvider(monaco))

    // hide the module resolution error. We have to remove this when we know how to properly resolve imports.
    monacoRef.current.languages.typescript.typescriptDefaults.setDiagnosticsOptions({ diagnosticCodesToIgnore: [2792]})

    // Enable JSX diagnostics for JavaScript
    monacoRef.current.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    })

    // Enable HTML and CSS validation
    monacoRef.current.languages.html.htmlDefaults.setOptions({
      format: {
        tabSize: 2,
        insertSpaces: true,
        wrapLineLength: 120,
        unformatted: 'wbr',
        contentUnformatted: 'pre,code,textarea',
        indentInnerHtml: false,
        preserveNewLines: true,
        maxPreserveNewLines: null,
        indentHandlebars: false,
        endWithNewline: false,
        extraLiners: 'head, body, /html',
        wrapAttributes: 'auto'
      },
      suggest: { html5: true }
    })

    monacoRef.current.languages.css.cssDefaults.setOptions({
      validate: true,
      lint: {
        compatibleVendorPrefixes: 'ignore',
        vendorPrefix: 'warning',
        duplicateProperties: 'warning',
        emptyRules: 'warning',
        importStatement: 'ignore',
        boxModel: 'ignore',
        universalSelector: 'ignore',
        zeroUnits: 'ignore',
        fontFaceProperties: 'warning',
        hexColorLength: 'error',
        argumentsInColorFunction: 'error',
        unknownProperties: 'warning',
        ieHack: 'ignore',
        unknownVendorSpecificProperties: 'ignore',
        propertyIgnoredDueToDisplay: 'warning',
        important: 'ignore',
        float: 'ignore',
        idSelector: 'ignore'
      }
    })

    // Register a tokens provider for the language
    monacoRef.current.languages.setMonarchTokensProvider('remix-solidity', solidityTokensProvider as any)
    monacoRef.current.languages.setLanguageConfiguration('remix-solidity', solidityLanguageConfig as any)

    monacoRef.current.languages.setMonarchTokensProvider('remix-cairo', cairoTokensProvider as any)
    monacoRef.current.languages.setLanguageConfiguration('remix-cairo', cairoLanguageConfig as any)
    monacoRef.current.languages.registerInlineCompletionsProvider('remix-cairo', inlineCompletionProviderRef.current)

    monacoRef.current.languages.setMonarchTokensProvider('remix-zokrates', zokratesTokensProvider as any)
    monacoRef.current.languages.setLanguageConfiguration('remix-zokrates', zokratesLanguageConfig as any)

    monacoRef.current.languages.setMonarchTokensProvider('remix-move', moveTokenProvider as any)
    monacoRef.current.languages.setLanguageConfiguration('remix-move', moveLanguageConfig as any)

    monacoRef.current.languages.setMonarchTokensProvider('remix-circom', circomTokensProvider as any)
    monacoRef.current.languages.setLanguageConfiguration('remix-circom', circomLanguageConfig(monacoRef.current) as any)
    monacoRef.current.languages.registerInlineCompletionsProvider('remix-circom', inlineCompletionProviderRef.current)

    monacoRef.current.languages.setMonarchTokensProvider('remix-toml', tomlTokenProvider as any)
    monacoRef.current.languages.setLanguageConfiguration('remix-toml', tomlLanguageConfig as any)

    monacoRef.current.languages.setMonarchTokensProvider('remix-noir', noirTokensProvider as any)
    monacoRef.current.languages.setLanguageConfiguration('remix-noir', noirLanguageConfig as any)
    monacoRef.current.languages.registerInlineCompletionsProvider('remix-noir', inlineCompletionProviderRef.current)

    monacoRef.current.languages.setMonarchTokensProvider('remix-sql', sqlTokensProvider as any)
    monacoRef.current.languages.setLanguageConfiguration('remix-sql', sqlLanguageConfig as any)

    monacoRef.current.languages.registerDefinitionProvider('remix-solidity', new RemixDefinitionProvider(props, monaco))
    monacoRef.current.languages.registerDocumentHighlightProvider('remix-solidity', new RemixHighLightProvider(props, monaco))
    monacoRef.current.languages.registerReferenceProvider('remix-solidity', new RemixReferenceProvider(props, monaco))
    monacoRef.current.languages.registerHoverProvider('remix-solidity', new RemixHoverProvider(props, monaco))
    monacoRef.current.languages.registerCompletionItemProvider('remix-solidity', new RemixCompletionProvider(props, monaco))
    monacoRef.current.languages.registerInlineCompletionsProvider('remix-solidity', inlineCompletionProviderRef.current)
    monaco.languages.registerCodeActionProvider('remix-solidity', new RemixCodeActionProvider(props, monaco))

    loadTypes(monacoRef.current)
  }

  function addAcceptDeclineWidget(id, editor, position, acceptHandler, rejectHandler, acceptAllHandler?, rejectAllHandler?) {
    const widget = editor.addContentWidget({
      allowEditorOverflow: true,
      afterRender: () => {
        if (document.getElementById(id)) {
          document.getElementById(id).style.left = '0px'
        }
      },
      getDomNode: () => {
        if (document.getElementById(id)) {
          return document.getElementById(id)
        }
        const containerElement = document.createElement('div')
        containerElement.id = id
        containerElement.style.width = '100%'
        containerElement.style.borderTop = '1px solid var(--custom-ai-color)'

        const innerContainer = document.createElement('div')
        innerContainer.style.float = 'right'

        const acceptBtn = document.createElement('button')
        acceptBtn.style.backgroundColor = 'var(--custom-ai-color)'
        acceptBtn.style.color = 'var(--vscode-editor-background)'
        acceptBtn.classList.add(...['btn', 'border', 'align-items-center', 'px-1', 'py-0', 'me-1'])
        acceptBtn.style.fontSize = '0.8rem'
        acceptBtn.textContent = 'Accept'

        acceptBtn.onclick = () => {
          acceptHandler && acceptHandler()
          editor.removeContentWidget({
            getId: () => id
          })
        }

        const rejectBtn = document.createElement('button')
        rejectBtn.classList.add(...['btn', 'border', 'align-items-center', 'px-1', 'py-0', 'bg-light', 'text-dark'])
        rejectBtn.style.fontSize = '0.8rem'
        rejectBtn.textContent = 'Decline'
        rejectBtn.onclick = () => {
          rejectHandler && rejectHandler()
          editor.removeContentWidget({
            getId: () => id
          })
        }

        innerContainer.appendChild(acceptBtn)
        innerContainer.appendChild(rejectBtn)

        if (acceptAllHandler) {
          const acceptAllBtn = document.createElement('button')
          acceptAllBtn.classList.add(...['btn', 'border', 'align-items-center', 'px-1', 'py-0', 'bg-light', 'text-dark'])
          acceptAllBtn.style.fontSize = '0.8rem'
          acceptAllBtn.textContent = 'Accept All'
          acceptAllBtn.onclick = () => {
            acceptAllHandler()
            editor.removeContentWidget({
              getId: () => id
            })
          }
          innerContainer.appendChild(acceptAllBtn)
        }

        if (rejectAllHandler) {
          const rejectAllBtn = document.createElement('button')
          rejectAllBtn.classList.add(...['btn', 'border', 'align-items-center', 'px-1', 'py-0', 'bg-light', 'text-dark'])
          rejectAllBtn.style.fontSize = '0.8rem'
          rejectAllBtn.textContent = 'Decline All'
          rejectAllBtn.onclick = () => {
            rejectAllHandler()
            editor.removeContentWidget({
              getId: () => id
            })
          }
          innerContainer.appendChild(rejectAllBtn)
        }

        containerElement.appendChild(innerContainer)
        return containerElement
      },

      getId: () => {
        return id
      },

      getPosition: () => {
        return {
          position: position ? { column: 1, lineNumber: position.lineNumber } : { column: 1, lineNumber: 1 },
          preference: [1]
        }
      }
    })

    return widget
  }

  function acceptHandler(decoratorList, widgetId) {
    const ranges = decoratorList.getRanges()
    const lineChangeType = changedTypeMap.current[widgetId]
    /*
      The first item represents a line that has been added.
      The second item represents a line that has been removed.
      If the lineChangeType is 'modified' or 'added', we remove the edit that correspond to the old code (item with index 1).
    */
    if (lineChangeType === 'modified' || lineChangeType === 'added') {
      if (ranges[1]) {
        ranges[1].endLineNumber = ranges[1].endLineNumber + 1
        ranges[1].endColumn = 0
        editorRef.current.executeEdits('removeOriginal', [
          {
            range: ranges[1],
            text: null,
          },
        ])
      }
    } else {
      if (ranges[0]) {
        ranges[0].endLineNumber = ranges[0].endLineNumber + 1
        ranges[0].endColumn = 0
        editorRef.current.executeEdits('removeModified', [
          {
            range: ranges[0],
            text: null,
          },
        ])
      }
    }

    decoratorList.clear()
    setDecoratorListCollection(decoratorListCollection => {
      const { [widgetId]: _, ...rest } = decoratorListCollection
      return rest
    })
  }

  function rejectHandler(decoratorList, widgetId) {
    const ranges = decoratorList.getRanges()
    const lineChangeType = changedTypeMap.current[widgetId]
    /*
      The first item represents a line that has been added.
      The second item represents a line that has been removed.
      If the lineChangeType is 'modified' or 'added', we remove the edit that correspond to the old code (item with index 0).
    */
    if (lineChangeType === 'modified' || lineChangeType === 'added') {
      if (ranges[0]) {
        ranges[0].endLineNumber = ranges[0].endLineNumber + 1
        ranges[0].endColumn = 0
        editorRef.current.executeEdits('removeModified', [
          {
            range: ranges[0],
            text: null,
          },
        ])
      }
    } else {
      if (ranges[1]) {
        ranges[1].endLineNumber = ranges[1].endLineNumber + 1
        ranges[1].endColumn = 0
        editorRef.current.executeEdits('removeOriginal', [
          {
            range: ranges[1],
            text: null,
          },
        ])
      }
    }

    decoratorList.clear()
    setDecoratorListCollection(decoratorListCollection => {
      const { [widgetId]: _, ...rest } = decoratorListCollection
      return rest
    })
  }

  function acceptAllHandler() {
    const decoratorListCollection = currentDecoratorListCollectionRef.current

    Object.keys(decoratorListCollection).forEach((widgetId) => {
      const decoratorList = decoratorListCollection[widgetId]

      acceptHandler(decoratorList, widgetId)
      editorRef.current.removeContentWidget({
        getId: () => widgetId
      })
    })
  }

  function rejectAllHandler() {
    const decoratorListCollection = currentDecoratorListCollectionRef.current

    Object.keys(decoratorListCollection).forEach((widgetId) => {
      const decoratorList = decoratorListCollection[widgetId]

      rejectHandler(decoratorList, widgetId)
      editorRef.current.removeContentWidget({
        getId: () => widgetId
      })
    })
  }

  function addDecoratorCollection (widgetId: string, ranges: monacoTypes.IRange[]): monacoTypes.editor.IEditorDecorationsCollection {
    let decoratorList: monacoTypes.editor.IEditorDecorationsCollection
    if (ranges.length === 1) {
      // content has been added
      decoratorList = editorRef.current.createDecorationsCollection([{
        range: ranges[0],
        options: {
          isWholeLine: true,
          className: 'newChangesDecoration',
          marginClassName: 'newChangesDecoration',
        }
      }])
    } else {
      if (ranges[0] !== null) {
        // content has been modified
        decoratorList = editorRef.current.createDecorationsCollection([{
          range: ranges[0],
          options: {
            isWholeLine: true,
            className: 'newChangesDecoration',
            marginClassName: 'newChangesDecoration',
          }
        }, {
          range: ranges[1],
          options: {
            isWholeLine: true,
            className: 'modifiedChangesDecoration',
            marginClassName: 'modifiedChangesDecoration',
          }
        }])
      } else {
        // content has been removed
        decoratorList = editorRef.current.createDecorationsCollection([{
          range: ranges[1],
          options: {
            isWholeLine: true,
            className: 'modifiedChangesDecoration',
            marginClassName: 'modifiedChangesDecoration',
          }
        }])
      }
    }

    const startLineNumber = decoratorList.getRanges()[0]?.startLineNumber;
    ((startLineNumber, decoratorList, widgetId, editorRef, acceptHandler, rejectHandler, addAcceptDeclineWidget) => {
      decoratorList.onDidChange(() => {
        const newRanges = decoratorList.getRanges()
        if (newRanges.length === 0) return
        if (newRanges[0].startLineNumber !== startLineNumber && document.getElementById(widgetId)) {
          editorRef.removeContentWidget({
            getId: () => widgetId
          })
          addAcceptDeclineWidget(widgetId, editorRef, { column: 0, lineNumber: newRanges[0].startLineNumber + 1 }, () => acceptHandler(decoratorList, widgetId), () => rejectHandler(decoratorList, widgetId), acceptAllHandler, rejectAllHandler)
        }
        startLineNumber = newRanges[0].startLineNumber
      })
    })(startLineNumber, decoratorList, widgetId, editorRef.current, acceptHandler, rejectHandler, addAcceptDeclineWidget)

    return decoratorList
  }

  return (
    <div className="w-100 h-100 d-flex flex-column-reverse">
      <DiffEditor
        originalLanguage={'remix-solidity'}
        modifiedLanguage={'remix-solidity'}
        original={''}
        modified={''}
        onMount={handleDiffEditorDidMount}
        options={{ readOnly: false, renderSideBySide: isSplit }}
        width='100%'
        height={props.isDiff ? '100%' : '0%'}
        className={props.isDiff ? "d-block" : "d-none"}
        data-id="diffEditor"
      />
      <Editor
        width="100%"
        height={props.isDiff ? '0%' : '100%'}
        path={props.currentFile}
        language={editorModelsState[props.currentFile] ? editorModelsState[props.currentFile].language : 'text'}
        onMount={handleEditorDidMount}
        beforeMount={handleEditorWillMount}
        options={{
          glyphMargin: true,
          readOnly: (!editorRef.current || !props.currentFile) && editorModelsState[props.currentFile]?.readOnly,
          inlineSuggest: {
            enabled: true
          },
          minimap: {
            enabled: false
          }
        }}
        defaultValue={defaultEditorValue}
        className={props.isDiff ? "d-none" : "d-block"}
      />
      {editorModelsState[props.currentFile]?.readOnly && (
        <span className="ps-4 h6 mb-0 w-100 alert-info position-absolute bottom-0 end-0">
          <i className="fas fa-lock-alt p-2"></i>
          <FormattedMessage
            id="editor.text"
            values={{
              b: (chunks) => <b>{chunks}</b>,
            }}
          />
        </span>
      )}
    </div>
  )
}

export default EditorUI
