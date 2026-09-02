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
          client.waitForElementPresent(inputSelector).clearValue(inputSelector).setValue(inputSelector, input)
        })
        done()
      })
      .waitForElementPresent(executeBtnSelector)
      .click(executeBtnSelector)
      .pause(2000)
      .waitForElementPresent(`${functionRowSelector} [data-id="udapp_tree_value"]`)
      .assert.containsText(
        `${functionRowSelector} [data-id="udapp_tree_value"]`,
        expectedOutput
      )
      .perform(() => {
        this.emit('complete')
      })
    return this
  }
}

module.exports = TestConstantFunction
