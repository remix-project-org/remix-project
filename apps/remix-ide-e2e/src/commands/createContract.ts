import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class CreateContract extends EventEmitter {
  command (this: NightwatchBrowser, inputParams: string): NightwatchBrowser {
    this.api.perform((done) => {
      createContract(this.api, inputParams, () => {
        done()
        this.emit('complete')
      })
    })
    return this
  }
}

function createContract (browser: NightwatchBrowser, inputParams: string, callback: VoidFunction) {
  browser.execute(function () {
    // Use JavaScript to click the button, avoiding sticky header issues
    const deployButton = document.querySelector('[data-id="deployButton"]') as HTMLElement
    if (deployButton) {
      deployButton.scrollIntoView({ behavior: 'auto', block: 'center' })
    }
  })
  if (inputParams) {
    const params = inputParams.split(',')

    // Get the number of constructor inputs
    browser.execute(function () {
      const inputs = document.querySelectorAll('input[data-id^="constructorInput"]')
      return inputs.length
    }, [], function (result: any) {
      const inputCount = result.value

      // Fill each input sequentially using Nightwatch setValue
      const fillInputs = (index: number) => {
        if (index >= inputCount) {
          // All inputs filled, now deploy
          browser
            .pause(500) // wait for React to update
            .waitForElementVisible('[data-id="deployButton"]')
            .click('[data-id="deployButton"]')
            .pause(500)
            .perform(function () { callback() })
          return
        }

        const selector = `input[data-id="constructorInput${index}"]`
        const value = params[index]

        browser
          .waitForElementVisible(selector, 5000)
          .clearValue(selector)
          .setValue(selector, value)
          .pause(1000)
          .perform(() => fillInputs(index + 1))
      }

      fillInputs(0)
    })
  } else {
    browser
      .waitForElementVisible('[data-id="deployButton"]')
      .click('[data-id="deployButton"]')
      .pause(500)
      .perform(function () { callback() })
  }
}

module.exports = CreateContract
