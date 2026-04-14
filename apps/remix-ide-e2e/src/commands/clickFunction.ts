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
      .click(`[data-id="functionDropdown-${instanceIndex}"] button`)
      .pause(1000) // Wait for the dropdown to open
      .click(`[data-id="deployedContractItem-${instanceIndex}-function-${functionIndex}"]`)
      .pause(1000) // Wait for the function details to load
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
