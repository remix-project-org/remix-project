import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class RefreshPage extends EventEmitter {
  command(this: NightwatchBrowser) {
    browser
      .refresh()
      .verifyLoad()
      .perform((done) => {
        //if (hideToolTips) {
        browser.execute(function () {
          // hide tooltips
          function addStyle(styleString) {
            const style = document.createElement('style')
            style.textContent = styleString
            document.head.append(style)
          }

          addStyle(`
                .popover {
                  display:none !important;
                }
                #scamDetails {
                  display:none !important;
                }
                #nudge-widget-container,
                .nudge-widget,
                .nudge-modal-backdrop,
                .nudge-decoration {
                  display: none !important;
                  opacity: 0 !important;
                  visibility: hidden !important;
                }
                `)
        }, [], done())
      })
      .perform((done) => {
        done()
        this.emit('complete')
      })
  }
}

module.exports = RefreshPage
