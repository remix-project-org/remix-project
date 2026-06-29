'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

const goToDefinition = (browser: NightwatchBrowser, path: string) => {
  ;(browser as any)
    .useXpath()
    .waitForElementVisible(path)
    .click(path)
    .perform(function () {
      const actions = this.actions({ async: true })
      return actions.sendKeys(this.Keys.F12)
    })
    .useCss()
}

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done, 'http://127.0.0.1:8080', false)
  },

  'Should load test file with external imports #group9': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .addFile('GoToDefinitionTest.sol', {content: goToDefinitionSource})
      .openFile('GoToDefinitionTest.sol')
      .waitForElementVisible('#editorView')
      .pause(4000) // wait for compiler to finish and resolution index to be created
  },

  'Should jump to ERC20 definition on F12 #group9': function (browser: NightwatchBrowser) {
    const importPath = "//*[@class='view-line' and contains(.,'import') and contains(.,'@openzeppelin/contracts/token/ERC20/ERC20.sol')]//span//span[contains(.,'@openzeppelin/contracts/token/ERC20/ERC20.sol')]"
    
    browser.scrollToLine(4)
    goToDefinition(browser, importPath)
    browser
      .pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(content.includes('contract ERC20'), 'Should open ERC20.sol and show ERC20 contract')
        browser.assert.ok(content.includes('IERC20'), 'ERC20.sol should contain IERC20 interface reference')
      })
  },

  'Should jump to Ownable definition on F12 #group9': function (browser: NightwatchBrowser) {
    browser
      .openFile('GoToDefinitionTest.sol')
      .waitForElementVisible('#editorView')
      .pause(2000)
      .scrollToLine(5)

    const ownablePath = "//*[@class='view-line' and contains(.,'import') and contains(.,'@openzeppelin/contracts/access/Ownable.sol')]//span//span[contains(.,'@openzeppelin/contracts/access/Ownable.sol')]"
    
    goToDefinition(browser, ownablePath)
    browser
      .pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(content.includes('abstract contract Ownable'), 'Should open Ownable.sol and show Ownable contract')
        browser.assert.ok(content.includes('onlyOwner'), 'Ownable.sol should contain onlyOwner modifier')
      })
  },

  'Should jump to inherited contract definition #group9': function (browser: NightwatchBrowser) {
    browser
      .openFile('GoToDefinitionTest.sol')
      .waitForElementVisible('#editorView')
      .pause(2000)
      .scrollToLine(7)

    // Click on ERC20 in the contract inheritance line
    const erc20InheritancePath = "//*[@class='view-line' and contains(.,'contract') and contains(.,'MyToken') and contains(.,'ERC20')]//span//span[contains(.,'ERC20') and not(contains(.,'import'))]"
    
    goToDefinition(browser, erc20InheritancePath)
    browser
      .pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(content.includes('contract ERC20'), 'Should jump to ERC20 contract definition from inheritance')
      })
  },

  'Should jump to local contract definition #group9': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .addFile('Helper.sol', {content: helperContractSource})
      .addFile('Main.sol', {content: mainContractSource})
      .openFile('Main.sol')
      .waitForElementVisible('#editorView')
      .pause(4000)
      .scrollToLine(4)

    // Click on Helper import
    const helperImportPath = "//*[@class='view-line' and contains(.,'import') and contains(.,'./Helper.sol')]//span//span[contains(.,'./Helper.sol')]"
    
    goToDefinition(browser, helperImportPath)
    browser
      .pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(content.includes('contract Helper'), 'Should jump to local Helper.sol contract')
        browser.assert.ok(content.includes('function help()'), 'Helper.sol should contain help function')
      })
  },

  // Remapping tests
  'Should load test file with remapping imports #group10': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .addFile('remappings.txt', {content: remappingsSource})
      .addFile('RemappingTest.sol', {content: remappingTestSource})
      .openFile('RemappingTest.sol')
      .waitForElementVisible('#editorView')
      .pause(4000) // wait for compiler and resolution
  },

  'Should jump to ERC20 via oz= remapping on F12 #group10': function (browser: NightwatchBrowser) {
    // Click on oz/token/ERC20/ERC20.sol import path
    const ozImportPath = "//*[@class='view-line' and contains(.,'import') and contains(.,'oz/token/ERC20/ERC20.sol')]//span//span[contains(.,'oz/token/ERC20/ERC20.sol')]"
    
    browser.scrollToLine(4)
    goToDefinition(browser, ozImportPath)
    browser
      .pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(content.includes('contract ERC20'), 'Should resolve oz/ remapping and open ERC20.sol')
        browser.assert.ok(content.includes('IERC20'), 'ERC20.sol should contain IERC20 reference')
      })
  },

  'Should jump to Ownable via oz= remapping on F12 #group10': function (browser: NightwatchBrowser) {
    browser
      .openFile('RemappingTest.sol')
      .waitForElementVisible('#editorView')
      .pause(2000)
      .scrollToLine(5)

    const ozOwnablePath = "//*[@class='view-line' and contains(.,'import') and contains(.,'oz/access/Ownable.sol')]//span//span[contains(.,'oz/access/Ownable.sol')]"
    
    goToDefinition(browser, ozOwnablePath)
    browser
      .pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(content.includes('abstract contract Ownable'), 'Should resolve oz/ to Ownable contract')
        browser.assert.ok(content.includes('onlyOwner'), 'Ownable.sol should contain onlyOwner modifier')
      })
  },

  'Should verify remapping in resolution index #group10': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 60000)
      .click('*[data-id="treeViewDivDraggableItem.deps"]')
      .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm"]', 60000)
      .click('*[data-id="treeViewDivDraggableItem.deps/npm"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/.resolution-index.json"]', 60000)
      .openFile('.deps/npm/.resolution-index.json')
      .pause(1000)
      .getEditorValue((content) => {
        try {
          const idx = JSON.parse(content)
          const remappingFileEntry = Object.keys(idx).find(file => file.includes('RemappingTest.sol'))
          
          if (remappingFileEntry) {
            const mappings = idx[remappingFileEntry]
            const importKeys = Object.keys(mappings)
            
            // Check that oz/ imports are in the resolution index
            const hasOzERC20 = importKeys.some(key => key.includes('oz/token/ERC20'))
            browser.assert.ok(hasOzERC20, 'Resolution index should contain oz/token/ERC20 remapping')
            
            // Verify resolved paths point to versioned @openzeppelin
            const ozImport = importKeys.find(key => key.includes('oz/'))
            if (ozImport) {
              const resolvedPath = mappings[ozImport]
              browser.assert.ok(
                resolvedPath && resolvedPath.includes('@openzeppelin/contracts@5.0.2'),
                'Remapped oz/ imports should resolve to @openzeppelin/contracts@5.0.2'
              )
            }
          }
        } catch (e) {
          browser.assert.ok(false, 'Resolution index should be valid JSON: ' + e.message)
        }
      })
  },

  // GitHub raw URL import tests
  'Should load test file with GitHub raw import #group11': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .addFile('GithubImportTest.sol', {content: githubImportTestSource})
      .openFile('GithubImportTest.sol')
      .waitForElementVisible('#editorView')
      .pause(8000) // GitHub imports may take longer
  },

  'Should jump to GitHub raw import on F12 #group11': function (browser: NightwatchBrowser) {
    // Click on the GitHub raw URL import
    const githubImportPath = "//*[@class='view-line' and contains(.,'import') and contains(.,'raw.githubusercontent.com')]//span//span[contains(.,'ERC1155Upgradeable.sol')]"
    
    browser.scrollToLine(4)
    goToDefinition(browser, githubImportPath)
    browser
      .pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(
          content.includes('contract ERC1155Upgradeable') || content.includes('abstract contract ERC1155Upgradeable'),
          'Should open ERC1155Upgradeable.sol from GitHub'
        )
        browser.assert.ok(content.includes('IERC1155'), 'ERC1155Upgradeable.sol should reference IERC1155')
      })
  },

  'Should verify GitHub import in file tree #group11': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 60000)
      .click('*[data-id="treeViewDivDraggableItem.deps"]')
      .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/github"]', 60000)
      .click('*[data-id="treeViewDivDraggableItem.deps/github"]')
      .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/github/OpenZeppelin"]', 60000)
      .click('*[data-id="treeViewDivDraggableItem.deps/github/OpenZeppelin"]')
      // Should see openzeppelin-contracts-upgradeable@v5.4.0
      .waitForElementVisible('*[data-id^="treeViewDivDraggableItem.deps/github/OpenZeppelin/openzeppelin-contracts-upgradeable@v5.4.0"]', 60000)
      .perform(function () {
        browser.assert.ok(true, 'GitHub imports should be stored in .deps/github folder with version tag')
      })
  },

  'Should verify GitHub import in resolution index #group11': function (browser: NightwatchBrowser) {
    browser
      .expandAllFolders()
      .openFile('.deps/npm/.resolution-index.json')
      .pause(1000)
      .getEditorValue((content) => {
        try {
          const idx = JSON.parse(content)
          const githubFileEntry = Object.keys(idx).find(file => file.includes('GithubImportTest.sol'))
          
          if (githubFileEntry) {
            const mappings = idx[githubFileEntry]
            const importKeys = Object.keys(mappings)
            
            // Check that raw.githubusercontent.com URL is in the index
            const hasGithubImport = importKeys.some(key => key.includes('raw.githubusercontent.com'))
            browser.assert.ok(hasGithubImport, 'Resolution index should contain GitHub raw URL import')
            
            // Verify resolved path points to .deps/github with version
            const githubImport = importKeys.find(key => key.includes('raw.githubusercontent.com'))
            if (githubImport) {
              const resolvedPath = mappings[githubImport]
              browser.assert.ok(
                resolvedPath && resolvedPath.includes('.deps/github/OpenZeppelin/openzeppelin-contracts-upgradeable@v5.4.0'),
                'GitHub imports should resolve to .deps/github/OpenZeppelin/openzeppelin-contracts-upgradeable@v5.4.0'
              )
            }
          }
        } catch (e) {
          browser.assert.ok(false, 'GitHub resolution index should be valid JSON: ' + e.message)
        }
      })
  },

}

