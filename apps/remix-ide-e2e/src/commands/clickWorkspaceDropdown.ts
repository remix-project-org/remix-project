import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

/**
 * Waits for the workspace dropdown to be visible AND enabled
 * (i.e. `data-disabled` is not "true"), then clicks it.
 */
class clickWorkspaceDropdown extends EventEmitter {
  command (this: NightwatchBrowser): NightwatchBrowser {
    this.api
      .waitForElementVisible('[data-id="workspacesSelect"]', 30000)
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: '//*[@data-id="workspacesSelect" and not(@data-disabled="true")]',
        timeout: 30000,
      })
      .click('[data-id="workspacesSelect"]')
      .pause(500)
      .perform((done) => {
        done()
        this.emit('complete')
      })
    return this
  }
}

module.exports = clickWorkspaceDropdown
