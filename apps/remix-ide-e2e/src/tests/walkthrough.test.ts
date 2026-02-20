'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

module.exports = {

  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },

  'Should run walkthrough for recorder': '' + function (browser: NightwatchBrowser) {
    browser
      .waitForElementPresent('*[data-id="remixIdeSidePanel"]')
      .clickLaunchIcon('udapp')
      .waitForElementPresent('*[data-id="recorderStartWalkthrough"]')
      .click('*[data-id="recorderStartWalkthrough"]')
      .waitForElementPresent('*[id="remixRecorderWalkthrowTitle"]')
      .waitForElementPresent('*[data-id="remixRecorderExpanded"]')
  }
}