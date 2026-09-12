import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class OpenFile extends EventEmitter {
  command (this: NightwatchBrowser, name: string) {
    this.api.perform((done) => {
      openFile(this.api, name, () => {
        done()
        this.api.pause(2000).perform(() => this.emit('complete'))
      })
    })
    return this
  }
}

// click on fileExplorer can toggle it. We go through settings to be sure FE is open
function openFile (browser: NightwatchBrowser, name: string, done: VoidFunction) {
  browser.perform((done) => {
    browser.isVisible('[data-id="remixIdeSidePanel"]', (result) => {
      if (result.value) {
        // if side panel is shown, check this is the file panel
        browser.element('css selector', '[data-id="verticalIconsKindfilePanel"] *[data-id="selected"]', (result) => {
          if (result.status === 0) {
            done()
          } else browser.clickLaunchIcon('filePanel').perform(() => {
            done()
          })
        })
      } else {
        browser.clickLaunchIcon('filePanel').perform(() => {
          done()
        })
      }
    })
  })
    .perform(async () => {
      if (await browser.isVisible({ selector: 'li[data-id="treeViewLitreeViewItem' + name + '"]', suppressNotFoundErrors: true })) {
        browser.click('li[data-id="treeViewLitreeViewItem' + name + '"]')
        done()
        return
      }
      let it = 0
      const split = name.split('/')
      const current = split.splice(0, 1)
      while (true) {
        if (await browser.isVisible({ selector: 'li[data-id="treeViewLitreeViewItem' + current.join('/') + '"]', suppressNotFoundErrors: true }) &&
    !await browser.isPresent({ selector: 'li[data-id="treeViewLitreeViewItem' + current.join('/') + '"] .fa-folder-open', suppressNotFoundErrors: true })) {
          browser.click('li[data-id="treeViewLitreeViewItem' + current.join('/') + '"]')
        }
        if (current.join('/') === name) {
          break
        }
        current.push(split.shift())
        it++
        if (it > 15) {
          browser.assert.fail(name, current.join('/'), 'cannot open file ' + name)
        }
      }
      done()
    })
}

module.exports = OpenFile
