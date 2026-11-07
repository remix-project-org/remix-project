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
      .assistantWaitForReady()
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
      })

  },
  'Should add a bad contract and fix it with RemixAI #group1': function (browser: NightwatchBrowser) {
    browser
      .assistantClearChat()
      .waitForCompilerLoaded()
      .addFile('Bad.sol', { content: 'errors' })
      .clickLaunchIcon('solidity')
      .waitForElementVisible('*[data-id="ask-remix-ai-button"]')
      .click('*[data-id="ask-remix-ai-button"]')
      .assistantWaitForReady()
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//div[contains(@class,"chat-bubble") and contains(.,"Fix the error")]'
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
      .assistantWaitForReady()
      .assistantSetProvider('mistralai')
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
      .assistantGenerate('a simple ERC20 contract', 'mistralai')
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
  'Should fill the input from the + menu and create a new workspace with /generate #group1': function (browser: NightwatchBrowser) {
    browser
      .assistantClearChat()
      .waitForCompilerLoaded()
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .waitForElementVisible('*[data-id="remix-ai-composer-plus"]')
      .click('*[data-id="remix-ai-composer-plus"]')
      .waitForElementVisible('*[data-id="shortcut-btn-code"]')
      .click('*[data-id="shortcut-btn-code"]')
      .waitForElementVisible('*[data-id="shortcut-prompt-0"]')
      .click('*[data-id="shortcut-prompt-0"]')
      .assert.valueContains('*[data-id="remix-ai-prompt-input"]', 'ERC20')
      .clearValue('*[data-id="remix-ai-prompt-input"]')
      .setValue('*[data-id="remix-ai-prompt-input"]', '/generate a simple ERC20 contract')
      .waitForElementVisible('*[data-id="remix-ai-composer-send-btn"]')
      .click('*[data-id="remix-ai-composer-send-btn"]')
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//div[contains(@class,"chat-bubble") and contains(.,"New workspace created:")]',
        timeout: 60000
      })
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']"
      })
  }
}

const branch = process.env.CIRCLE_BRANCH
const runTestsConditions = branch && (branch === 'master' || branch === 'remix_live' || branch.includes('remix_beta') || branch.includes('metamask'))

const checkBrowserIsChrome = function (browser: NightwatchBrowser) {
  return browser.browserName.indexOf('chrome') > -1
}

/*
if (!checkBrowserIsChrome(browser)) {
  module.exports = {}
} else {
  module.exports = {
    ...(branch ? (runTestsConditions ? tests : {}) : tests)
  };
}*/

module.exports = {}
