import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

/**
 * Waits for the cloud toggle button to be visible AND enabled
 * (i.e. the `disabled` attribute is not set), then clicks it.
 */
class clickCloudToggle extends EventEmitter {
  command (this: NightwatchBrowser): NightwatchBrowser {
    this.api
      .waitForElementVisible('[data-id="cloud-toggle"]', 30000)
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: '//*[@data-id="cloud-toggle" and not(@disabled)]',
        timeout: 30000,
      })
      .click('[data-id="cloud-toggle"]')
      .click({
        selector: '[data-id="confirm-enable-cloud-modal-footer-ok-react"]',
        suppressNotFoundErrors: true
      })
      .click({
        selector: '[data-id="confirm-disable-cloud-modal-footer-ok-react"]',
        suppressNotFoundErrors: true
      })
      .perform((done) => {
        done()
        this.emit('complete')
      })
    return this
  }
}

module.exports = clickCloudToggle
