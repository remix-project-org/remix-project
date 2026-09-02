'use strict'
import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class switchEnvironment extends EventEmitter {
  command (this: NightwatchBrowser, provider: string, category?: string, returnWhenInitialized?: boolean): NightwatchBrowser {
    const waitForSelected = (
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

    this.api
      .useCss()
      .waitForElementVisible('[data-id="settingsSelectEnvOptions"]', 10000)
      .click('[data-id="settingsSelectEnvOptions"]')
      .perform((done) => {
        this.api.isVisible({ selector: `[data-id="dropdown-item-${provider}"]`, suppressNotFoundErrors: true, timeout: 1000 }, (topLevel) => {
          if (topLevel.value) {
            // Directly-selectable provider, no category submenu involved.
            this.api.click(`[data-id="dropdown-item-${provider}"]`).perform(() => done())
            return
          }
          if (!category) {
            this.api.assert.fail(`Environment "${provider}" could not be found in the dropdown.`)
            return done()
          }
          this.api.isVisible({ selector: `[data-id="dropdown-item-${category}"]`, suppressNotFoundErrors: true, timeout: 1000 }, (categoryVisible) => {
            if (!categoryVisible.value) {
              this.api.assert.fail(`Environment category "${category}" could not be found in the dropdown.`)
              return done()
            }
            this.api
              .click(`[data-id="dropdown-item-${category}"]`)
              .perform(() => {
                // The category may already have applied the target provider as its default.
                this.api.isPresent({ selector: `[data-id="selected-provider-${provider}"]`, suppressNotFoundErrors: true, timeout: 500 }, (already) => {
                  if (already.value) return done()
                  this.api
                    .waitForElementVisible('[data-id="settingsSelectEnvCategoryOptions"]', 10000)
                    .click('[data-id="settingsSelectEnvCategoryOptions"]')
                    .waitForElementVisible(`[data-id="dropdown-item-${provider}"]`, 10000)
                    .click(`[data-id="dropdown-item-${provider}"]`)
                    .perform(() => done())
                })
              })
          })
        })
      })
      .perform(() => {
        waitForSelected(this.api, provider, 10000, (ok) => {
          if (!ok) this.api.assert.fail(`Environment "${provider}" could not be selected or found in the dropdown.`)
          this.emit('complete')
        })
      })

    return this
  }
}

module.exports = switchEnvironment