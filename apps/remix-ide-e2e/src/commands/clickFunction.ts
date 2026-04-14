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
      .execute(function (instanceIndex) {
        // First, find and click the deployed contract item to expand it
        const contractItem = document.querySelector(`[data-id="deployedContractItem-${instanceIndex}"]`) as HTMLElement
        if (contractItem) {
          contractItem.scrollIntoView({ behavior: 'auto', block: 'center' })
          contractItem.click()
        }
      }, [instanceIndex])
      .pause(500) // Wait for expansion
      .execute(function (instanceIndex) {
        // Find and click the dropdown toggle to open the function list
        const dropdownToggle = document.querySelector(`[data-id="deployedContractItem-${instanceIndex}"]`)
          ?.closest('.mb-3')
          ?.querySelector('.dropdown-toggle') as HTMLElement
        if (dropdownToggle) {
          dropdownToggle.scrollIntoView({ behavior: 'auto', block: 'center' })
          dropdownToggle.click()
        }
      }, [instanceIndex])
      .pause(300) // Wait for dropdown to open
      .execute(function (instanceIndex, functionIndex) {
        // Find and click the specific function in the dropdown menu
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
