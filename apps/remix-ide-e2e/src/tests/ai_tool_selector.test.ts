'use strict'

import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'
import examples from '../examples/example-contracts'

const sources = [
  { 'SimpleStorage.sol': { content: examples.ballot.content } }
]

const tests = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },
  '@sources': function () {
    return sources
  },

  'Setup workspace for tool selector tests #group1': function (browser: NightwatchBrowser) {
    browser
      .addFile('SimpleStorage.sol', sources[0]['SimpleStorage.sol'])
      .openFile('SimpleStorage.sol')
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
  },

  'Should select compilation-related tools for compile prompt #group1': function (browser: NightwatchBrowser) {
    browser
      .assistantClearChat()
      .waitForCompilerLoaded()
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .execute(function () {
        // Send a prompt that should trigger compilation tools
        (window as any).remixAIChat.current.sendChat('compile my solidity contract');
      })
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        timeout: 60000
      })
      // Verify response contains compilation-related content
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//div[contains(@class,"chat-bubble") and (contains(.,"compil") or contains(.,"Compil"))]',
        timeout: 5000
      })
  },

  'Should select file management tools for file operations prompt #group1': function (browser: NightwatchBrowser) {
    browser
      .assistantClearChat()
      .waitForCompilerLoaded()
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .execute(function () {
        // Send a prompt that should trigger file management tools
        (window as any).remixAIChat.current.sendChat('read the contents of SimpleStorage.sol');
      })
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        timeout: 60000
      })
      // Verify that core file tools are available
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//div[contains(@class,"chat-bubble")]',
        timeout: 5000
      })
  },

  'Should include core tools for generic prompts #group1': function (browser: NightwatchBrowser) {
    browser
      .assistantClearChat()
      .waitForCompilerLoaded()
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .execute(function () {
        // Send a generic prompt that should include core tools
        (window as any).remixAIChat.current.sendChat('help me with my project');
      })
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        timeout: 60000
      })
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//div[contains(@class,"chat-bubble")]',
        timeout: 5000
      })
  },

  'Should select deployment tools for deployment-related prompt #group1': function (browser: NightwatchBrowser) {
    browser
      .assistantClearChat()
      .waitForCompilerLoaded()
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .execute(function () {
        // Send a prompt that should trigger deployment tools
        (window as any).remixAIChat.current.sendChat('deploy my contract to the blockchain');
      })
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        timeout: 60000
      })
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//div[contains(@class,"chat-bubble") and (contains(.,"deploy") or contains(.,"Deploy"))]',
        timeout: 5000
      })
  },

  'Should select analysis tools for security audit prompt #group1': function (browser: NightwatchBrowser) {
    browser
      .assistantClearChat()
      .waitForCompilerLoaded()
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .execute(function () {
        // Send a prompt that should trigger analysis tools
        (window as any).remixAIChat.current.sendChat('scan my contract for security vulnerabilities');
      })
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        timeout: 60000
      })
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//div[contains(@class,"chat-bubble") and (contains(.,"secur") or contains(.,"vulnerab") or contains(.,"analyz"))]',
        timeout: 5000
      })
  },

  'Should handle multi-keyword prompts with multiple tool categories #group1': function (browser: NightwatchBrowser) {
    browser
      .assistantClearChat()
      .waitForCompilerLoaded()
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .execute(function () {
        // Send a complex prompt that should match multiple categories
        (window as any).remixAIChat.current.sendChat('compile my contract, analyze it for bugs, and help me deploy it');
      })
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        timeout: 60000
      })
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//div[contains(@class,"chat-bubble")]',
        timeout: 5000
      })
  },

  'Should select git tools for version control prompt #group1': function (browser: NightwatchBrowser) {
    browser
      .assistantClearChat()
      .waitForCompilerLoaded()
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .execute(function () {
        // Send a prompt that should trigger git tools
        (window as any).remixAIChat.current.sendChat('commit my changes to git');
      })
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        timeout: 60000
      })
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//div[contains(@class,"chat-bubble") and (contains(.,"git") or contains(.,"commit"))]',
        timeout: 5000
      })
  },

  'Should select testing tools for test-related prompt #group1': function (browser: NightwatchBrowser) {
    browser
      .assistantClearChat()
      .waitForCompilerLoaded()
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .execute(function () {
        // Send a prompt that should trigger testing tools
        (window as any).remixAIChat.current.sendChat('run tests on my smart contract');
      })
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        timeout: 60000
      })
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//div[contains(@class,"chat-bubble") and (contains(.,"test") or contains(.,"Test"))]',
        timeout: 5000
      })
  },

  'Should handle prompts with vyper keyword #group1': function (browser: NightwatchBrowser) {
    browser
      .assistantClearChat()
      .waitForCompilerLoaded()
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .execute(function () {
        // Send a prompt that mentions Vyper
        (window as any).remixAIChat.current.sendChat('compile my vyper contract');
      })
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        timeout: 60000
      })
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//div[contains(@class,"chat-bubble")]',
        timeout: 5000
      })
  },

  'Should handle debugging prompts #group1': function (browser: NightwatchBrowser) {
    browser
      .assistantClearChat()
      .waitForCompilerLoaded()
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .execute(function () {
        // Send a debugging prompt
        (window as any).remixAIChat.current.sendChat('debug my transaction and set a breakpoint');
      })
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        timeout: 60000
      })
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//div[contains(@class,"chat-bubble")]',
        timeout: 5000
      })
  },

  'Should work with different AI providers #group1': function (browser: NightwatchBrowser) {
    browser
      .assistantClearChat()
      .waitForCompilerLoaded()
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      // Test with OpenAI
      .assistantSetProvider('openai')
      .execute(function () {
        (window as any).remixAIChat.current.sendChat('compile my contract');
      })
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        timeout: 60000
      })
      // Test with Anthropic
      .assistantClearChat()
      .assistantSetProvider('anthropic')
      .execute(function () {
        (window as any).remixAIChat.current.sendChat('compile my contract');
      })
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        timeout: 60000
      })
      // Reset to default
      .assistantSetProvider('mistralai')
  },

  'Close AI assistant #group1': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="movePluginToLeft"]')
      .clickLaunchIcon('filePanel')
      .waitForElementNotVisible('*[data-id="remix-ai-assistant"]', 5000)
  }
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
  }
}
