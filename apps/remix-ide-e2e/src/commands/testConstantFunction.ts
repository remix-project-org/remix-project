import {
  NightwatchBrowser
} from 'nightwatch'
import EventEmitter from 'events'

class TestConstantFunction extends EventEmitter {
  command(
    this: NightwatchBrowser,
    instanceIndex: number,
    functionIndex: number,
    expectedInput: string[] | null,
    expectedOutput: string
  ): NightwatchBrowser {
    this.api
      .click(`[data-id="functionDropdown-${instanceIndex}"] button`)
      .pause(1000) // Wait for the dropdown to open
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
            input,
            (_) => _
          )
        })
        done()
      })
      .click(`[data-id="btnExecute-${instanceIndex}"]`)
      .pause(2000)
      .waitForElementPresent(`[data-id="udapp_tree_value"]`)
      .assert.containsText(
        `[data-id="udapp_tree_value"]`,
        expectedOutput
      )
      .perform(() => {
        this.emit('complete')
      })
    return this
  }
}

module.exports = TestConstantFunction
