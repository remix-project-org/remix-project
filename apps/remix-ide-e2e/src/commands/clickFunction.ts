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
    this.api
      .execute(function (instanceIndex, functionIndex) {
        // Use JavaScript to click the button, avoiding sticky header issues
        const contractFunction = document.querySelector(`[data-id="deployedContractItem-${instanceIndex}-function-${functionIndex}"]`) as HTMLElement
        if (contractFunction) {
          contractFunction.scrollIntoView({ behavior: 'auto', block: 'center' })
          contractFunction.click()
        }
      }, [instanceIndex, functionIndex])
      .waitForElementPresent(`[data-id="btnExecute-${instanceIndex}"]`)
      .execute(function (instanceIndex) {
        const executeBtn = document.querySelector(`[data-id="btnExecute-${instanceIndex}"]`) as HTMLElement
        if (executeBtn) {
          executeBtn.scrollIntoView({ behavior: 'auto', block: 'center' })
        }
      }, [instanceIndex])
      .perform(function (client, done) {
        (expectedInput || []).forEach((input, index) => {
          client.setValue(
            `[data-id="selectedFunction-${index}"]`,
            input
          )
        })
        done()
      })
      .click(`[data-id="btnExecute-${instanceIndex}"]`)
      .pause(2000)
      .perform(() => {
        this.emit('complete')
      })
    return this
  }
}

module.exports = ClickFunction
