import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class sendLowLevelTx extends EventEmitter {
  command (this: NightwatchBrowser, index: number, value: string, callData: string): NightwatchBrowser {
    this.api.waitForElementPresent(`[data-id="fallbackExecute-${index}"]`)
      .execute(function (index) {
        const executeButton = document.querySelector(`[data-id="fallbackExecute-${index}"]`) as HTMLElement
        if (executeButton) {
          executeButton.scrollIntoView({ behavior: 'auto', block: 'center' })
        }
      }, [index])
      .clearValue(`[data-id="fallbackInput-${index}"]`)
      .sendKeys(`[data-id="fallbackInput-${index}"]`, ['_', this.api.Keys.BACK_SPACE, callData])
      .waitForElementVisible(`[data-id="contractItem-sendValue-${index}"]`)
      .clearValue(`[data-id="contractItem-sendValue-${index}"]`)
      .setValue(`[data-id="contractItem-sendValue-${index}"]`, value)
      .pause(2000)
      .scrollAndClick(`[data-id="fallbackExecute-${index}"]`)
      .perform(() => {
        this.emit('complete')
      })
    return this
  }
}

module.exports = sendLowLevelTx
