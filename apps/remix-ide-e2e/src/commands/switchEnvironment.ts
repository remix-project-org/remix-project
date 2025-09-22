'use strict'
import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class switchEnvironment extends EventEmitter {
  command (this: NightwatchBrowser, provider: string, returnWhenInitialized?: boolean): NightwatchBrowser {
    const submenuLabels = ['Remix VM', 'Browser extension', 'Dev']

    const clickAndMaybeWait = (
      browser: NightwatchBrowser,
      cssSelector: string,
      providerName: string,
      shouldWait?: boolean
    ) => {
      browser
        .waitForElementVisible(cssSelector, 10000)
        .click(cssSelector)
        .perform((done) => {
          if (shouldWait) {
            browser
              .waitForElementVisible(`[data-id="selected-provider-${providerName}"]`, 15000)
              .pause(1000)
              .perform(() => done())
          } else {
            done()
          }
        })
    }

    const ensureDropdownClosed = (browser: NightwatchBrowser) => {
      browser
        .isVisible('body .dropdown-menu.show', (open) => {
          if (open.value) browser.click('[data-id="settingsSelectEnvOptions"] button')
        })
    }

    const waitForSelectedOrModal = (
      browser: NightwatchBrowser,
      providerName: string,
      timeoutMs = 10000,
      cb?: (ok: boolean) => void
    ) => {
      const start = Date.now()
      const poll = () => {
        browser.isPresent({ selector: `[data-id="selected-provider-${providerName}"]`, suppressNotFoundErrors: true, timeout: 0 }, (selRes) => {
          if (selRes.value) return cb && cb(true)
          browser.isPresent({ selector: `*[data-id="${providerName}ModalDialogModalBody-react"]`, suppressNotFoundErrors: true, timeout: 0 }, (modalBody) => {
            if (modalBody.value) return cb && cb(true)
            browser.isPresent({ selector: `*[data-id="${providerName}ModalDialogContainer-react"]`, suppressNotFoundErrors: true, timeout: 0 }, (modalContainer) => {
              if (modalContainer.value) return cb && cb(true)
              if (Date.now() - start > timeoutMs) return cb && cb(false)
              browser.pause(200).perform(poll)
            })
          })
        })
      }
      poll()
    }

    const tryHoverSubmenusAndClick = (
      browser: NightwatchBrowser,
      labels: string[],
      providerName: string,
      shouldWait: boolean,
      onDone: VoidFunction
    ) => {
      const tryOne = (i: number) => {
        if (i >= labels.length) return onDone()
        const submenuXPath = `//span[contains(@class,'dropdown-item') and normalize-space()='${labels[i]}']`

        browser
          .useXpath()
          .isPresent({
            selector: submenuXPath,
            suppressNotFoundErrors: true,
            timeout: 0
          }, (present) => {
            if (!present.value) {
              browser.useCss()
              return tryOne(i + 1)
            }
            browser
              .execute(function(xpath) {
                const element = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue
                if (element) {
                  const event = new MouseEvent('mouseover', { 'view': window, 'bubbles': true, 'cancelable': true })
                  element.dispatchEvent(event)
                }
              },
              [submenuXPath]
            )
              .useCss()
              .isPresent({
                selector: `body .dropdown-menu.show [data-id="dropdown-item-${providerName}"]`,
                suppressNotFoundErrors: true,
                timeout: 2000
              }, (inPortal) => {
                if (inPortal.value) {
                  clickAndMaybeWait(browser, `body .dropdown-menu.show [data-id="dropdown-item-${providerName}"]`, providerName, shouldWait)
                  onDone()
                } else {
                  tryOne(i + 1)
                }
              })
          })
      }
      tryOne(0)
    }

    const attemptSelect = (
      browser: NightwatchBrowser,
      providerName: string,
      shouldWait?: boolean,
      onComplete?: VoidFunction
    ) => {
      browser
        .isPresent({ selector: `[data-id="dropdown-item-${providerName}"]`, suppressNotFoundErrors: true, timeout: 1500 }, (topLevel) => {
          if (topLevel.value) {
            clickAndMaybeWait(browser, `[data-id="dropdown-item-${providerName}"]`, providerName, shouldWait)
            onComplete && browser.perform(() => onComplete())
          } else {
            tryHoverSubmenusAndClick(browser, submenuLabels, providerName, !!shouldWait, () => {
              onComplete && browser.perform(() => onComplete())
            })
          }
        })
    }

    this.api
      .useCss()
      .waitForElementVisible('[data-id="settingsSelectEnvOptions"]', 10000)
      .perform((done) => {
        this.api.isPresent({ selector: `[data-id="selected-provider-${provider}"]`, suppressNotFoundErrors: true, timeout: 1000 }, (result) => {
          if (result.value) return done()
          
          this.api.click('[data-id="settingsSelectEnvOptions"] button')
            .waitForElementVisible('body .dropdown-menu.show', 3000)
            .perform(() => {
              attemptSelect(this.api, provider, returnWhenInitialized, () => {
                waitForSelectedOrModal(this.api, provider, 10000, (ok) => {
                  if (ok) {
                    return done()
                  } else {
                    this.api.assert.fail(`Environment "${provider}" could not be selected or found in the dropdown.`)
                    done()
                  }
                })
              })
            })
        })
      })
      .perform(() => this.emit('complete'))

    return this
  }
}

module.exports = switchEnvironment