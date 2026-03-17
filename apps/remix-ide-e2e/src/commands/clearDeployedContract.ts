import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class ClearDeployedContract extends EventEmitter {
  command (this: NightwatchBrowser, index: number): NightwatchBrowser {
    this.api.perform((done: VoidFunction) => {
      clearContract(this.api, index, () => {
        done()
        this.emit('complete')
      })
    })
    return this
  }
}

function clearContract (browser: NightwatchBrowser, index: number, callback: VoidFunction) {
  browser
    .clickLaunchIcon('udapp')
    .waitForElementPresent(`[data-id="contractKebabIcon-${index}"]`)
    .execute(function (index) {
      // Use JavaScript to click the button, avoiding sticky header issues
      const optionsMenu = document.querySelector(`[data-id="contractKebabIcon-${index}"]`) as HTMLElement
      if (optionsMenu) {
        optionsMenu.scrollIntoView({ behavior: 'auto', block: 'center' })
      }
    }, [index])
    .waitForElementVisible(`[data-id="contractKebabIcon-${index}"]`)
    .click(`[data-id="contractKebabIcon-${index}"]`) // Click kebab icon
    .waitForElementVisible('[data-id="clear"]')
    .click('[data-id="clear"]') // Click "Clear" option in kebab menu
    .pause(500)
    .perform(() => {
      callback()
    })
}

module.exports = ClearDeployedContract
