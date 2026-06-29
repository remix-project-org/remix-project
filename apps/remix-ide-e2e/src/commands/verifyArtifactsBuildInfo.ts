import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

interface BuildInfoVersionCheck {
  packagePath: string
  versionComment: string
  description: string
}

class VerifyArtifactsBuildInfo extends EventEmitter {
  command (this: NightwatchBrowser, versionChecks: BuildInfoVersionCheck[]): NightwatchBrowser {
    this.api.perform((done) => {
      verifyBuildInfo(this.api, versionChecks, () => {
        done()
        this.emit('complete')
      })
    })
    return this
  }
}

function verifyBuildInfo (browser: NightwatchBrowser, versionChecks: BuildInfoVersionCheck[], callback: VoidFunction) {
  browser
    .waitForElementVisible('*[data-id="treeViewDivDraggableItemartifacts"]', 60000)
    // Expand all folders in artifacts to ensure build-info is visible
    .expandAllFolders('artifacts')
    .waitForElementVisible('*[data-id="treeViewDivDraggableItemartifacts/build-info"]', 60000)
    // Click any .json file in the build-info directory using XPath
    .pause(1000)
    .useXpath()
    .waitForElementVisible('//li[starts-with(@data-id, "treeViewLitreeViewItemartifacts/build-info/") and substring(@data-id, string-length(@data-id) - 4) = ".json"]', 10000)
    .click('//li[starts-with(@data-id, "treeViewLitreeViewItemartifacts/build-info/") and substring(@data-id, string-length(@data-id) - 4) = ".json"]')
    .useCss()
    .pause(2000)
    .getEditorValue((content) => {
      try {
        const buildInfo = JSON.parse(content)
        const sources = buildInfo.input.sources
        const sourceFiles = Object.keys(sources)

        // Verify each version check
        for (const check of versionChecks) {
          const matchingFile = sourceFiles.find(file => 
            file.includes(check.packagePath) && 
            sources[file].content.includes(check.versionComment)
          )
          browser.assert.ok(
            !!matchingFile, 
            check.description
          )
        }

        browser.assert.ok(true, 'All version checks passed in build-info')
        callback()
      } catch (e) {
        browser.assert.fail('Build info should be valid JSON: ' + e.message)
        callback()
      }
    })
}

module.exports = VerifyArtifactsBuildInfo