const goToDefinitionSource = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MyToken is ERC20, Ownable {
    constructor() ERC20("MyToken", "MTK") Ownable(msg.sender) {
        _mint(msg.sender, 1000000 * 10 ** decimals());
    }

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}
`

const helperContractSource = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Helper {
    function help() public pure returns (string memory) {
        return "I'm helping!";
    }
}
`

const mainContractSource = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Helper.sol";

contract Main {
    Helper public helper;

    constructor() {
        helper = new Helper();
    }

    function getHelp() public view returns (string memory) {
        return helper.help();
    }
}
`

const remappingsSource = `oz/=@openzeppelin/contracts@5.0.2/`

const remappingTestSource = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "oz/token/ERC20/ERC20.sol";
import "oz/access/Ownable.sol";

contract RemappingTest is ERC20, Ownable {
    constructor() ERC20("RemapToken", "RMP") Ownable(msg.sender) {
        _mint(msg.sender, 1000000 * 10 ** decimals());
    }

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}
`

const githubImportTestSource = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts-upgradeable/v5.4.0/contracts/token/ERC1155/ERC1155Upgradeable.sol";

contract GithubImportTest is ERC1155Upgradeable {
    function initialize() public initializer {
        __ERC1155_init("https://token-cdn-domain/{id}.json");
    }

    function mint(address to, uint256 id, uint256 amount) public {
        _mint(to, id, amount, "");
    }
}
`

