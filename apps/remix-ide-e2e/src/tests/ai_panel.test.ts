'use strict'

import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'
import examples from '../examples/example-contracts'

const sources = [
  { 'Untitled.sol': { content: examples.ballot.content } }
]

const tests = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },
  '@sources': function () {
    return sources
  },

  'Add Ballot': function (browser: NightwatchBrowser) {
    browser
      .addFile('Untitled.sol', sources[0]['Untitled.sol'])
  },
  // Conversation starter button with data id 'explain-editor' doesn't exist anymore
  'Should contain message starters #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('remixaiassistant')
      .waitForElementVisible('*[data-id="remix-ai-assistant-starter-beginner-0"]')
      .click('*[data-id="remix-ai-assistant-starter-beginner-0"]')
      .waitForElementVisible('*[data-id="remix-ai-assistant"]')
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
      })

  },
  'Should add a bad contract and explain using RemixAI #group1': function (browser: NightwatchBrowser) {
    browser
      .assistantClearChat()
      .waitForCompilerLoaded()
      .addFile('Bad.sol', { content: 'errors' })
      .clickLaunchIcon('solidity')
      .waitForElementVisible('*[data-id="ask-remix-ai-button"]')
      .click('*[data-id="ask-remix-ai-button"]')
      .waitForElementVisible('*[data-id="remix-ai-assistant"]')
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//div[contains(@class,"chat-bubble") and contains(.,"Explain the error")]'
      })
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']"
      })
  },
  'Should select the AI assistant provider #group1': function (browser: NightwatchBrowser) {
    browser
      .assistantClearChat()
      .waitForCompilerLoaded()
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .waitForElementVisible('*[data-id="remix-ai-assistant"]')
      .assistantSetProvider('mistralai')
  },

  'Should add current file as context to the AI assistant #group1': function (browser: NightwatchBrowser) {
    browser
      .addFile('Untitled.sol', sources[0]['Untitled.sol'])
      .openFile('Untitled.sol')
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      // .waitForElementPresent('*[data-id="remix-ai-assistant-ready"]')
      .assistantAddContext('currentFile')
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//*[@data-id="composer-ai-add-context"]'
      })
      .assert.containsText('*[data-id="composer-ai-add-context"]', 'Current File')
  },
  'Should add workspace as context to the AI assistant #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementPresent('*[data-id="remix-ai-assistant-ready"]')
      .assistantAddContext('workspace')
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//*[@data-id="composer-ai-add-context"]'
      })
      .assert.containsText('*[data-id="composer-ai-add-context"]', 'Workspace')
  },

  'Should add opened files as context to the AI assistant #group1': function (browser: NightwatchBrowser) {
    browser
      .assistantClearChat()
      .waitForCompilerLoaded()
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .waitForElementPresent('*[data-id="remix-ai-assistant-ready"]')
      .addFile('anotherFile.sol', sources[0]['Untitled.sol'])
      .assistantAddContext('openedFiles')
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//*[@data-id="composer-ai-add-context"]'
      })
      .assert.containsText('*[data-id="composer-ai-add-context"]', 'Open Files')
  },

  'Should generate new workspace contract code with the AI assistant #group1': function (browser: NightwatchBrowser) {
    browser
      .assistantClearChat()
      .waitForCompilerLoaded()
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .waitForElementPresent('*[data-id="remix-ai-assistant-ready"]')
      .assistantGenerate('a simple ERC20 contract', 'anthropic')
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//div[contains(@class,"chat-bubble") and contains(.,"New workspace created:")]',
        timeout: 60000
      })
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']"
      })
  },
  'Should lead to Workspace generation with the AI assistant #group1': function (browser: NightwatchBrowser) {
    browser
      .assistantClearChat()
      .waitForCompilerLoaded()
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .waitForElementPresent('*[data-id="remix-ai-assistant-ready"]')
      .assistantWorkspace('comment all function', 'mistralai')
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//div[contains(@class,"chat-bubble") and (contains(.,"Modified Files") or contains(.,"No Changes applied") or contains(.,"No files modified"))]',
        timeout: 60000
      })
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']"
      })
  },
  'Should create a new workspace using the AI assistant button in the composer #group1': function (browser: NightwatchBrowser) {
    browser
      .assistantClearChat()
      .waitForCompilerLoaded()
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .waitForElementVisible('*[data-id="remix-ai-workspace-generate"]')
      .click('*[data-id="remix-ai-workspace-generate"]')
      .waitForElementVisible('*[data-id="generate-workspaceModalDialogModalBody-react"]')
      .click('*[data-id="modalDialogCustomTextarea"]')
      .setValue('*[data-id="modalDialogCustomTextarea"]', 'a simple ERC20 contract')
      .click('*[data-id="generate-workspace-modal-footer-ok-react"]')
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//div[contains(@class,"chat-bubble") and contains(.,"New workspace created:")]',
        timeout: 60000
      })
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']"
      })
  },
  'Workspace generation with all AI assistant provider #group1': function (browser: NightwatchBrowser) {
    browser
      .assistantClearChat()
      .waitForCompilerLoaded()
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .waitForElementPresent('*[data-id="remix-ai-assistant-ready"]')
      .assistantWorkspace('remove all comments', 'openai')
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//div[contains(@class,"chat-bubble") and (contains(.,"Modified Files") or contains(.,"No Changes applied") or contains(.,"No files modified"))]',
        timeout: 60000
      })
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']"
      })

      .assistantClearChat()
      .waitForCompilerLoaded()
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .waitForElementPresent('*[data-id="remix-ai-assistant-ready"]')
      .assistantWorkspace('remove all comments', 'anthropic')
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//div[contains(@class,"chat-bubble") and (contains(.,"Modified Files") or contains(.,"No Changes applied") or contains(.,"No files modified"))]',
        timeout: 60000
      })
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']"
      })
  },
  "Should close the AI assistant #group1": function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="movePluginToLeft"]')
      .clickLaunchIcon('filePanel')
      .waitForElementNotVisible('*[data-id="remix-ai-assistant"]', 5000)
  },
}

const branch = process.env.CIRCLE_BRANCH
const runTestsConditions = branch && (branch === 'master' || branch === 'remix_live' || branch.includes('remix_beta') || branch.includes('metamask'))

const checkBrowserIsChrome = function (browser: NightwatchBrowser) {
  return browser.browserName.indexOf('chrome') > -1
}

if (!checkBrowserIsChrome(browser)) {
  module.exports = {}
} else {
  module.exports = {
    ...(branch ? (runTestsConditions ? tests : {}) : tests)
  };
}
