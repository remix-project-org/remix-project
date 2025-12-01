'use strict'

import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done, 'http://127.0.0.1:8080', true)
  },

  'Should load external types (axios) and show autocomplete #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .addFile('scripts/test_axios.ts', { content: testAxiosScript })
      .openFile('scripts/test_axios.ts')
      .waitForElementVisible('#editorView', 20000)
      .pause(15000) 
      .execute(function () {
        const win = window as any
        if (!win.monaco || !win.monaco.editor) return false

        const editors = win.monaco.editor.getEditors()
        const activeEditor = editors.find((e: any) => {
          const model = e.getModel()
          return model && model.uri.toString().includes('test_axios.ts')
        })

        if (activeEditor) {
          activeEditor.focus()
          const model = activeEditor.getModel()
          const lastLine = model.getLineCount()
          const lastCol = model.getLineMaxColumn(lastLine)
          activeEditor.setPosition({ lineNumber: lastLine, column: lastCol })
          activeEditor.trigger('keyboard', 'type', { text: "\naxios" })
          activeEditor.trigger('keyboard', 'type', { text: "." })
          activeEditor.trigger('keyboard', 'editor.action.triggerSuggest', {})
          return true
        }
        return false
      })
      .pause(2000)
      .waitForElementVisible('.suggest-widget', 15000)
      .waitForElementVisible('.monaco-list-row', 5000)
      .waitForElementContainsText('.suggest-widget', 'get', 5000)
      .waitForElementContainsText('.suggest-widget', 'create', 5000)
  },

  'Should provide autocomplete for local imports #group1': function (browser: NightwatchBrowser) {
    browser
      .addFile('scripts/localLib.ts', { content: localLibScript })
      .addFile('scripts/localConsumer.ts', { content: localConsumerScript })
      .openFile('scripts/localConsumer.ts')
      .waitForElementVisible('#editorView', 20000)
      .pause(2000)
      .execute(function () {
        const win = window as any
        if (!win.monaco) return false
        const editors = win.monaco.editor.getEditors()
        const activeEditor = editors.find((e: any) => {
          const model = e.getModel()
          return model && model.uri.toString().includes('localConsumer.ts')
        })

        if (activeEditor) {
          activeEditor.focus()
          const model = activeEditor.getModel()
          const lastLine = model.getLineCount()
          const lastCol = model.getLineMaxColumn(lastLine)
          activeEditor.setPosition({ lineNumber: lastLine, column: lastCol })
          activeEditor.trigger('keyboard', 'type', { text: "\nHelper" })
          activeEditor.trigger('keyboard', 'type', { text: "." })
          activeEditor.trigger('keyboard', 'editor.action.triggerSuggest', {})
          return true
        }
        return false
      })
      .pause(2000)
      .waitForElementVisible('.suggest-widget', 15000)
      .waitForElementVisible('.monaco-list-row', 5000)
      .waitForElementContainsText('.suggest-widget', 'myLocalFunction', 5000)
  }
}

const testAxiosScript = `
import axios from 'axios';
// Test Start`

const localLibScript = `
export const myLocalFunction = () => { return "Local"; }`

const localConsumerScript = `
import * as Helper from './localLib';
// Test Start`