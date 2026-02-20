import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'
import { callbackCheckVerifyCallReturnValue } from '../types/index'

class VerifyCallReturnValue extends EventEmitter {
  command (this: NightwatchBrowser, address: string, checks: string[]): NightwatchBrowser {
    this.api.perform((done) => {
      verifyCallReturnValue(this.api, address, checks, () => {
        done()
        this.emit('complete')
      })
    })
    return this
  }
}

function verifyCallReturnValue (browser: NightwatchBrowser, address: string, checks: string[] | callbackCheckVerifyCallReturnValue, done: VoidFunction) {
  browser
    .waitForElementVisible({
      locateStrategy: 'css selector',
      selector: '#instance' + address + ' [data-id="udapp_tree_value"]',
      timeout: 240000
    })
    .execute(function (address: string) {
    const nodes = document.querySelectorAll('#instance' + address + ' [data-id="udapp_tree_value"]') as NodeListOf<HTMLElement>
    const ret = []
    for (let k = 0; k < nodes.length; k++) {
      const text = nodes[k].innerText ? nodes[k].innerText : nodes[k].textContent
      ret.push(text.replace('\n', ''))
    }
    return ret
  }, [address], function (result) {
    if (typeof checks === 'function') {
      const ret = checks(result.value as string[])
      if (!ret.pass) browser.assert.fail(ret.message)
    } else {
      for (const k in checks) {
        browser.assert.equal(result.value[k].trim(), checks[k].trim())
      }
    }
    done()
  })
}

module.exports = VerifyCallReturnValue
