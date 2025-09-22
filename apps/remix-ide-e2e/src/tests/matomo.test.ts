'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

import examples from '../examples/example-contracts'

const sources = [
  { 'Untitled.sol': { content: examples.ballot.content } }
]

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done, 'http://127.0.0.1:8080', false)
  },
  'accept all including Matomo anon and perf #group1': function (browser: NightwatchBrowser) {
    browser.perform((done) => {
      browser
        .execute(function () {
          localStorage.removeItem('config-v0.8:.remix.config')
          localStorage.setItem('showMatomo', 'true')
        }, [])
        .refreshPage()
        .perform(done())
    })
      .waitForElementPresent({
        selector: `//*[@data-id='compilerloaded']`,
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .execute(function () {
        return (window as any)._paq
      }, [], (res) => {
        console.log('_paq', res)
      })
      .waitForElementVisible('*[data-id="matomoModalModalDialogModalBody-react"]')
      .pause(1000)
      .click('[data-id="matomoModal-modal-footer-ok-react"]') // Accepted
      .execute(function () {
        return (window as any)._paq
      }, [], (res) => {
        console.log('_paq', res)
      })
      .waitForElementNotVisible('*[data-id="matomoModalModalDialogModalBody-react"]')
      .refreshPage()
      .waitForElementPresent({
        selector: `//*[@data-id='compilerloaded']`,
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .waitForElementNotPresent('*[data-id="matomoModalModalDialogModalBody-react"]')
      .waitForElementVisible('*[data-id="topbar-settingsIcon"]')
      .click('*[data-id="topbar-settingsIcon"]')
      .waitForElementVisible('*[data-id="settings-sidebar-analytics"]')
      .click('*[data-id="settings-sidebar-analytics"]')
      .waitForElementVisible('*[data-id="matomo-analyticsSwitch"]')
      .verify.elementPresent('[data-id="matomo-analyticsSwitch"] .fa-toggle-on')
      .verify.elementPresent('[data-id="matomo-perf-analyticsSwitch"] .fa-toggle-on')
      .execute(function () {
        return JSON.parse(window.localStorage.getItem('config-v0.8:.remix.config'))['settings/matomo-analytics'] == true
      }, [], (res) => {
        console.log('res', res)
        browser.assert.ok((res as any).value, 'matomo analytics is enabled')
      })
      .execute(function () {
        return JSON.parse(window.localStorage.getItem('config-v0.8:.remix.config'))['settings/matomo-perf-analytics'] == true
      }, [], (res) => {
        browser.assert.ok((res as any).value, 'matomo perf analytics is enabled')
      })
  },
  'disable matomo perf analytics on manage preferences #group2': function (browser: NightwatchBrowser) {
    browser.perform((done) => {
      browser.execute(function () {
        localStorage.removeItem('config-v0.8:.remix.config')
        localStorage.setItem('showMatomo', 'true')
        localStorage.removeItem('matomo-analytics-consent')
      }, [])
        .refreshPage()
        .perform(done())
    })
      .waitForElementPresent({
        selector: `//*[@data-id='compilerloaded']`,
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .waitForElementVisible({
        selector: '*[data-id="matomoModalModalDialogModalBody-react"]',
        abortOnFailure: true
      })
      .waitForElementVisible('*[data-id="matomoModal-modal-footer-cancel-react"]')
      .click('[data-id="matomoModal-modal-footer-cancel-react"]') // click on Manage Preferences
      .waitForElementVisible('*[data-id="managePreferencesModalModalDialogModalBody-react"]')
      .waitForElementVisible('*[data-id="matomoPerfAnalyticsToggleSwitch"]')
      .click('*[data-id="matomoPerfAnalyticsToggleSwitch"]') // disable matomo perf analytics3
      .click('[data-id="managePreferencesModal-modal-footer-ok-react"]') // click on Save Preferences
      .pause(2000)
      .waitForElementVisible('*[data-id="topbar-settingsIcon"]')
      .click('*[data-id="topbar-settingsIcon"]')
      .waitForElementVisible('*[data-id="settings-sidebar-analytics"]')
      .click('*[data-id="settings-sidebar-analytics"]')
      .waitForElementVisible('*[data-id="matomo-perf-analyticsSwitch"]')
      .verify.elementPresent('[data-id="matomo-perf-analyticsSwitch"] .fa-toggle-off')
      .execute(function () {
        return JSON.parse(window.localStorage.getItem('config-v0.8:.remix.config'))['settings/matomo-perf-analytics'] == false
      }, [], (res) => {
        console.log('res', res)
        browser.assert.ok((res as any).value, 'matomo perf analytics is disabled')
      })
  },
  'change settings #group2': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="matomo-perf-analyticsSwitch"]')
      .refreshPage()
      .waitForElementPresent({
        selector: `//*[@data-id='compilerloaded']`,
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .waitForElementNotPresent('*[data-id="matomoModalModalDialogModalBody-react"]')
      .waitForElementVisible('*[data-id="topbar-settingsIcon"]')
      .click('*[data-id="topbar-settingsIcon"]')
      .waitForElementVisible('*[data-id="settings-sidebar-analytics"]')
      .click('*[data-id="settings-sidebar-analytics"]')
      .waitForElementVisible('*[data-id="matomo-perf-analyticsSwitch"]')
      .verify.elementPresent('[data-id="matomo-perf-analyticsSwitch"] .fa-toggle-on')
      .click('*[data-id="matomo-perf-analyticsSwitch"]') // disable again
      .pause(2000)
      .refreshPage()
  },
  'check old timestamp and reappear Matomo #group2': function (browser: NightwatchBrowser) {
    browser.perform((done) => {
      browser.execute(function () {
        const oldTimestamp = new Date()
        oldTimestamp.setMonth(oldTimestamp.getMonth() - 7)
        localStorage.setItem('matomo-analytics-consent', oldTimestamp.getTime().toString())
      }, [])
        .refreshPage()
        .perform(done())
    })
      .waitForElementPresent({
        selector: `//*[@data-id='compilerloaded']`,
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .execute(function () {

        const timestamp = window.localStorage.getItem('matomo-analytics-consent');
        if (timestamp) {

          const consentDate = new Date(Number(timestamp));
          // validate it is actually a date
          if (isNaN(consentDate.getTime())) {
            return false;
          }
          // validate it's older than 6 months
          const now = new Date();
          const diffInMonths = (now.getFullYear() - consentDate.getFullYear()) * 12 + now.getMonth() - consentDate.getMonth();
          console.log('timestamp', timestamp, consentDate, now.getTime())
          console.log('diffInMonths', diffInMonths)
          return diffInMonths > 6;
        }
        return false;

      }, [], (res) => {
        console.log('res', res)
        browser.assert.ok((res as any).value, 'matomo performance analytics consent timestamp is set')
      })
      .waitForElementVisible('*[data-id="matomoModalModalDialogModalBody-react"]')
      .click('[data-id="matomoModal-modal-footer-ok-react"]') // accept
      .waitForElementNotVisible('*[data-id="matomoModalModalDialogModalBody-react"]')
  },
  'check recent timestamp and do not reappear Matomo #group3': function (browser: NightwatchBrowser) {
    browser.perform((done) => {
      browser.execute(function () {
        const recentTimestamp = new Date()
        recentTimestamp.setMonth(recentTimestamp.getMonth() - 1)
        localStorage.setItem('matomo-analytics-consent', recentTimestamp.getTime().toString())
      }, [])
        .refreshPage()
        .perform(done())
    })
    // check if timestamp is younger than 6 months
      .execute(function () {

        const timestamp = window.localStorage.getItem('matomo-analytics-consent');
        if (timestamp) {

          const consentDate = new Date(Number(timestamp));
          // validate it is actually a date
          if (isNaN(consentDate.getTime())) {
            return false;
          }
          // validate it's younger than 2 months
          const now = new Date();
          const diffInMonths = (now.getFullYear() - consentDate.getFullYear()) * 12 + now.getMonth() - consentDate.getMonth();
          console.log('timestamp', timestamp, consentDate, now.getTime())
          console.log('diffInMonths', diffInMonths)
          return diffInMonths < 2;
        }
        return false;

      }, [], (res) => {
        console.log('res', res)
        browser.assert.ok((res as any).value, 'matomo analytics consent timestamp is set')
      })
      .waitForElementPresent({
        selector: `//*[@data-id='compilerloaded']`,
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .pause(2000)
      .waitForElementNotPresent('*[data-id="matomoModalModalDialogModalBody-react"]')
  },
  'accept Matomo and check timestamp #group3': function (browser: NightwatchBrowser) {
    browser.perform((done) => {
      browser.execute(function () {
        localStorage.removeItem('config-v0.8:.remix.config')
        localStorage.setItem('showMatomo', 'true')
        localStorage.removeItem('matomo-analytics-consent')
      }, [])
        .refreshPage()
        .perform(done())
    })
      .waitForElementPresent({
        selector: `//*[@data-id='compilerloaded']`,
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .waitForElementVisible('*[data-id="matomoModalModalDialogModalBody-react"]')
      .click('[data-id="matomoModal-modal-footer-ok-react"]') // accept
      .waitForElementNotVisible('*[data-id="matomoModalModalDialogModalBody-react"]')
      .pause(2000)
      .execute(function () {

        const timestamp = window.localStorage.getItem('matomo-analytics-consent');
        if (timestamp) {

          const consentDate = new Date(Number(timestamp));
          // validate it is actually a date
          if (isNaN(consentDate.getTime())) {
            return false;
          }
          const now = new Date();
          console.log('timestamp', timestamp, consentDate, now.getTime())
          const diffInMinutes = (now.getTime() - consentDate.getTime()) / (1000 * 60);
          console.log('diffInMinutes', diffInMinutes)
          return diffInMinutes < 1;
        }
        return false;

      }, [], (res) => {
        console.log('res', res)
        browser.assert.ok((res as any).value, 'matomo analytics consent timestamp is to a recent date')
      })
  },
  'check old timestamp and do not reappear Matomo after accept #group3': function (browser: NightwatchBrowser) {
    browser.perform((done) => {
      browser.execute(function () {
        const oldTimestamp = new Date()
        oldTimestamp.setMonth(oldTimestamp.getMonth() - 7)
        localStorage.setItem('matomo-analytics-consent', oldTimestamp.getTime().toString())
      }, [])
        .refreshPage()
        .perform(done())
    })
      .waitForElementPresent({
        selector: `//*[@data-id='compilerloaded']`,
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .pause(2000)
      .waitForElementNotPresent('*[data-id="matomoModalModalDialogModalBody-react"]')
  },
  'check recent timestamp and do not reappear Matomo after accept #group3': function (browser: NightwatchBrowser) {
    browser.perform((done) => {
      browser.execute(function () {
        const recentTimestamp = new Date()
        recentTimestamp.setMonth(recentTimestamp.getMonth() - 1)
        localStorage.setItem('matomo-analytics-consent', recentTimestamp.getTime().toString())
      }, [])
        .refreshPage()
        .perform(done())
    })
      .waitForElementPresent({
        selector: `//*[@data-id='compilerloaded']`,
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .pause(2000)
      .waitForElementNotPresent('*[data-id="matomoModalModalDialogModalBody-react"]')
  },
  'when there is a recent timestamp but no config the dialog should reappear #group3': function (browser: NightwatchBrowser) {
    browser.perform((done) => {
      browser.execute(function () {
        localStorage.removeItem('config-v0.8:.remix.config')
        const recentTimestamp = new Date()
        recentTimestamp.setMonth(recentTimestamp.getMonth() - 1)
        localStorage.setItem('matomo-analytics-consent', recentTimestamp.getTime().toString())
      }, [])
        .refreshPage()
        .perform(done())
    })
      .waitForElementVisible('*[data-id="matomoModalModalDialogModalBody-react"]')
      .click('[data-id="matomoModal-modal-footer-ok-react"]') // accept
      .waitForElementNotVisible('*[data-id="matomoModalModalDialogModalBody-react"]')
  },
  'when there is a old timestamp but no config the dialog should reappear #group3': function (browser: NightwatchBrowser) {
    browser.perform((done) => {
      browser.execute(function () {
        localStorage.removeItem('config-v0.8:.remix.config')
        const oldTimestamp = new Date()
        oldTimestamp.setMonth(oldTimestamp.getMonth() - 7)
        localStorage.setItem('matomo-analytics-consent', oldTimestamp.getTime().toString())
      }, [])
        .refreshPage()
        .perform(done())
    })
      .waitForElementVisible('*[data-id="matomoModalModalDialogModalBody-react"]')
      .click('[data-id="matomoModal-modal-footer-ok-react"]') // accept
      .waitForElementNotVisible('*[data-id="matomoModalModalDialogModalBody-react"]')
  },
  'verify Matomo events are tracked on app start #group4': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        return (window as any)._paq
      }, [], (res) => {
        const expectedEvents = [
          ["trackEvent", "Storage", "activate", "indexedDB"]
        ];

        const actualEvents = (res as any).value;

        const areEventsPresent = expectedEvents.every(expectedEvent =>
          actualEvents.some(actualEvent =>
            JSON.stringify(actualEvent) === JSON.stringify(expectedEvent)
          )
        );

        browser.assert.ok(areEventsPresent, 'Matomo events are tracked correctly');
      })
  },

  '@sources': function () {
    return sources
  },
  'Add Ballot #group4': function (browser: NightwatchBrowser) {
    browser
      .addFile('Untitled.sol', sources[0]['Untitled.sol'])
  },
  'Deploy Ballot #group4': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="remixIdeIconPanel"]', 10000)
      .clickLaunchIcon('solidity')
      .waitForElementVisible('*[data-id="compilerContainerCompileBtn"]')
      .click('*[data-id="compilerContainerCompileBtn"]')
      .testContracts('Untitled.sol', sources[0]['Untitled.sol'], ['Ballot'])
  },
  'verify Matomo compiler events are tracked #group4': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        return (window as any)._paq
      }, [], (res) => {
        const expectedEvent = ["trackEvent", "compiler", "compiled"];
        const actualEvents = (res as any).value;

        const isEventPresent = actualEvents.some(actualEvent =>
          actualEvent[0] === expectedEvent[0] &&
                    actualEvent[1] === expectedEvent[1] &&
                    actualEvent[2] === expectedEvent[2] &&
                    actualEvent[3].startsWith("with_version_")
        );

        browser.assert.ok(isEventPresent, 'Matomo compiler events are tracked correctly');
      })
  },
}
