import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class ExpandAllFolders extends EventEmitter {
  command (this: NightwatchBrowser, targetDirectory?: string) {
    this.api.perform((done) => {
      expandAllFolders(this.api, targetDirectory, () => {
        done()
        this.emit('complete')
      })
    })
    return this
  }
}

function expandAllFolders (browser: NightwatchBrowser, targetDirectory?: string, done?: VoidFunction) {
  // Ensure file panel is open
  browser.perform((bdone: VoidFunction) => {
    browser.isVisible('[data-id="remixIdeSidePanel"]', (result) => {
      if (result.value) {
        browser.element('css selector', '[data-id="verticalIconsKindfilePanel"] img[data-id="selected"]', (result) => {
          if (result.status === 0) {
            bdone()
          } else browser.clickLaunchIcon('filePanel').perform(() => {
            bdone()
          })
        })
      } else {
        browser.clickLaunchIcon('filePanel').perform(() => {
          bdone()
        })
      }
    })
  })
    .perform(() => {
      let attempts = 0
      const maxAttempts = 200

      const expandNextClosedFolder = () => {
        if (attempts >= maxAttempts) {
          if (done) done()
          return
        }
        attempts++

        const closedFolderSelector = targetDirectory
          ? `li[data-id*="treeViewLitreeViewItem${targetDirectory}"]:not(:has([data-id="fileExplorerTreeItemInput"])) .fa.fa-folder:not(.fa-folder-open)`
          : 'li[data-id*="treeViewLitreeViewItem"]:not(:has([data-id="fileExplorerTreeItemInput"])) .fa.fa-folder:not(.fa-folder-open)'

        browser.element('css selector', closedFolderSelector, (result) => {
          if (result.status === 0 && result.value) {
            // Found a closed folder icon, find the treeViewDiv of this folder and click it
            const ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf' // W3C WebDriver standard element key
            const folderElementId = (result.value as any)[ELEMENT_KEY]
            
            // Navigate to the IMMEDIATE parent div with treeViewDiv, not any ancestor
            browser.elementIdElement(folderElementId, 'xpath', './parent::div[starts-with(@data-id, "treeViewDiv")]', (divResult) => {
              if (divResult.status === 0 && divResult.value) {
                const divElementId = (divResult.value as any)[ELEMENT_KEY]
                if (divElementId) {
                  browser.elementIdClick(divElementId)
                    .pause(200) // Wait for folder to expand and DOM to update  
                    .perform(() => {
                      expandNextClosedFolder()
                    })
                } else {
                  // Skip this one and try next
                  attempts += 10 // Advance attempts to avoid infinite loop
                  browser.pause(200).perform(() => expandNextClosedFolder())
                }
              } else {
                // Skip this one and try next
                attempts += 10 // Advance attempts to avoid infinite loop
                browser.pause(200).perform(() => expandNextClosedFolder())
              }
            })
          } else {
            if (done) done()
          }
        })
      }

      expandNextClosedFolder()
    })
}

module.exports = ExpandAllFolders