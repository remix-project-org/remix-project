'use strict'

import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'
const regExp = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done, 'http://127.0.0.1:8080', true)
  },

  // ==================== GROUP 1: Basic Conversation Operations ====================

  'Should open chat history sidebar #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 60000
      })
      .waitForElementVisible('*[data-id="toggle-history-btn"]')
      .click('*[data-id="toggle-history-btn"]')
      .assert.containsText('*[data-id="chat-history-sidebar-title"]', 'Chat history')
      .assert.containsText('*[data-id="no-conversations-msg"]', 'No conversations yet')
  },

  'Should create a new conversation #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="chat-history-back-btn"]')
      .click('*[data-id="chat-history-back-btn"]')
      .pause(1000)
      // .click('*[data-id="new-chat-btn new-conversation-btn"]')
      .waitForElementVisible('*[data-id="remix-ai-prompt-input"]')
      .setValue('*[data-id="remix-ai-prompt-input"]', 'Hello, this is my first message')
      .click('*[data-id="remix-ai-composer-send-btn"]')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .waitForElementVisible('*[data-id="ai-user-chat-bubble"]')
      .assert.containsText('*[data-id="ai-user-chat-bubble"]', 'Hello, this is my first message')
  },

  'Should display conversation metadata #group1': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="toggle-history-btn"]')
      .pause(3000)
      .execute(function () {
        const conversationItem = document.querySelector('[data-id^="conversation-item-"]')
        return conversationItem ? conversationItem.getAttribute('data-id') : null
      }, [], function (result) {
        const conversationId = result.value ? (result.value as string).replace('conversation-item-', '') : ''
        console.log('Testing conversation metadata for conversation ID:', conversationId)
        browser
          .waitForElementVisible(`*[data-id="conversation-item-${conversationId}"]`, 5000)
          .assert.textContains(`*[data-id="conversation-item-${conversationId}"] .conversation-meta`, 'message')
          .assert.containsText(`*[data-id="conversation-item-${conversationId}"] .conversation-meta`, 'Just now')
      })
  },

  'Should send multiple messages in a conversation #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="chat-history-back-btn"]')
      .click('*[data-id="chat-history-back-btn"]')
      .waitForElementVisible('*[data-assist-btn="assistant-selector-btn"]')
      .waitForElementVisible('*[data-id="remix-ai-prompt-input"]')
      .clearValue('*[data-id="remix-ai-prompt-input"]')
      .setValue('*[data-id="remix-ai-prompt-input"]', 'Second message')
      .click('*[data-id="remix-ai-composer-send-btn"]')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .pause(500)
      .clearValue('*[data-id="remix-ai-prompt-input"]')
      .setValue('*[data-id="remix-ai-prompt-input"]', 'Third message')
      .click('*[data-id="remix-ai-composer-send-btn"]')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .pause(1000)
      .waitForElementVisible('*[data-id="new-chat-btn new-conversation-btn"]')
      .click('*[data-id="new-chat-btn new-conversation-btn"]')
      .waitForElementVisible('*[data-id="toggle-history-btn"]')
      .pause(1000)
      .click('*[data-id="toggle-history-btn"]')
      .execute(function () {
        const conversationItem = document.querySelector('[data-id^="conversation-item-"]')
        return conversationItem ? conversationItem.getAttribute('data-id') : null
      }, [], function (result) {
        console.log('Testing conversation metadata after sending multiple messages:', result.value)
        const conversationId = result.value ? (result.value as string).replace('conversation-item-', '') : ''
        browser
          .pause(500)
          .waitForElementVisible(`*[data-id="conversation-item-${conversationId}"]`)
          .assert.textContains(`*[data-id="conversation-item-${conversationId}"] .conversation-meta`, '6 messages')
          .assert.containsText(`*[data-id="conversation-item-${conversationId}"] .conversation-meta`, 'Just now')
      })
  },

  'Should switch between conversations #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="chat-history-back-btn"]')
      .click('*[data-id="chat-history-back-btn"]')
      .waitForElementVisible('*[data-id="new-chat-btn new-conversation-btn"]')
      .click('*[data-id="new-chat-btn new-conversation-btn"]')
      .pause(1000)
      .clearValue('*[data-id="remix-ai-prompt-input"]')
      .setValue('*[data-id="remix-ai-prompt-input"]', 'This is a different conversation')
      .click('*[data-id="remix-ai-composer-send-btn"]')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .click('*[data-id="new-chat-btn new-conversation-btn"]')
      .click('*[data-id="toggle-history-btn"]')
      .pause(1000)
      // Get conversation IDs
      .execute(function () {
        const items = document.querySelectorAll('[data-id^="conversation-item-"]')
        return Array.from(items).map(item => item.getAttribute('data-id')?.replace('conversation-item-', ''))
      }, [], function (result) {
        const ids = result.value as string[]
        const validIds = ids.filter(x => regExp.test(x))

        browser
          .click(`*[data-id="conversation-item-${validIds[0]}"]`)
          .pause(1000)
          .waitForElementVisible('*[data-id="ai-response-chat-bubble-section"]')
          .assert.textContains('*[data-id="ai-user-chat-bubble"]', 'This is a different conversation')
          .click('*[data-id="toggle-history-btn"]')
          .pause(500)
          .click(`*[data-id="conversation-item-${validIds[1]}"]`)
          .pause(1000)
          .waitForElementVisible('*[data-id="ai-response-chat-bubble-section"]')
          .pause(500)
          .assert.textContains('*[data-id="ai-user-chat-bubble"]', 'Hello, this is my first message')
      })
  },

  'Should archive a conversation #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="archive-chat-btn"]')
      .click('*[data-id="archive-chat-btn"]')
      .waitForElementVisible(`*[data-id="toggle-history-btn"]`)
      .click(`*[data-id="toggle-history-btn"]`)
      .waitForElementVisible('*[data-id="toggle-archived-btn"]', 5000)
      .assert.textContains('*[data-id="toggle-archived-btn"]', 'Archived (1)')
  },

  'Should unarchive a conversation #group1': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="toggle-archived-btn"]')
      .pause(500)
      .waitForElementVisible('*[data-id="conversation-item-title"]', 500)
      .click('*[data-id="conversation-item-title"]')
      .waitForElementVisible('*[data-id="ai-response-chat-bubble-section"]')
      .pause(500)
      .assert.textContains('*[data-id="ai-user-chat-bubble"]', 'Hello, this is my first message')
  },

  'Should delete a conversation #group1': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="new-chat-btn new-conversation-btn"]')
      .waitForElementVisible('*[data-id="remix-ai-prompt-input"]')
      .setValue('*[data-id="remix-ai-prompt-input"]', 'Conversation to be deleted')
      .click('*[data-id="remix-ai-composer-send-btn"]')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .pause(500)
      .click('*[data-id="toggle-history-btn"]')
      .click('*[data-id="toggle-archived-btn"]')
      .execute(function () {
        const items = document.querySelectorAll('[data-id^="conversation-item-"]')
        return items.length > 0 ? items[0].getAttribute('data-id')?.replace('conversation-item-', '') : null
      }, [], function (result) {
        const conversationId = result.value as string
        console.log('Testing conversation deletion for conversation ID:', conversationId, result)
        browser
          .pause(1000)
          .moveToElement(`*[data-id="conversation-item-${conversationId}"]`, 30, 20)
          .waitForElementVisible(`*[data-id="conversation-menu-${conversationId}"]`, 5000)
          .click(`*[data-id="conversation-menu-${conversationId}"]`)
          .pause(300)
          .waitForElementVisible('.conversation-menu', 5000)
          .click('.conversation-menu .conversation-menu-item:last-child')
          .pause(500)
          .acceptAlert()
          .pause(1000)
          .waitForElementNotPresent(`*[data-id="conversation-item-${conversationId}"]`, 5000)
      })
  },

  'Should persist conversations after page refresh #group1': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        const items = document.querySelectorAll('[data-id^="conversation-item-"]')
        return Array.from(items).map(item => item.getAttribute('data-id')?.replace('conversation-item-', ''))
      }, [], function (result) {
        const conversationIds = (result.value as string[]).filter(x => regExp.test(x))

        browser
          .click(`*[data-id="conversation-item-${conversationIds[0]}"]`)
      })
      .refreshPage()
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .waitForElementVisible('*[data-id="toggle-history-btn"]')
      .click('*[data-id="toggle-history-btn"]')
      .pause(1000)
      .execute(function () {
        const items = document.querySelectorAll('[data-id^="conversation-item-"]')
        return items.length
      }, [], function (result) {
        browser
          .assert.equal(result.value, 6, 'All 6 conversations persisted after refresh')
      })
  },
  'Should search conversations by title, clear search and show all conversations #group1': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="search-conversations-input"]')
      .setValue('*[data-id="search-conversations-input"]', 'Hello, this')
      .waitForElementVisible('*[data-id="conversation-item-title"]')
      .assert.textContains('*[data-id="conversation-item-title"]', 'Hello, this is my first message')
      .assert.not.textContains('*[data-id="conversation-item-title"]', 'This is a different conversation')
      .clearValue('*[data-id="search-conversations-input"]')
      .pause(500)
      .execute(function () {
        const items = document.querySelectorAll('[data-id^="conversation-item-"]')
        return items.length
      }, [], function (result) {
        browser
          .assert.equal(result.value, 3, 'All 3 conversations shown after clearing search')
      })
      .click('*[data-id="chat-history-back-btn"]')
  },
  'Should show floating chat history when maximized #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="maximizeRightSidePanel"]')
      .click('*[data-id="maximizeRightSidePanel"]')
      .pause(500)
      .waitForElementVisible('*[data-id="chat-history-sidebar-maximized"]', 500)
      .assert.visible('*[data-id="floating-chat-heading"]')
      .assert.containsText('*[data-id="floating-chat-heading"]', 'Chat history')
  },

  'Should seed many conversations into IndexedDB for scroll test #group2': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      // Seed 25 conversations
      .executeAsync(function (done) {
        const request = indexedDB.open('RemixAIChatHistory', 1)
        request.onerror = () => done(false)
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('conversations', 'readwrite')
          const store = tx.objectStore('conversations')
          const now = Date.now()
          for (let i = 0; i < 25; i++) {
            store.put({
              id: `scroll-test-conv-${i}`,
              title: `Scroll Test Conversation ${i + 1}`,
              preview: `Preview text for scroll test conversation number ${i + 1}`,
              createdAt: now - (i * 60000),
              updatedAt: now - (i * 60000),
              lastAccessedAt: now - (i * 60000),
              messageCount: 2,
              archived: false
            })
          }
          tx.oncomplete = () => done(true)
          tx.onerror = () => done(false)
        }
        // DB may not exist yet; create it with the right schema
        request.onupgradeneeded = (event: any) => {
          const db = event.target.result
          if (!db.objectStoreNames.contains('conversations')) {
            const store = db.createObjectStore('conversations', { keyPath: 'id' })
            store.createIndex('createdAt', 'createdAt', { unique: false })
            store.createIndex('archived', 'archived', { unique: false })
            store.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false })
          }
          if (!db.objectStoreNames.contains('messages')) {
            const msgStore = db.createObjectStore('messages', { keyPath: 'id' })
            msgStore.createIndex('conversationId', 'conversationId', { unique: false })
            msgStore.createIndex('timestamp', 'timestamp', { unique: false })
          }
        }
      }, [], function (result) {
        browser.assert.equal(result.value, true, 'Conversations seeded into IndexedDB successfully')
      })
  },

  'Should show all seeded conversations in sidebar after reload #group2': function (browser: NightwatchBrowser) {
    browser
      .refreshPage()
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .waitForElementVisible('*[data-id="toggle-history-btn"]')
      .click('*[data-id="toggle-history-btn"]')
      .pause(1000)
      .execute(function () {
        const items = document.querySelectorAll('[data-id^="conversation-item-"]')
        return items.length
      }, [], function (result) {
        browser.assert.ok((result.value as number) >= 25, `At least 25 conversation items rendered, got ${result.value}`)
      })
  },

  'Should scroll conversation list in non-maximized sidebar #group2': function (browser: NightwatchBrowser) {
    browser
      // Verify the sidebar body overflows (content taller than the visible area)
      .execute(function () {
        const sidebarBody = document.querySelector('.sidebar-body') as HTMLElement
        if (!sidebarBody) return { error: 'sidebar-body not found' }
        return {
          scrollHeight: sidebarBody.scrollHeight,
          clientHeight: sidebarBody.clientHeight,
          overflows: sidebarBody.scrollHeight > sidebarBody.clientHeight
        }
      }, [], function (result) {
        const info = result.value as any
        browser.assert.ok(!info.error, `sidebar-body element found`)
        browser.assert.ok(info.overflows, `sidebar-body overflows: scrollHeight(${info.scrollHeight}) > clientHeight(${info.clientHeight})`)
      })
      // Scroll to the bottom and verify scrollTop actually moved
      .execute(function () {
        const sidebarBody = document.querySelector('.sidebar-body') as HTMLElement
        if (!sidebarBody) return -1
        sidebarBody.scrollTop = sidebarBody.scrollHeight
        return sidebarBody.scrollTop
      }, [], function (result) {
        browser.assert.ok((result.value as number) > 0, `Sidebar scrolled: scrollTop is ${result.value} (> 0)`)
      })
      // Scroll back to top and verify
      .execute(function () {
        const sidebarBody = document.querySelector('.sidebar-body') as HTMLElement
        if (!sidebarBody) return -1
        sidebarBody.scrollTop = 0
        return sidebarBody.scrollTop
      }, [], function (result) {
        browser.assert.equal(result.value, 0, 'Sidebar scrolled back to top')
      })
  },

  'Should scroll conversation list in floating chat history (full-screen mode) #group2': function (browser: NightwatchBrowser) {
    browser
      // Close the non-maximized sidebar first to get back to chat view
      .click('*[data-id="chat-history-back-btn"]')
      .pause(500)
      // Go full-screen — toggle-history-btn is hidden by design in this mode
      .waitForElementVisible('*[data-id="maximizeRightSidePanel"]')
      .click('*[data-id="maximizeRightSidePanel"]')
      .pause(500)
      .waitForElementVisible('*[data-id="chat-history-sidebar-maximized"]', 5000)
      // Verify the floating sidebar-body overflows with many conversations
      .execute(function () {
        const sidebar = document.querySelector('[data-id="chat-history-sidebar-maximized"]')
        const sidebarBody = sidebar ? sidebar.querySelector('.sidebar-body') as HTMLElement : null
        if (!sidebarBody) return { error: 'sidebar-body not found inside chat-history-sidebar-maximized' }
        return {
          scrollHeight: sidebarBody.scrollHeight,
          clientHeight: sidebarBody.clientHeight,
          overflows: sidebarBody.scrollHeight > sidebarBody.clientHeight
        }
      }, [], function (result) {
        const info = result.value as any
        browser.assert.ok(!info.error, `floating sidebar-body found: ${info.error || 'ok'}`)
        browser.assert.ok(info.overflows, `Floating sidebar-body overflows: scrollHeight(${info.scrollHeight}) > clientHeight(${info.clientHeight})`)
      })
      // Confirm programmatic scrolling works
      .execute(function () {
        const sidebar = document.querySelector('[data-id="chat-history-sidebar-maximized"]')
        const sidebarBody = sidebar ? sidebar.querySelector('.sidebar-body') as HTMLElement : null
        if (!sidebarBody) return -1
        sidebarBody.scrollTop = sidebarBody.scrollHeight
        return sidebarBody.scrollTop
      }, [], function (result) {
        browser.assert.ok((result.value as number) > 0, `Floating sidebar scrolled: scrollTop is ${result.value} (> 0)`)
      })
  },
  'Should update lastAccessedAt on conversation load #group2': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="maximizeRightSidePanel"]')
      .pause(500)
      .click('*[data-id="toggle-history-btn"]')
      .pause(500)
      .execute(function () {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        const items = Array.from(document.querySelectorAll('[data-id^="conversation-item-"]'))
          .filter(el => uuidRegex.test((el.getAttribute('data-id') || '').replace('conversation-item-', '')))
        return items.length > 1 ? [
          (items[0].getAttribute('data-id') || '').replace('conversation-item-', ''),
          (items[items.length - 1].getAttribute('data-id') || '').replace('conversation-item-', '')
        ] : null
      }, [], function (result) {
        const ids = result.value as string[]
        if (!ids || ids.length < 2) return

        const newestId = ids[0]
        const oldestId = ids[1]

        browser
          // Load oldest conversation
          .click(`*[data-id="conversation-item-${oldestId}"]`)
          .pause(1000)
          // Verify it moved to top
          .execute(function () {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            const firstItem = Array.from(document.querySelectorAll('[data-id^="conversation-item-"]'))
              .find(el => uuidRegex.test((el.getAttribute('data-id') || '').replace('conversation-item-', '')))
            return firstItem ? (firstItem.getAttribute('data-id') || '').replace('conversation-item-', '') : null
          }, [], function (topResult) {
            browser.assert.equal(
              topResult.value,
              oldestId,
              'Accessed conversation moved to top of list'
            )
          })
      })
  },
  'Should handle very long conversation titles #group3': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .click('*[data-id="new-chat-btn new-conversation-btn"]')
      .pause(500)
      .setValue(
        '*[data-id="remix-ai-prompt-input"]',
        'This is a very very skjflskdjflskdfsldkfjlskdjfssdfjlskdflsdkflsdkfjlsdjflksdflsdflsjdflskdfjlsdjflskdfjlsdfjlskdfjlsdfjlsjd long conversation title that should be truncated in the sidebar but show full text on hover or in the detail view'
      )
      .click('*[data-id="remix-ai-composer-send-btn"]')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        locateStrategy: 'xpath',
        timeout: 60000
      })
      .pause(1000)
      .click('*[data-id="toggle-history-btn"]')
      .pause(500)
      .execute(function () {
        const item = document.querySelector('[data-id^="conversation-item-"]')
        const title = item?.querySelector('.conversation-title')
        return {
          hasItem: item !== null,
          hasEllipsis: title ? window.getComputedStyle(title).textOverflow === 'ellipsis' : false
        }
      }, [], function (result) {
        const data = result.value as { hasItem: boolean; hasEllipsis: boolean }
        browser.assert.ok(data.hasItem, 'Long title conversation created')
        browser.click('*[data-id="chat-history-back-btn"]')
      })
  },

  'Should handle special characters in messages #group3': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="new-chat-btn new-conversation-btn"]')
      .pause(500)
      .clearValue('*[data-id="remix-ai-prompt-input"]')
      .setValue('*[data-id="remix-ai-prompt-input"]', '<script>alert("xss")</script>')
      .click('*[data-id="remix-ai-composer-send-btn"]')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        locateStrategy: 'xpath',
        timeout: 60000
      })
      .pause(1000)
      .execute(function () {
        // Check that script tag is not executed (innerHTML should be escaped)
        const bubbles = document.querySelectorAll('.chat-bubble.bubble-user')
        const lastBubble = bubbles[bubbles.length - 1]
        return lastBubble ? lastBubble.textContent : null
      }, [], function (result) {
        browser.assert.ok(
          result.value && (result.value as string).includes('<script>'),
          'Special characters are properly escaped'
        )
      })
  },

  'Should display conversation count #group3': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="toggle-history-btn"]')
      .pause(500)
      .waitForElementVisible('.sidebar-title', 5000)
      .assert.containsText('.sidebar-title', '2')
  },
}
