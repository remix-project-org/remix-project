import {
  NightwatchBrowser
} from 'nightwatch'
import EventEmitter from 'events'

class ClickFunction extends EventEmitter {
  command(
    this: NightwatchBrowser,
    instanceIndex: number,
    functionIndex: number,
    expectedInput?: string[]
  ): NightwatchBrowser {
    const functionRowSelector = `[data-id="deployedContractItem-${instanceIndex}-function-${functionIndex}"]`
    const executeBtnSelector = `[data-id="btnExecute-${instanceIndex}-${functionIndex}"]`

    this.api
      .waitForElementPresent(functionRowSelector)
      .execute(function (selector) {
        const row = document.querySelector(selector) as HTMLElement
        if (row) {
          row.scrollIntoView({ behavior: 'auto', block: 'center' })
        }
      }, [functionRowSelector])
      .perform(function (client, done) {
        (expectedInput || []).forEach((input, index) => {
          const inputSelector = `[data-id="input-${instanceIndex}-${functionIndex}-${index}"]`
          client.clearValue(inputSelector).setValue(inputSelector, input)
        })
        done()
      })
      .waitForElementPresent(executeBtnSelector)
      .click(executeBtnSelector)
      .pause(2000)
      .perform(() => {
        this.emit('complete')
      })
    return this
  }
}

module.exports = ClickFunction
