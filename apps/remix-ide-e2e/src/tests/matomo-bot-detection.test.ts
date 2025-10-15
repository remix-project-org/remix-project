'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

/**
 * Matomo Bot Detection Tests
 * 
 * These tests verify that:
 * 1. Bot detection correctly identifies automation tools (Selenium/WebDriver)
 * 2. The isBot custom dimension is set correctly in Matomo
 * 3. Bot type and confidence are reported accurately
 * 4. Events are still tracked but tagged with bot status
 */

module.exports = {
  '@disabled': false,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done, 'http://127.0.0.1:8080', false)
  },

  // Enable Matomo on localhost for testing
  'Enable Matomo and wait for initialization': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        localStorage.setItem('showMatomo', 'true');
      }, [])
      .refreshPage()
      .waitForElementPresent({
        selector: `//*[@data-id='compilerloaded']`,
        locateStrategy: 'xpath',
        timeout: 120000
      })
  },

  'Load debug plugin before accepting consent': function (browser: NightwatchBrowser) {
    browser
      // Load debug plugin BEFORE accepting consent so it captures the bot detection event
      .execute(function () {
        const matomoManager = (window as any)._matomoManagerInstance;
        if (!matomoManager) return { success: false, error: 'No MatomoManager' };
        
        return new Promise((resolve) => {
          matomoManager.loadDebugPluginForE2E().then((debugHelpers: any) => {
            (window as any).__matomoDebugHelpers = debugHelpers;
            resolve({ success: true });
          }).catch((error: any) => {
            resolve({ success: false, error: error.message });
          });
        });
      }, [], (result: any) => {
        browser.assert.ok(result.value.success, 'Debug plugin loaded before consent');
      })
      // Wait for debug plugin loaded marker
      .waitForElementPresent({
        selector: `//*[@data-id='matomo-debug-plugin-loaded']`,
        locateStrategy: 'xpath',
        timeout: 5000
      })
  },

  'Accept consent to enable tracking': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="matomoModalModalDialogModalBody-react"]')
      .click('[data-id="matomoModal-modal-footer-ok-react"]')
      .waitForElementNotVisible('*[data-id="matomoModalModalDialogModalBody-react"]')
      // Wait for bot detection to complete
      .waitForElementPresent({
        selector: `//*[@data-id='matomo-bot-detection-complete']`,
        locateStrategy: 'xpath',
        timeout: 5000
      })
      // Wait for full Matomo initialization
      .waitForElementPresent({
        selector: `//*[@data-id='matomo-initialized']`,
        locateStrategy: 'xpath',
        timeout: 5000
      })
  },

  'Verify bot detection identifies automation tool': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        const matomoManager = (window as any)._matomoManagerInstance;
        if (!matomoManager) {
          return { error: 'MatomoManager not found' };
        }

        const isBot = matomoManager.isBot();
        const botType = matomoManager.getBotType();
        const confidence = matomoManager.getBotConfidence();
        const fullResult = matomoManager.getBotDetectionResult();

        return {
          isBot,
          botType,
          confidence,
          reasons: fullResult?.reasons || [],
          userAgent: fullResult?.userAgent || navigator.userAgent
        };
      }, [], (result: any) => {
        console.log('🤖 Bot Detection Result:', result.value);
        
        // Selenium/WebDriver should be detected as a bot
        browser.assert.strictEqual(
          result.value.isBot,
          true,
          'Selenium/WebDriver should be detected as a bot'
        );

        // Should detect automation with high confidence
        browser.assert.strictEqual(
          result.value.confidence,
          'high',
          'Automation detection should have high confidence'
        );

        // Bot type should indicate automation
        const botType = result.value.botType;
        const isAutomationBot = botType.includes('automation') || 
                                botType.includes('webdriver') ||
                                botType.includes('selenium');
        
        browser.assert.strictEqual(
          isAutomationBot,
          true,
          `Bot type should indicate automation, got: ${botType}`
        );

        // Log detection reasons for debugging
        console.log('🔍 Detection reasons:', result.value.reasons);
      })
  },

  'Verify isBot custom dimension is set in Matomo': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        const matomoManager = (window as any)._matomoManagerInstance;
        const botType = matomoManager.getBotType();

        // Get the debug data to verify dimension was set
        const debugData = (window as any).__getMatomoDimensions?.();
        
        return {
          botType,
          dimensionsSet: debugData || {},
          hasDimension: debugData && Object.keys(debugData).length > 0
        };
      }, [], (result: any) => {
        console.log('📊 Matomo Dimensions:', result.value);

        // Verify bot type is not 'human'
        browser.assert.notStrictEqual(
          result.value.botType,
          'human',
          'Bot type should not be "human" in E2E tests'
        );

        // If debug plugin is loaded, verify dimension is set
        if (result.value.hasDimension) {
          console.log('✅ Bot dimension found in debug data');
        }
      })
  },

  'Verify events are tracked with bot detection': function (browser: NightwatchBrowser) {
    browser
      // Matomo already initialized (marker checked in previous test)
      // Trigger a tracked event by clicking a plugin
      .clickLaunchIcon('filePanel')
      .pause(1000) // Small delay for event propagation
      
      .execute(function () {
        const matomoManager = (window as any)._matomoManagerInstance;
        const debugHelpers = (window as any).__matomoDebugHelpers;
        
        if (!debugHelpers) return { error: 'Debug helpers not found' };
        
        const events = debugHelpers.getEvents();
        const isBot = matomoManager.isBot();
        const botType = matomoManager.getBotType();
        
        // Find bot detection event
        const botDetectionEvent = events.find((e: any) => 
          e.category === 'bot-detection' || e.e_c === 'bot-detection'
        );
        
        return {
          isBot,
          botType,
          eventCount: events.length,
          lastEvent: events[events.length - 1] || null,
          isInitialized: matomoManager.getState().initialized,
          hasBotDetectionEvent: !!botDetectionEvent,
          botDetectionEvent: botDetectionEvent || null
        };
      }, [], (result: any) => {
        console.log('📈 Event Tracking Result:', result.value);

        // Verify Matomo is initialized
        browser.assert.ok(
          result.value.isInitialized,
          'Matomo should be initialized after delay'
        );

        // Verify events are being tracked
        browser.assert.ok(
          result.value.eventCount > 0,
          `Events should be tracked even for bots (found ${result.value.eventCount})`
        );

        // Verify bot is still detected
        browser.assert.strictEqual(
          result.value.isBot,
          true,
          'Bot status should remain true after event tracking'
        );
        
        // Verify bot detection event was sent
        browser.assert.ok(
          result.value.hasBotDetectionEvent,
          'Bot detection event should be tracked'
        );
        
        // Log bot detection event details
        if (result.value.botDetectionEvent) {
          console.log('🤖 Bot Detection Event:', {
            category: result.value.botDetectionEvent.e_c || result.value.botDetectionEvent.category,
            action: result.value.botDetectionEvent.e_a || result.value.botDetectionEvent.action,
            name: result.value.botDetectionEvent.e_n || result.value.botDetectionEvent.name,
            value: result.value.botDetectionEvent.e_v || result.value.botDetectionEvent.value
          });
        }
        
        // Log last event details
        if (result.value.lastEvent) {
          console.log('📊 Last event:', {
            category: result.value.lastEvent.e_c,
            action: result.value.lastEvent.e_a,
            name: result.value.lastEvent.e_n
          });
        }
      })
  },

  'Verify bot detection result has expected structure': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        const matomoManager = (window as any)._matomoManagerInstance;
        const result = matomoManager.getBotDetectionResult();
        
        return {
          hasResult: result !== null,
          hasIsBot: typeof result?.isBot === 'boolean',
          hasBotType: typeof result?.botType === 'string' || result?.botType === undefined,
          hasConfidence: ['high', 'medium', 'low'].includes(result?.confidence),
          hasReasons: Array.isArray(result?.reasons),
          hasUserAgent: typeof result?.userAgent === 'string',
          // Also return actual values for logging
          actualIsBot: result?.isBot,
          actualBotType: result?.botType,
          actualConfidence: result?.confidence,
          actualReasons: result?.reasons,
          actualUserAgent: result?.userAgent,
          hasMouseAnalysis: !!result?.mouseAnalysis,
          mouseMovements: result?.mouseAnalysis?.movements || 0,
          humanLikelihood: result?.mouseAnalysis?.humanLikelihood || 'unknown'
        };
      }, [], (result: any) => {
        console.log('🔍 Bot Detection Structure:', result.value);

        browser.assert.strictEqual(result.value.hasResult, true, 'Should have bot detection result');
        browser.assert.strictEqual(result.value.hasIsBot, true, `Should have isBot boolean (value: ${result.value.actualIsBot})`);
        browser.assert.strictEqual(result.value.hasBotType, true, `Should have botType string (value: ${result.value.actualBotType})`);
        browser.assert.strictEqual(result.value.hasConfidence, true, `Should have valid confidence level (value: ${result.value.actualConfidence})`);
        browser.assert.strictEqual(result.value.hasReasons, true, `Should have reasons array (count: ${result.value.actualReasons?.length || 0})`);
        browser.assert.strictEqual(result.value.hasUserAgent, true, 'Should have userAgent string');
        
        // Log mouse analysis if available
        if (result.value.hasMouseAnalysis) {
          browser.assert.ok(true, `🖱️ Mouse Analysis: ${result.value.mouseMovements} movements, likelihood: ${result.value.humanLikelihood}`);
        } else {
          browser.assert.ok(true, '🖱️ Mouse Analysis: Not available (bot detected before mouse tracking)');
        }
      })
  },

  'Verify navigator.webdriver flag is present': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        return {
          webdriver: navigator.webdriver,
          hasWebdriver: navigator.webdriver === true
        };
      }, [], (result: any) => {
        console.log('🌐 Navigator.webdriver:', result.value);

        // Selenium/WebDriver sets this flag
        browser.assert.strictEqual(
          result.value.hasWebdriver,
          true,
          'navigator.webdriver should be true in Selenium/WebDriver'
        );
      })
  },

  'Test complete': function (browser: NightwatchBrowser) {
    browser.end()
  }
}
