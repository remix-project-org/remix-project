import {
  NightwatchBrowser
} from 'nightwatch'
import EventEmitter from 'events'

class CloseBetaPopUp extends EventEmitter {
  command(
    this: NightwatchBrowser,
  ): NightwatchBrowser {
    this.api
      .isVisible({ selector: "[data-id='beta-corner-widget']", suppressNotFoundErrors: true, timeout: 1000 }, (result) => {
        if (result.value) {
          browser.execute(function () {
            const closeIcon = document.querySelector('.beta-corner-widget-close') as HTMLElement

            if (closeIcon) {
              closeIcon.scrollIntoView({ behavior: 'auto', block: 'center' })
              closeIcon.click()
            }
          }, [])
        }})
      .perform(() => {
        this.emit('complete')
      })
    return this
  }
}

module.exports = CloseBetaPopUp
