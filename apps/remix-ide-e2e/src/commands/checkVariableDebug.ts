import { NightwatchBrowser, NightwatchCheckVariableDebugValue } from 'nightwatch'
import EventEmitter from 'events'

class CheckVariableDebug extends EventEmitter {
  command(this: NightwatchBrowser, id: string, debugValue: NightwatchCheckVariableDebugValue): NightwatchBrowser {
    this.api.perform((done) => {
      checkDebug(this.api, id, debugValue, () => {
        done()
        this.emit('complete')
      })
    })
    return this
  }
}

function checkDebug(browser: NightwatchBrowser, id: string, debugValue: NightwatchCheckVariableDebugValue, done: VoidFunction) {
  // id is soliditylocals or soliditystate
  // Map id to data-id attribute (capitalize first letter after 'solidity')
  const dataId = id === 'soliditylocals' ? 'solidityLocals' : id === 'soliditystate' ? 'solidityState' : id

  // First, wait for the container to be visible
  browser.waitForElementVisible(`*[data-id="${dataId}"]`, 10000)
    .pause(1000) // Wait for variables to render after parent expansion

  // Expand and check each variable in the debugValue object
  const keys = Object.keys(debugValue)

  // Filter out keys with special characters (like <1>, <2>, etc.)
  // Only check variables that are valid identifiers (letters, numbers, underscore)
  const validKeys = keys.filter(key => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key))

  let allMatch = true
  let errorMessages: string[] = []

  // Process each key in sequence
  for (const key of validKeys) {
    const expectedValue = debugValue[key]
    const expandIconSelector = `*[data-id="${key}-expand-icon"]`
    const nestedContainerSelector = `[data-id="${key}-json-nested"]`

    // Wait for the expand icon to be visible
    browser.waitForElementVisible(expandIconSelector, 10000)

    // Check if already expanded and click if needed
    // Expanded icons have 'fa-minus-square' class, collapsed have 'fa-plus-square'
    browser.execute(function (iconSelector: string) {
      const icon = document.querySelector(iconSelector)
      if (icon) {
        const isExpanded = icon.classList.contains('fa-minus-square')
        if (!isExpanded) {
          // Not expanded, click to expand
          (icon as HTMLElement).click()
        }
      }
    }, [`[data-id="${key}-expand-icon"]`])
      .pause(500) // Wait for expansion animation (if clicked) or for DOM to stabilize

    // Check each property in the expected value
    if (typeof expectedValue === 'object' && expectedValue !== null) {
      for (const [prop, propValue] of Object.entries(expectedValue)) {
        // Skip complex nested objects and arrays - only check primitive values
        if (typeof propValue === 'object' && propValue !== null) {
          continue
        }

        const valueSelector = `${nestedContainerSelector} [data-id="${prop}-json-value"]`

        // Convert the expected value to string format (JSON strings are quoted in the renderer)
        let expectedText: string
        if (typeof propValue === 'string') {
          // All string values are rendered as JSON strings with quotes
          expectedText = `"${propValue}"`
        } else if (typeof propValue === 'boolean') {
          // Booleans are rendered as is
          expectedText = String(propValue)
        } else if (typeof propValue === 'number') {
          // Numbers are rendered as strings with quotes
          expectedText = `"${propValue}"`
        } else {
          // Other primitive types
          expectedText = String(propValue)
        }

        // Wait for the element and check if text contains the expected value
        browser.waitForElementVisible(valueSelector, 10000)
        browser.getText(valueSelector, (result) => {
          const actualValue = result.value
          if (typeof actualValue === 'string') {
            const actualTrimmed = actualValue.trim()

            if (actualTrimmed !== expectedText) {
              allMatch = false
              errorMessages.push(
                `Mismatch for ${key}.${prop}: expected ${expectedText}, got ${actualTrimmed}`
              )
            }
          }
        })
      }
    }
  }

  // Final check and done
  browser.perform(() => {
    if (!allMatch) {
      browser.assert.fail(
        'Variable values do not match',
        errorMessages.join('\n'),
        'Expected all variables to match'
      )
    }
    done()
  })
}

module.exports = CheckVariableDebug
