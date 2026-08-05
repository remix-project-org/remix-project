
import { Registry } from '@remix-project/remix-lib';
import { monacoTypes } from '@remix-ui/editor';
import { commitChange } from '@remix-ui/git';
export interface Action {
  type: string;
  payload: Record<string, any>
  monaco: any,
  editors: any[]
}

export const initialState = {}

export const reducerActions = (models = initialState, action: Action) => {
  const monaco = action.monaco
  const editors = action.editors as any[]
  switch (action.type) {
  case 'ADD_MODEL': {
    if (!editors) return models
    const uri = action.payload.uri
    const value = action.payload.value
    const language = action.payload.language
    const readOnly = action.payload.readOnly
    if (models[uri]) {
      if (models[uri].readOnly !== readOnly) {
        return { ...models, [uri]: { ...models[uri], readOnly } }
      }
      return models
    }
    models[uri] = { language, uri, readOnly }
    let model

    try {
      model = monaco.editor.createModel(value, language, monaco.Uri.parse(uri))
    } catch (e) {

    }
    models[uri].model = model
    model.onDidChangeContent(() => action.payload.events.onDidChangeContent(uri))
    return models
  }
  case 'DISPOSE_MODEL': {
    const uri = action.payload.uri
    const model = models[uri]?.model
    if (model) model.dispose()
    delete models[uri]
    return { ...models }
  }
  case 'ADD_DIFF': {
    if (!editors) return models
    return models
  }
  case 'SET_VALUE': {
    if (!editors) return models
    const uri = action.payload.uri
    const value = action.payload.value
    const model = models[uri]?.model
    if (model) {
      model.setValue(value)
    }
    return models
  }
  case 'REVEAL_LINE': {
    if (!editors) return models
    const line = action.payload.line
    const column = action.payload.column

    editors.map((editor) => {

      editor.revealLine(line)
      editor.setPosition({ column, lineNumber: line })
    })
    return models
  }
  case 'REVEAL_RANGE': {
    if (!editors) return models
    const range: monacoTypes.IRange = {
      startLineNumber: action.payload.startLineNumber + 1,
      startColumn: action.payload.startColumn,
      endLineNumber: action.payload.endLineNumber + 1,
      endColumn: action.payload.endColumn
    }
    // reset to start of line
    if (action.payload.startColumn < 100) {
      editors.map(editor => editor.revealRange({
        startLineNumber: range.startLineNumber,
        startColumn: 1,
        endLineNumber: range.endLineNumber,
        endColumn: 1
      }))
    } else {
      editors.map(editor => editor.revealRangeInCenter(range))
    }
    return models
  }
  case 'FOCUS': {
    if (!editors) return models
    editors.map(editor => editor.focus())
    return models
  }
  case 'SET_FONTSIZE': {
    if (!editors) return models
    const size = action.payload.size
    editors.map((editor) => {
      if (size === 1) {
        editor.trigger('keyboard', 'editor.action.fontZoomIn', {});
      } else {
        editor.trigger('keyboard', 'editor.action.fontZoomOut', {});
      }
    })
    return models
  }
  case 'SET_WORDWRAP': {
    if (!editors) return models
    const wrap = action.payload.wrap
    editors.map(editor =>
      editor.updateOptions({ wordWrap: wrap ? 'on' : 'off' }))
    return models
  }
  }
}

export const reducerListener = (plugin, dispatch, monaco, editors: any[], events) => {
  const config = Registry.getInstance().get('config').api
  const wordWrap = config.get('settings/text-wrap')

  dispatch({
    type: 'SET_WORDWRAP',
    payload: { wrap: wordWrap },
    monaco,
    editors
  })

  plugin.on('editor', 'addModel', (value, language, uri, readOnly) => {
    dispatch({
      type: 'ADD_MODEL',
      payload: { uri, value, language, readOnly, events },
      monaco,
      editors
    })
  })

  plugin.on('editor', 'addDiff', (value: commitChange) => {
    dispatch({
      type: 'ADD_DIFF',
      payload: { value },
      monaco,
      editors
    })
  })

  plugin.on('editor', 'disposeModel', (uri) => {
    dispatch({
      type: 'DISPOSE_MODEL',
      payload: { uri },
      monaco,
      editors
    })
  })

  plugin.on('editor', 'setValue', (uri, value) => {
    dispatch({
      type: 'SET_VALUE',
      payload: { uri, value },
      monaco,
      editors
    })
  })

  plugin.on('editor', 'revealLine', (line, column) => {
    dispatch({
      type: 'REVEAL_LINE',
      payload: { line, column },
      monaco,
      editors
    })
  })

  plugin.on('editor', 'revealRange', (startLineNumber, startColumn, endLineNumber, endColumn) => {
    dispatch({
      type: 'REVEAL_RANGE',
      payload: {
        startLineNumber,
        startColumn,
        endLineNumber,
        endColumn
      },
      monaco,
      editors
    })
  })

  plugin.on('editor', 'focus', () => {
    dispatch({
      type: 'FOCUS',
      payload: {},
      monaco,
      editors
    })
  })

  plugin.on('editor', 'setFontSize', (size) => {
    dispatch({
      type: 'SET_FONTSIZE',
      payload: { size },
      monaco,
      editors
    })
  })

  plugin.on('settings', 'textWrapChoiceUpdated', (wrap) => {
    dispatch({
      type: 'SET_WORDWRAP',
      payload: { wrap },
      monaco,
      editors
    })
  })
}
