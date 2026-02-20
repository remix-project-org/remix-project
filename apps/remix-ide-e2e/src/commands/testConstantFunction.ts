import {
  NightwatchBrowser,
  NightwatchTestConstantFunctionExpectedInput
} from 'nightwatch'
import EventEmitter from 'events'

class TestConstantFunction extends EventEmitter {
  command(
    this: NightwatchBrowser,
    instanceIndex: number,
    functionIndex: number,
    expectedInput: NightwatchTestConstantFunctionExpectedInput | null,
    expectedOutput: string
  ): NightwatchBrowser {
    this.api
      .execute(function (instanceIndex, functionIndex) {
        // Use JavaScript to click the button, avoiding sticky header issues
        const executeButton = document.querySelector(`[data-id="deployedContractItem-${instanceIndex}-button-${functionIndex}"]`) as HTMLElement
        if (executeButton) {
          executeButton.scrollIntoView({ behavior: 'auto', block: 'center' })
        }
      }, [instanceIndex, functionIndex])
      .perform(function (client, done) {
        if (expectedInput) {
          client.setValue(
            `[data-id="deployedContractItem-${instanceIndex}-input-${functionIndex}"]`,
            expectedInput.values,
            (_) => _
          )
        }
        done()
      })
      .click(`[data-id="deployedContractItem-${instanceIndex}-button-${functionIndex}"]`)
      .pause(2000)
      .waitForElementPresent(`[data-id="contractItem-${functionIndex}"] > [data-id="udapp_tree_value"]`)
      .assert.containsText(
        `[data-id="contractItem-${functionIndex}"] > [data-id="udapp_tree_value"]`,
        expectedOutput
      )
      .perform(() => {
        this.emit('complete')
      })
    return this
  }
}

module.exports = TestConstantFunction
