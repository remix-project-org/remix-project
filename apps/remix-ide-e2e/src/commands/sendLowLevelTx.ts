import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class sendLowLevelTx extends EventEmitter {
  command (this: NightwatchBrowser, index: number, value: string, callData): NightwatchBrowser {
    this.api.waitForElementPresent(`[data-id="btnLowLevel-${index}"]`)
    this.api.isVisible({ selector: `[data-id="fallbackInput-${index}"]`, suppressNotFoundErrors: true, timeout: 1000 }, (result) => {
      if (!result.value) {
        this.api.execute(function (index) {
          const lowLevelExpandIcon = document.querySelector(`[data-id="btnLowLevel-${index}"]`) as HTMLElement
          if (lowLevelExpandIcon) {
            lowLevelExpandIcon.scrollIntoView({ behavior: 'auto', block: 'center' })
            lowLevelExpandIcon.click()
          }
        }, [index])
      }})
      .pause(1000)
      .waitForElementPresent(`[data-id="fallbackInput-${index}"]`)
      .click(`[data-id="fallbackInput-${index}"]`)
      .clearValue(`[data-id="fallbackInput-${index}"]`)
      .sendKeys(`[data-id="fallbackInput-${index}"]`, callData ? ['_', this.api.Keys.BACK_SPACE, callData] : ['_', this.api.Keys.BACK_SPACE])
      .waitForElementVisible(`[data-id="contractItem-sendValue-${index}"]`)
      .clearValue(`[data-id="contractItem-sendValue-${index}"]`)
      .setValue(`[data-id="contractItem-sendValue-${index}"]`, value)
      .pause(2000)
      .scrollAndClick(`[data-id="btnExecute-${index}"]`)
      .perform(() => {
        this.emit('complete')
      })
    return this
  }
}

module.exports = sendLowLevelTx
