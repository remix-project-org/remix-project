'use strict'

import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

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
        timeout: 120000
      })
      .waitForElementVisible('*[data-id="toggle-history-btn"]', 10000)
      .click('*[data-id="toggle-history-btn"]')
      .assert.containsText('*[data-id="chat-history-sidebar-title"]', 'Chat history')
      .waitForElementVisible('.text-center.text-muted', 5000)
      .assert.containsText('.text-center.text-muted', 'No conversations yet')
      .pause()
  },

  'Should create a new conversation #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="new-conversation-btn"]', 5000)
      .click('*[data-id="new-conversation-btn"]')
      .pause(1000)
      .waitForElementVisible('*[data-id="remix-ai-prompt-input"]', 10000)
      .setValue('*[data-id="remix-ai-prompt-input"]', 'Hello, this is my first message')
      .click('*[data-id="remix-ai-composer-send-btn"]')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        locateStrategy: 'xpath',
        timeout: 60000
      })
      .pause(1000)
      .waitForElementVisible('*[data-id^="conversation-item-"]', 10000)
      .assert.containsText('*[data-id^="conversation-item-"]', 'Hello, this is my first message')
  },

  'Should display conversation metadata #group1': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        const conversationItem = document.querySelector('[data-id^="conversation-item-"]')
        return conversationItem ? conversationItem.getAttribute('data-id') : null
      }, [], function (result) {
        const conversationId = result.value ? (result.value as string).replace('conversation-item-', '') : ''

        browser
          .waitForElementVisible(`*[data-id="conversation-item-${conversationId}"]`, 5000)
          .assert.containsText(`*[data-id="conversation-item-${conversationId}"] .conversation-meta`, 'message')
          .assert.containsText(`*[data-id="conversation-item-${conversationId}"] .conversation-meta`, 'ago')
      })
  },

  'Should send multiple messages in a conversation #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="remix-ai-composer-input"]', 10000)
      .clearValue('*[data-id="remix-ai-composer-input"]')
      .setValue('*[data-id="remix-ai-composer-input"]', 'Second message')
      .click('*[data-id="remix-ai-composer-send-btn"]')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        locateStrategy: 'xpath',
        timeout: 60000
      })
      .pause(500)
      .clearValue('*[data-id="remix-ai-composer-input"]')
      .setValue('*[data-id="remix-ai-composer-input"]', 'Third message')
      .click('*[data-id="remix-ai-composer-send-btn"]')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        locateStrategy: 'xpath',
        timeout: 60000
      })
      .pause(1000)
      .execute(function () {
        const conversationItem = document.querySelector('[data-id^="conversation-item-"]')
        return conversationItem ? conversationItem.textContent : null
      }, [], function (result) {
        browser.assert.ok(
          result.value && (result.value as string).includes('message'),
          'Conversation item shows message count'
        )
      })
  },

  'Should switch between conversations #group1': function (browser: NightwatchBrowser) {
    let firstConversationId = ''
    let secondConversationId = ''

    browser
      // Create second conversation
      .waitForElementVisible('*[data-id="new-conversation-btn"]', 5000)
      .click('*[data-id="new-conversation-btn"]')
      .pause(1000)
      .clearValue('*[data-id="remix-ai-composer-input"]')
      .setValue('*[data-id="remix-ai-composer-input"]', 'This is a different conversation')
      .click('*[data-id="remix-ai-composer-send-btn"]')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        locateStrategy: 'xpath',
        timeout: 60000
      })
      .pause(1000)
      // Get conversation IDs
      .execute(function () {
        const items = document.querySelectorAll('[data-id^="conversation-item-"]')
        return Array.from(items).map(item => item.getAttribute('data-id')?.replace('conversation-item-', ''))
      }, [], function (result) {
        const ids = result.value as string[]
        firstConversationId = ids[1] || ids[0]
        secondConversationId = ids[0] || ids[1]

        browser
          // Switch to first conversation
          .click(`*[data-id="conversation-item-${firstConversationId}"]`)
          .pause(1000)
          .assert.cssClassPresent(`*[data-id="conversation-item-${firstConversationId}"]`, 'conversation-item-active')
          // Switch to second conversation
          .click(`*[data-id="conversation-item-${secondConversationId}"]`)
          .pause(1000)
          .assert.cssClassPresent(`*[data-id="conversation-item-${secondConversationId}"]`, 'conversation-item-active')
      })
  },

  'Should archive a conversation #group1': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        const items = document.querySelectorAll('[data-id^="conversation-item-"]')
        return items[0] ? items[0].getAttribute('data-id')?.replace('conversation-item-', '') : null
      }, [], function (result) {
        const conversationId = result.value as string

        browser
          .waitForElementVisible(`*[data-id="conversation-menu-${conversationId}"]`, 5000)
          .click(`*[data-id="conversation-menu-${conversationId}"]`)
          .pause(300)
          .waitForElementVisible('.conversation-menu', 5000)
          .click('.conversation-menu .conversation-menu-item:first-child')
          .pause(1000)
          .waitForElementNotPresent(`*[data-id="conversation-item-${conversationId}"]`, 5000)
          .waitForElementVisible('*[data-id="toggle-archived-btn"]', 5000)
          .assert.containsText('*[data-id="toggle-archived-btn"]', 'Archived (1)')
      })
  },

  'Should unarchive a conversation #group1': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="toggle-archived-btn"]')
      .pause(500)
      .waitForElementVisible('*[data-id^="conversation-item-"]', 5000)
      .execute(function () {
        const item = document.querySelector('[data-id^="conversation-item-"]')
        return item ? item.getAttribute('data-id')?.replace('conversation-item-', '') : null
      }, [], function (result) {
        const conversationId = result.value as string

        browser
          // Click on archived conversation to load it (should auto-unarchive)
          .click(`*[data-id="conversation-item-${conversationId}"]`)
          .pause(1000)
          // Switch back to active view
          .click('*[data-id="toggle-archived-btn"]')
          .pause(500)
          // Verify conversation is now in active list
          .waitForElementVisible(`*[data-id="conversation-item-${conversationId}"]`, 5000)
      })
  },

  'Should delete a conversation #group1': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        const items = document.querySelectorAll('[data-id^="conversation-item-"]')
        return items.length > 0 ? items[0].getAttribute('data-id')?.replace('conversation-item-', '') : null
      }, [], function (result) {
        const conversationId = result.value as string

        browser
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

  // ==================== GROUP 2: Persistence & Data Integrity ====================

  'Should persist conversations after page refresh #group2': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      // Clear existing conversations
      .assistantClearChat()
      .pause(1000)
      // Create 3 conversations
      .click('*[data-id="new-conversation-btn"]')
      .pause(500)
      .setValue('*[data-id="remix-ai-composer-input"]', 'First conversation content')
      .click('*[data-id="remix-ai-composer-send-btn"]')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        locateStrategy: 'xpath',
        timeout: 60000
      })
      .pause(1000)
      .click('*[data-id="new-conversation-btn"]')
      .pause(500)
      .clearValue('*[data-id="remix-ai-composer-input"]')
      .setValue('*[data-id="remix-ai-composer-input"]', 'Second conversation content')
      .click('*[data-id="remix-ai-composer-send-btn"]')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        locateStrategy: 'xpath',
        timeout: 60000
      })
      .pause(1000)
      .click('*[data-id="new-conversation-btn"]')
      .pause(500)
      .clearValue('*[data-id="remix-ai-composer-input"]')
      .setValue('*[data-id="remix-ai-composer-input"]', 'Third conversation content')
      .click('*[data-id="remix-ai-composer-send-btn"]')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        locateStrategy: 'xpath',
        timeout: 60000
      })
      .pause(1000)
      // Refresh page
      .refreshPage()
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .waitForElementVisible('*[data-id="chat-history-sidebar"]', 10000)
      .execute(function () {
        const items = document.querySelectorAll('[data-id^="conversation-item-"]')
        return items.length
      }, [], function (result) {
        browser.assert.equal(result.value, 3, 'All 3 conversations persisted after refresh')
      })
  },

  'Should persist messages after page refresh #group2': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        const item = document.querySelector('[data-id^="conversation-item-"]')
        return item ? item.getAttribute('data-id')?.replace('conversation-item-', '') : null
      }, [], function (result) {
        const conversationId = result.value as string

        browser
          // Load conversation and get message count
          .click(`*[data-id="conversation-item-${conversationId}"]`)
          .pause(1000)
          .execute(function () {
            const messages = document.querySelectorAll('.chat-bubble')
            return messages.length
          }, [], function (messageResult) {
            const messageCount = messageResult.value as number

            browser
              // Refresh page
              .refreshPage()
              .clickLaunchIcon('remixaiassistant')
              .waitForElementPresent({
                selector: "//*[@data-id='remix-ai-assistant-ready']",
                locateStrategy: 'xpath',
                timeout: 120000
              })
              .click(`*[data-id="conversation-item-${conversationId}"]`)
              .pause(1000)
              .execute(function () {
                const messages = document.querySelectorAll('.chat-bubble')
                return messages.length
              }, [], function (refreshResult) {
                browser.assert.equal(
                  refreshResult.value,
                  messageCount,
                  'All messages persisted after refresh'
                )
              })
          })
      })
  },

  'Should persist archived state after refresh #group2': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        const items = document.querySelectorAll('[data-id^="conversation-item-"]')
        return items[0] ? items[0].getAttribute('data-id')?.replace('conversation-item-', '') : null
      }, [], function (result) {
        const conversationId = result.value as string

        browser
          // Archive conversation
          .click(`*[data-id="conversation-menu-${conversationId}"]`)
          .pause(300)
          .click('.conversation-menu .conversation-menu-item:first-child')
          .pause(1000)
          .assert.containsText('*[data-id="toggle-archived-btn"]', 'Archived (1)')
          // Refresh page
          .refreshPage()
          .clickLaunchIcon('remixaiassistant')
          .waitForElementPresent({
            selector: "//*[@data-id='remix-ai-assistant-ready']",
            locateStrategy: 'xpath',
            timeout: 120000
          })
          .waitForElementVisible('*[data-id="toggle-archived-btn"]', 5000)
          .assert.containsText('*[data-id="toggle-archived-btn"]', 'Archived (1)')
          // Verify in archived view
          .click('*[data-id="toggle-archived-btn"]')
          .pause(500)
          .waitForElementVisible(`*[data-id="conversation-item-${conversationId}"]`, 5000)
      })
  },

  'Should update lastAccessedAt on conversation load #group2': function (browser: NightwatchBrowser) {
    browser
      // Switch back to active view
      .click('*[data-id="toggle-archived-btn"]')
      .pause(500)
      .execute(function () {
        const items = document.querySelectorAll('[data-id^="conversation-item-"]')
        return items.length > 1 ? [
          items[0].getAttribute('data-id')?.replace('conversation-item-', ''),
          items[items.length - 1].getAttribute('data-id')?.replace('conversation-item-', '')
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
            const firstItem = document.querySelector('[data-id^="conversation-item-"]')
            return firstItem ? firstItem.getAttribute('data-id')?.replace('conversation-item-', '') : null
          }, [], function (topResult) {
            browser.assert.equal(
              topResult.value,
              oldestId,
              'Accessed conversation moved to top of list'
            )
          })
      })
  },

  'Should handle IndexedDB deletion gracefully #group2': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        return new Promise((resolve) => {
          const request = indexedDB.deleteDatabase('RemixChatHistory')
          request.onsuccess = () => resolve(true)
          request.onerror = () => resolve(false)
        })
      })
      .pause(1000)
      .refreshPage()
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .waitForElementVisible('*[data-id="chat-history-sidebar"]', 10000)
      .assert.containsText('.text-center.text-muted', 'No conversations yet')
      // Create new conversation to verify database recreated
      .click('*[data-id="new-conversation-btn"]')
      .pause(500)
      .setValue('*[data-id="remix-ai-composer-input"]', 'Test after DB deletion')
      .click('*[data-id="remix-ai-composer-send-btn"]')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        locateStrategy: 'xpath',
        timeout: 60000
      })
      .pause(1000)
      .waitForElementVisible('*[data-id^="conversation-item-"]', 5000)
  },

  // ==================== GROUP 3: Search, Filter & Organization ====================

  'Should search conversations by title #group3': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .assistantClearChat()
      .pause(1000)
      // Create conversations with specific titles
      .click('*[data-id="new-conversation-btn"]')
      .pause(500)
      .setValue('*[data-id="remix-ai-composer-input"]', 'Smart contract deployment help')
      .click('*[data-id="remix-ai-composer-send-btn"]')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        locateStrategy: 'xpath',
        timeout: 60000
      })
      .pause(1000)
      .click('*[data-id="new-conversation-btn"]')
      .pause(500)
      .clearValue('*[data-id="remix-ai-composer-input"]')
      .setValue('*[data-id="remix-ai-composer-input"]', 'Debug transaction error')
      .click('*[data-id="remix-ai-composer-send-btn"]')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        locateStrategy: 'xpath',
        timeout: 60000
      })
      .pause(1000)
      .click('*[data-id="new-conversation-btn"]')
      .pause(500)
      .clearValue('*[data-id="remix-ai-composer-input"]')
      .setValue('*[data-id="remix-ai-composer-input"]', 'Test ERC20 contract')
      .click('*[data-id="remix-ai-composer-send-btn"]')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        locateStrategy: 'xpath',
        timeout: 60000
      })
      .pause(1000)
      // Search for "contract"
      .waitForElementVisible('*[data-id="search-conversations-input"]', 5000)
      .setValue('*[data-id="search-conversations-input"]', 'contract')
      .pause(500)
      .execute(function () {
        const items = document.querySelectorAll('[data-id^="conversation-item-"]')
        return items.length
      }, [], function (result) {
        browser.assert.equal(result.value, 2, 'Found 2 conversations containing "contract"')
      })
  },

  'Should clear search and show all conversations #group3': function (browser: NightwatchBrowser) {
    browser
      .clearValue('*[data-id="search-conversations-input"]')
      .pause(500)
      .execute(function () {
        const items = document.querySelectorAll('[data-id^="conversation-item-"]')
        return items.length
      }, [], function (result) {
        browser.assert.equal(result.value, 3, 'All 3 conversations shown after clearing search')
      })
  },

  'Should handle search with no results #group3': function (browser: NightwatchBrowser) {
    browser
      .clearValue('*[data-id="search-conversations-input"]')
      .setValue('*[data-id="search-conversations-input"]', 'nonexistent query xyz')
      .pause(500)
      .waitForElementVisible('.text-center.text-muted', 5000)
      .assert.containsText('.text-center.text-muted', 'No conversations found')
  },

  'Should filter active vs archived conversations #group3': function (browser: NightwatchBrowser) {
    browser
      .clearValue('*[data-id="search-conversations-input"]')
      .pause(500)
      .execute(function () {
        const items = document.querySelectorAll('[data-id^="conversation-item-"]')
        const activeCount = items.length
        const firstId = items[0]?.getAttribute('data-id')?.replace('conversation-item-', '')
        return { activeCount, firstId }
      }, [], function (result) {
        const data = result.value as { activeCount: number; firstId: string }

        browser
          // Archive one conversation
          .click(`*[data-id="conversation-menu-${data.firstId}"]`)
          .pause(300)
          .click('.conversation-menu .conversation-menu-item:first-child')
          .pause(1000)
          .execute(function () {
            const items = document.querySelectorAll('[data-id^="conversation-item-"]')
            return items.length
          }, [], function (activeResult) {
            browser.assert.equal(
              activeResult.value,
              data.activeCount - 1,
              'Active view shows one less conversation'
            )
          })
          // Switch to archived view
          .click('*[data-id="toggle-archived-btn"]')
          .pause(500)
          .execute(function () {
            const items = document.querySelectorAll('[data-id^="conversation-item-"]')
            return items.length
          }, [], function (archivedResult) {
            browser.assert.equal(archivedResult.value, 1, 'Archived view shows 1 conversation')
          })
      })
  },

  'Should display conversation count #group3': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="toggle-archived-btn"]')
      .pause(500)
      .waitForElementVisible('.sidebar-title', 5000)
      .assert.containsText('.sidebar-title', '2')
  },

  'Should sort conversations by lastAccessedAt #group3': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        const items = document.querySelectorAll('[data-id^="conversation-item-"]')
        return items.length > 1 ? [
          items[0].getAttribute('data-id')?.replace('conversation-item-', ''),
          items[items.length - 1].getAttribute('data-id')?.replace('conversation-item-', '')
        ] : null
      }, [], function (result) {
        const ids = result.value as string[]
        if (!ids || ids.length < 2) return

        const firstId = ids[0]
        const lastId = ids[1]

        browser
          // Click on last conversation
          .click(`*[data-id="conversation-item-${lastId}"]`)
          .pause(1000)
          // Verify it moved to top
          .execute(function () {
            const topItem = document.querySelector('[data-id^="conversation-item-"]')
            return topItem?.getAttribute('data-id')?.replace('conversation-item-', '')
          }, [], function (topResult) {
            browser.assert.equal(topResult.value, lastId, 'Conversation moved to top after access')
          })
      })
  },

  // ==================== GROUP 4: Cloud Sync Operations ====================

  'Should show sync status indicator when sync enabled #group4': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      // This test assumes sync is enabled via settings
      // For now, just check if indicator exists
      .execute(function () {
        const indicator = document.querySelector('[data-id="sync-status-indicator"]')
        return indicator !== null
      }, [], function (result) {
        if (result.value) {
          browser.waitForElementVisible('*[data-id="sync-status-indicator"]', 5000)
        }
      })
  },

  'Should handle sync when cloud backend configured #group4': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        // Check if cloud sync is configured
        return localStorage.getItem('remix-pro-token') !== null
      }, [], function (result) {
        if (result.value) {
          browser
            .waitForElementVisible('*[data-id="sync-manual-trigger"]', 5000)
            .click('*[data-id="sync-manual-trigger"]')
            .pause(2000)
            .waitForElementVisible('*[data-id^="sync-status-"]', 10000)
        }
      })
  },

  // ==================== GROUP 5: Edge Cases & Error Handling ====================

  'Should handle very long conversation titles #group5': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .click('*[data-id="new-conversation-btn"]')
      .pause(500)
      .setValue(
        '*[data-id="remix-ai-composer-input"]',
        'This is a very very very very very very very very very very very very very very very very very very very long conversation title that should be truncated in the sidebar but show full text on hover or in the detail view'
      )
      .click('*[data-id="remix-ai-composer-send-btn"]')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        locateStrategy: 'xpath',
        timeout: 60000
      })
      .pause(1000)
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
      })
  },

  'Should handle special characters in messages #group5': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="new-conversation-btn"]')
      .pause(500)
      .clearValue('*[data-id="remix-ai-composer-input"]')
      .setValue('*[data-id="remix-ai-composer-input"]', '<script>alert("xss")</script>')
      .click('*[data-id="remix-ai-composer-send-btn"]')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        locateStrategy: 'xpath',
        timeout: 60000
      })
      .pause(1000)
      .execute(function () {
        // Check that script tag is not executed (innerHTML should be escaped)
        const bubbles = document.querySelectorAll('.chat-bubble')
        const lastBubble = bubbles[bubbles.length - 1]
        return lastBubble ? lastBubble.textContent : null
      }, [], function (result) {
        browser.assert.ok(
          result.value && (result.value as string).includes('<script>'),
          'Special characters are properly escaped'
        )
      })
  },

  'Should handle rapid conversation switching #group5': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        const items = document.querySelectorAll('[data-id^="conversation-item-"]')
        return Array.from(items).map(item =>
          item.getAttribute('data-id')?.replace('conversation-item-', '')
        ).filter(Boolean)
      }, [], function (result) {
        const ids = result.value as string[]
        if (ids.length < 2) return

        // Rapidly switch between conversations
        for (let i = 0; i < Math.min(5, ids.length); i++) {
          const id = ids[i % ids.length]
          browser
            .click(`*[data-id="conversation-item-${id}"]`)
            .pause(100)
        }

        browser.pause(1000)
      })
  },

  'Should preserve conversation on error #group5': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        const items = document.querySelectorAll('[data-id^="conversation-item-"]')
        const count = items.length
        const lastId = items[items.length - 1]?.getAttribute('data-id')?.replace('conversation-item-', '')
        return { count, lastId }
      }, [], function (beforeResult) {
        const before = beforeResult.value as { count: number; lastId: string }

        browser
          // Send message that might cause error
          .clearValue('*[data-id="remix-ai-composer-input"]')
          .setValue('*[data-id="remix-ai-composer-input"]', 'Test message for error handling')
          .click('*[data-id="remix-ai-composer-send-btn"]')
          .pause(2000)
          // Verify conversation still exists
          .execute(function () {
            const items = document.querySelectorAll('[data-id^="conversation-item-"]')
            return items.length
          }, [], function (afterResult) {
            browser.assert.ok(
              (afterResult.value as number) >= before.count,
              'Conversations preserved after potential error'
            )
          })
      })
  },

  'Should handle missing conversation gracefully #group5': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        // Manually delete a conversation from IndexedDB
        return new Promise((resolve) => {
          const request = indexedDB.open('RemixChatHistory', 1)
          request.onsuccess = (event: any) => {
            const db = event.target.result
            const transaction = db.transaction(['conversations'], 'readwrite')
            const store = transaction.objectStore('conversations')
            const getAllRequest = store.getAll()

            getAllRequest.onsuccess = () => {
              const conversations = getAllRequest.result
              if (conversations.length > 0) {
                const deleteRequest = store.delete(conversations[0].id)
                deleteRequest.onsuccess = () => resolve(conversations[0].id)
                deleteRequest.onerror = () => resolve(null)
              } else {
                resolve(null)
              }
            }
          }
          request.onerror = () => resolve(null)
        })
      })
      .pause(500)
      .refreshPage()
      .clickLaunchIcon('remixaiassistant')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .pause(1000)
      // UI should handle missing conversation gracefully
      .waitForElementVisible('*[data-id="chat-history-sidebar"]', 10000)
  },

  'Should handle emoji in messages #group5': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="new-conversation-btn"]')
      .pause(500)
      .clearValue('*[data-id="remix-ai-composer-input"]')
      .setValue('*[data-id="remix-ai-composer-input"]', 'Testing emoji support 🚀 🎉 ✨')
      .click('*[data-id="remix-ai-composer-send-btn"]')
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
        locateStrategy: 'xpath',
        timeout: 60000
      })
      .pause(1000)
      .execute(function () {
        const items = document.querySelectorAll('[data-id^="conversation-item-"]')
        const lastItem = items[items.length - 1]
        return lastItem?.textContent
      }, [], function (result) {
        browser.assert.ok(
          result.value && (result.value as string).includes('🚀'),
          'Emoji displayed correctly in conversation'
        )
      })
  },
}
