'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

module.exports = {
    '@disabled': true, // Set to true to disable this test suite
    before: function (browser: NightwatchBrowser, done: VoidFunction) {
        init(browser, done)
    },

    'Test deep imports workspace set #group25': function (browser: NightwatchBrowser) {
        browser

            .waitForElementVisible('*[data-id="compilerContainerAutoCompile"]')
            .click('[data-id="compilerContainerAutoCompile"]')
            .waitForElementVisible('*[data-id="topbar-settingsIcon"]')
            .click('*[data-id="topbar-settingsIcon"]')
            .waitForElementVisible('*[data-id="settings-sidebar-general"]')
            .click('*[data-id="settings-sidebar-general"]')
            .waitForElementPresent('[data-id="generate-contract-metadataSwitch"]')
            .click('[data-id="generate-contract-metadataSwitch"]')
            .clickLaunchIcon('filePanel')
            .addFile('DeepImportsToken.sol', deepImportsSource['DeepImportsToken.sol'])
            .addFile('access/Lockable.sol', deepImportsSource['access/Lockable.sol'])
            .addFile('access/RoleManager.sol', deepImportsSource['access/RoleManager.sol'])
            .addFile('mocks/TokenReceiverMock.sol', deepImportsSource['mocks/TokenReceiverMock.sol'])
            .addFile('security/Pausable.sol', deepImportsSource['security/Pausable.sol'])
            .addFile('utils/interfaces/ITokenReceiver.sol', deepImportsSource['utils/interfaces/ITokenReceiver.sol'])
            .addFile('utils/libraries/SafeOperations.sol', deepImportsSource['utils/libraries/SafeOperations.sol'])
            .openFile('DeepImportsToken.sol')
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .waitForElementPresent('*[data-id="compiledContracts"]', 10000)
            .perform(function () {
                browser.assert.ok(true, 'Deep imports workspace compiled successfully')
            })
            .clickLaunchIcon('filePanel')
            // Verify build-info artifacts
            .verifyArtifactsBuildInfo([
                {
                    packagePath: 'DeepImportsToken.sol',
                    versionComment: 'SPDX-License-Identifier: MIT',
                    description: 'Should find local DeepImportsToken.sol in build-info'
                },
                {
                    packagePath: 'security/Pausable.sol',
                    versionComment: 'SPDX-License-Identifier: MIT',
                    description: 'Should find local security/Pausable.sol in build-info'
                },
                {
                    packagePath: 'access/RoleManager.sol',
                    versionComment: 'SPDX-License-Identifier: MIT',
                    description: 'Should find local access/RoleManager.sol in build-info'
                },
                {
                    packagePath: 'utils/libraries/SafeOperations.sol',
                    versionComment: 'SPDX-License-Identifier: MIT',
                    description: 'Should find local utils/libraries/SafeOperations.sol in build-info'
                },
                {
                    packagePath: '@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol',
                    versionComment: '5.0.0',
                    description: 'Should find OpenZeppelin v5.4.0 ERC20Burnable.sol in build-info'
                },
                {
                    packagePath: '@openzeppelin/contracts/access/AccessControl.sol',
                    versionComment: '5.4.0',
                    description: 'Should find OpenZeppelin v5.4.0 AccessControl.sol in build-info'
                }
            ])
    },

    'Test import handler system for remix_tests.sol #group26': function (browser: NightwatchBrowser) {
        browser
            .clickLaunchIcon('filePanel')
            .addFile('TestImportHandler.sol', remixTestsHandlerSource['TestImportHandler.sol'])
            .openFile('TestImportHandler.sol')
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(3000)
            .waitForElementPresent('*[data-id="compiledContracts"]', 10000)
            .assert.containsText('*[data-id="compiledContracts"]', 'TestImportHandler')
            .clickLaunchIcon('filePanel')
            .expandAllFolders()
            // Verify remix_tests.sol and remix_accounts.sol were auto-generated
            .waitForElementVisible('*[data-path=".deps/remix-tests/remix_tests.sol"]')
            .waitForElementVisible('*[data-path=".deps/remix-tests/remix_accounts.sol"]')
            .click('*[data-path=".deps/remix-tests/remix_tests.sol"]')
            .pause(500)
            .getEditorValue((content) => {
                browser.assert.ok(content.includes('library Assert'), 'remix_tests.sol should contain Assert library')
                browser.assert.ok(content.includes('event AssertionEvent'), 'remix_tests.sol should contain AssertionEvent')
            })
            .click('*[data-path=".deps/remix-tests/remix_accounts.sol"]')
            .pause(500)
            .getEditorValue((content) => {
                browser.assert.ok(content.includes('library TestsAccounts'), 'remix_accounts.sol should contain TestsAccounts library')
            })
    },

    '@sources': function () {
        return sources
    },

    'Test NPM Import with Versioned Folders #group1': function (browser: NightwatchBrowser) {
        browser
            .clickLaunchIcon('filePanel')
            .click('li[data-id="treeViewLitreeViewItemREADME.txt"]')
            .addFile('UpgradeableNFT.sol', upgradeableNFTSource['UpgradeableNFT.sol'])
            .pause(3000)
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 120000)
            .expandAllFolders()
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm"]')
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin"]')
            // Verify versioned folder naming: contracts-upgradeable@VERSION
            .waitForElementPresent('*[data-id^="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts-upgradeable@"]', 60000)
    },

    'Verify package.json in versioned folder #group1': function (browser: NightwatchBrowser) {
        browser
            .waitForElementVisible('*[data-id$="/package.json"]', 120000)
            .pause(1000)
            .perform(function () {
                // Open the package.json (we need to get the exact selector dynamically)
                browser.elements('css selector', '*[data-id$="/package.json"]', function (result) {
                    if (result.value && Array.isArray(result.value) && result.value.length > 0) {
                        const selector = '*[data-id$="/package.json"]'
                        browser.click(selector)
                    }
                })
            })
            .pause(2000)
            .getEditorValue((content) => {
                browser.assert.ok(content.indexOf('"name": "@openzeppelin/contracts-upgradeable"') !== -1, 'package.json should contain package name')
                browser.assert.ok(content.indexOf('"version"') !== -1, 'package.json should contain version')
                browser.assert.ok(content.indexOf('"dependencies"') !== -1 || content.indexOf('"peerDependencies"') !== -1, 'package.json should contain dependencies')
            })
    },

    'Test workspace package.json version resolution #group2': function (browser: NightwatchBrowser) {
        browser
            // Create a package.json specifying OpenZeppelin version
            .addFile('package.json', packageJsonV4_8_3Source['package.json'])
            .addFile('TokenWithDeps.sol', packageJsonV4_8_3Source['TokenWithDeps.sol'])
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(2000)  // Wait for compilation
            .clickLaunchIcon('filePanel')
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 60000)
            .expandAllFolders()

            // Verify the correct version from package.json was used (4.8.3)
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@4.8.3"]', 60000)
            .waitForElementNotPresent('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@5.4.0"]', 60000)
            .openFile('package.json')
            .setEditorValue(packageJsonV5_4_0Source['package.json'].content) // Change to OpenZeppelin 5.4.0
            .openFile('TokenWithDeps.sol')
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@5.4.0"]', 60000)
    },

    'Verify canonical version is used consistently #group2': function (browser: NightwatchBrowser) {
        browser
            // Click on the versioned folder
            .expandAllFolders()
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@4.8.3/package.json"]')
            .openFile('.deps/npm/@openzeppelin/contracts@4.8.3/package.json')
            .getEditorValue((content) => {
                const packageJson = JSON.parse(content)
                browser.assert.ok(packageJson.version === '4.8.3', 'Should use version 4.8.3 from workspace package.json')
            })
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@5.4.0/package.json"]')
            .openFile('.deps/npm/@openzeppelin/contracts@5.4.0/package.json')
            .getEditorValue((content) => {
                const packageJson = JSON.parse(content)
                browser.assert.ok(packageJson.version === '5.4.0', 'Should use version 5.4.0 from workspace package.json')
            })
    },

    'Test explicit versioned imports #group3': function (browser: NightwatchBrowser) {
        browser
            .addFile('ExplicitVersions.sol', explicitVersionsSource['ExplicitVersions.sol'])
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(1000)
            .clickLaunchIcon('filePanel')
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 60000)
            .expandAllFolders()
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@4.8.3/package.json"]', 60000)
    },

    'Test explicit version override #group4': function (browser: NightwatchBrowser) {
        browser
            .addFile('package.json', conflictingVersionsSource['package.json'])  // Has @openzeppelin/contracts@4.8.3
            .addFile('ConflictingVersions.sol', conflictingVersionsSource['ConflictingVersions.sol'])  // Imports @5
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(1000)
            .clickLaunchIcon('filePanel')

            // Verify that when explicit version @5 is used, it resolves to 5.x.x
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 60000)
            .expandAllFolders()

            // Should have version 5.x.x (not 4.8.3 from package.json) because explicit @5 in import
            .waitForElementPresent('*[data-id^="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@5"]', 10000)
            .waitForElementNotPresent('*[data-id^="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@4.8.3"]', 10000)
    },

    'Test yarn.lock version resolution #group5': function (browser: NightwatchBrowser) {
        browser
            .addFile('yarn.lock', yarnLockV4_9_6Source['yarn.lock'])
            .addFile('YarnLockTest.sol', yarnLockV4_9_6Source['YarnLockTest.sol'])
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(1000) // Longer pause for npm fetch
            .clickLaunchIcon('filePanel')

            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 60000)
            .expandAllFolders()
            // Should use version from yarn.lock (4.9.6)
            .waitForElementPresent('*[data-id^="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@4.9"]', 10000)
    },

    'Test package-lock.json version resolution #group6': function (browser: NightwatchBrowser) {
        browser
            .addFile('package-lock.json', packageLockV4_8_1Source['package-lock.json'])
            .addFile('PackageLockTest.sol', packageLockV4_8_1Source['PackageLockTest.sol'])
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(1000)
            .clickLaunchIcon('filePanel')

            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 60000)
            .expandAllFolders()

            // Should use version from package-lock.json (4.8.1)
            .waitForElementPresent('*[data-id^="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@4.8.1"]', 10000)

    },

    'Test Chainlink CCIP parent dependency resolution #group7': function (browser: NightwatchBrowser) {
        browser
            .addFile('ChainlinkCCIP.sol', chainlinkCCIPSource['ChainlinkCCIP.sol'])

            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 60000)
            .expandAllFolders()
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@chainlink"]')
            // Verify contracts@1.4.0 (not 1.5.0!) - this is the key test for parent dependency resolution
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@chainlink/contracts@1.4.0"]', 10000)
            .waitForElementNotPresent('*[data-id="treeViewDivDraggableItem.deps/npm/@chainlink/contracts@1.5.0"]', 10000)
            // Verify contracts-ccip@1.6.1
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@chainlink/contracts-ccip@1.6.1"]', 10000)
            .waitForElementNotPresent('*[data-id="treeViewDivDraggableItem.deps/npm/@chainlink/contracts-ccip@1.6.2"]', 10000)
    },

    'Test npm alias syntax imports #group8': function (browser: NightwatchBrowser) {
        browser
            .addFile('NpmAliasTest.sol', npmAliasSource['NpmAliasTest.sol'])
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(2000)
            .clickLaunchIcon('filePanel')

            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 60000)
            .expandAllFolders()

            // Verify npm:@openzeppelin/contracts@4.9.0 syntax resolves correctly
            .waitForElementVisible('*[data-id^="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@4.9"]', 10000)
    },

    'Test External URL imports (unpkg) #group8': function (browser: NightwatchBrowser) {
        // Compile a file that imports from unpkg and verify the fetched source appears under .deps/https tree
        browser
            .addFile('GitHubImportTest.sol', unpkgImportSource['GitHubImportTest.sol'])
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(5000)
            .clickLaunchIcon('filePanel')

            // Expand .deps/https/unpkg.com and check the requested path is present
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 120000)
            .expandAllFolders()
            .waitForElementVisible('*[data-id^="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@4.8.0/token/ERC20"]', 60000)
            .waitForElementVisible('*[data-id$="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@4.8.0/token/ERC20/IERC20.sol"]', 60000)
            // Additionally ensure no compilation error for the import
            .elements('css selector', '*[data-id="compiledErrors"]', function (res) {
                if (Array.isArray(res.value) && res.value.length > 0) {
                    browser.getText('*[data-id="compiledErrors"]', (result) => {
                        const text = (result.value || '').toString()
                        browser.assert.ok(
                            !text.includes('not found'),
                            'External CDN import should resolve without not found errors'
                        )
                    })
                } else {
                    // No compiledErrors element found → no errors to display; treat as pass
                    browser.assert.ok(true, 'External CDN import resolved (no compiled errors panel)')
                }
            })

    },

    'Test External URL imports (jsDelivr) #group8': function (browser: NightwatchBrowser) {
        const source = {
            'JsDelivrImport.sol': {
                content: `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\nimport "https://cdn.jsdelivr.net/npm/@openzeppelin/contracts@4.6.0/token/ERC20/IERC20.sol";\ncontract JsDelivrImport {}`
            }
        }
        browser
            .addFile('JsDelivrImport.sol', source['JsDelivrImport.sol'])
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(5000)
            .clickLaunchIcon('filePanel')

            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 120000)
            .expandAllFolders()
            .waitForElementVisible('*[data-id^="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@4.6.0/token/ERC20"]', 60000)
            .waitForElementVisible('*[data-id$="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@4.6.0/token/ERC20/IERC20.sol"]', 60000)
    },

    'Test External URL imports (raw.githubusercontent.com) #group16': function (browser: NightwatchBrowser) {
        const source = {
            'RawGithubImport.sol': {
                content: `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\nimport "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts-upgradeable/v5.4.0/contracts/token/ERC1155/ERC1155Upgradeable.sol";\ncontract RawGithubImport {}`
            }
        }
        browser
            .addFile('RawGithubImport.sol', source['RawGithubImport.sol'])
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 120000)
            .expandAllFolders()
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/github"]', 60000)
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/github/OpenZeppelin"]', 60000)
            .waitForElementVisible('*[data-id^="treeViewDivDraggableItem.deps/github/OpenZeppelin/openzeppelin-contracts-upgradeable@v5.4.0"]', 60000)
            // Verify package.json was fetched from GitHub
            .waitForElementVisible('*[data-id$="treeViewLitreeViewItem.deps/github/OpenZeppelin/openzeppelin-contracts-upgradeable@v5.4.0/package.json"]', 60000)
            .waitForElementVisible('*[data-id$="treeViewLitreeViewItem.deps/github/OpenZeppelin/openzeppelin-contracts-upgradeable@v5.4.0/contracts/token"]', 60000)
            .waitForElementVisible('*[data-id$="treeViewLitreeViewItem.deps/github/OpenZeppelin/openzeppelin-contracts-upgradeable@v5.4.0/contracts/token/ERC1155"]', 60000)
            .waitForElementVisible('*[data-id$="treeViewLitreeViewItem.deps/github/OpenZeppelin/openzeppelin-contracts-upgradeable@v5.4.0/contracts/token/ERC1155/ERC1155Upgradeable.sol"]', 60000)
            // Verify package.json content
            .openFile('.deps/github/OpenZeppelin/openzeppelin-contracts-upgradeable@v5.4.0/package.json')
            .pause(1000)
            .getEditorValue((content) => {
                try {
                    const packageJson = JSON.parse(content)
                    browser.assert.ok(packageJson.name && packageJson.name.includes('openzeppelin'), 'Package.json should contain OpenZeppelin package name')
                    browser.assert.ok(packageJson.version === '5.4.0', 'Package.json should contain correct version 5.4.0')
                    browser.assert.ok(packageJson.description, 'Package.json should contain description')
                } catch (e) {
                    browser.assert.ok(false, 'Package.json should be valid JSON: ' + e.message)
                }
            })
    },

    'Test unversioned GitHub raw import (master/main branch) #group17': function (browser: NightwatchBrowser) {
        const source = {
            'UnversionedGithubImport.sol': {
                content: `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\nimport "https://raw.githubusercontent.com/remix-project-org/remix-project/refs/heads/master/apps/remix-ide/contracts/app/ethereum/constitution.sol";\ncontract UnversionedGithubImport {}`
            }
        }
        browser
            .addFile('UnversionedGithubImport.sol', source['UnversionedGithubImport.sol'])
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 120000)
            .expandAllFolders()
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/github"]', 60000)
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/github/remix-project-org"]', 60000)
            // refs/heads/master should normalize to just @master
            .waitForElementVisible('*[data-id^="treeViewDivDraggableItem.deps/github/remix-project-org/remix-project@master"]', 60000)
            .waitForElementVisible('*[data-id$="treeViewLitreeViewItem.deps/github/remix-project-org/remix-project@master/apps"]', 60000)
            .waitForElementVisible('*[data-id$="treeViewLitreeViewItem.deps/github/remix-project-org/remix-project@master/apps/remix-ide"]', 60000)
            .waitForElementVisible('*[data-id$="treeViewLitreeViewItem.deps/github/remix-project-org/remix-project@master/apps/remix-ide/contracts"]', 60000)
            .waitForElementVisible('*[data-id$="treeViewLitreeViewItem.deps/github/remix-project-org/remix-project@master/apps/remix-ide/contracts/app"]', 60000)
            .waitForElementVisible('*[data-id$="treeViewLitreeViewItem.deps/github/remix-project-org/remix-project@master/apps/remix-ide/contracts/app/ethereum"]', 60000)
            .waitForElementVisible('*[data-id$="treeViewLitreeViewItem.deps/github/remix-project-org/remix-project@master/apps/remix-ide/contracts/app/ethereum/constitution.sol"]', 60000)
            // Verify the imported file exists and can be opened
            .openFile('.deps/github/remix-project-org/remix-project@master/apps/remix-ide/contracts/app/ethereum/constitution.sol')
            .pause(1000)
            .getEditorValue((content) => {
                browser.assert.ok(content.length > 0, 'Constitution.sol should have content')
                browser.assert.ok(content.includes('pragma solidity') || content.includes('contract') || content.includes('SPDX'), 'Constitution.sol should be a Solidity file')
            })
    },

    'Test resolution index mapping for Go to Definition #group9': function (browser: NightwatchBrowser) {
        browser
            .addFile('ResolutionIndexTest.sol', resolutionIndexSource['ResolutionIndexTest.sol'])
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(2000)
            .clickLaunchIcon('filePanel')

            // Navigate through folders to reach .resolution-index.json
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 60000)
            .expandAllFolders()
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm"]', 60000)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/.resolution-index.json"]', 60000)
            .openFile('.deps/npm/.resolution-index.json')
            .pause(1000)
            .getEditorValue((content) => {
                try {
                    const idx = JSON.parse(content)
                    const sourceFiles = Object.keys(idx || {})

                    // Verify structure: index should map source files to their import resolutions
                    browser.assert.ok(sourceFiles.length > 0, 'Resolution index should contain at least one source file')

                    // Check that our test file is in the index
                    const hasTestFile = sourceFiles.some(file => file.includes('ResolutionIndexTest.sol'))
                    browser.assert.ok(hasTestFile, 'Resolution index should contain ResolutionIndexTest.sol')

                    // Verify each entry has import mappings
                    const testFileEntry = sourceFiles.find(file => file.includes('ResolutionIndexTest.sol'))
                    if (testFileEntry) {
                        const mappings = idx[testFileEntry]
                        browser.assert.ok(typeof mappings === 'object' && mappings !== null, 'Each source file should have an object of import mappings')

                        // Verify the mappings contain resolved paths for @openzeppelin imports
                        const importKeys = Object.keys(mappings)
                        const hasOpenzeppelinImport = importKeys.some(key => key.includes('@openzeppelin/contracts'))
                        browser.assert.ok(hasOpenzeppelinImport, 'Resolution index should map @openzeppelin imports to their resolved paths')

                        // Verify resolved paths point to versioned npm packages
                        if (hasOpenzeppelinImport) {
                            const ozImport = importKeys.find(key => key.includes('@openzeppelin/contracts'))
                            const resolvedPath = mappings[ozImport]
                            browser.assert.ok(resolvedPath && resolvedPath.includes('@openzeppelin/contracts@'), 'Resolved paths should point to versioned package (e.g., @openzeppelin/contracts@5.4.0/...)')
                        }
                    }
                } catch (e) {
                    browser.assert.ok(false, 'Resolution index JSON should be valid: ' + e.message)
                }
            })
    },

    'Test OZ transitive mappings recorded in resolution index #group24': function (browser: NightwatchBrowser) {
        // Scenario replicates unit test: Entry imports unversioned ERC20 (resolves to concrete v5.x),
        // Context@5.0.2 explicitly, and Ownable@5.4.0 explicitly. We verify entry mappings and
        // that ERC20.sol and Ownable.sol source keys have their relative imports recorded to concrete .deps paths.
        browser
            .addFile('Entry.sol', ozTransitiveIndexSource['Entry.sol'])
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(3000)
            .clickLaunchIcon('filePanel')
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 120000)
            .expandAllFolders()
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm"]', 60000)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/.resolution-index.json"]', 60000)
            .openFile('.deps/npm/.resolution-index.json')
            .pause()
            .getEditorValue((content) => {
                try {
                    const idx = JSON.parse(content)
                    const entryMap = idx['Entry.sol']
                        ; (browser as any).assert.ok(!!entryMap, 'Entry.sol map should exist in resolution index')
                    if (!entryMap) return

                    // 1) Entry mappings for three imports
                    const erc20Resolved = entryMap['@openzeppelin/contracts/token/ERC20/ERC20.sol']
                    const ctxResolved = entryMap['@openzeppelin/contracts@5.0.2/utils/Context.sol']
                    const ownableResolved = entryMap['@openzeppelin/contracts@5.4.0/access/Ownable.sol']
                        ; (browser as any).assert.ok(typeof erc20Resolved === 'string' && /@openzeppelin\/contracts@.+\/token\/ERC20\/ERC20\.sol$/.test(erc20Resolved), 'ERC20 should resolve to concrete versioned path')
                        ; (browser as any).assert.ok(typeof ctxResolved === 'string' && /@openzeppelin\/contracts@5\.0\.2\/utils\/Context\.sol$/.test(ctxResolved), 'Context@5.0.2 should resolve to concrete versioned path')
                        ; (browser as any).assert.ok(typeof ownableResolved === 'string' && /@openzeppelin\/contracts@5\.4\.0\/access\/Ownable\.sol$/.test(ownableResolved), 'Ownable@5.4.0 should resolve to concrete versioned path')

                    // 2) ERC20.sol source key should have relative imports recorded (use spec key directly)
                    const erc20Map = idx['@openzeppelin/contracts/token/ERC20/ERC20.sol']
                        ; (browser as any).assert.ok(!!erc20Map, 'ERC20.sol map should exist in resolution index')
                    if (erc20Map) {
                        const hasIERC20 = /\.deps\/npm\/@openzeppelin\/contracts@.+\/token\/ERC20\/IERC20\.sol$/.test(erc20Map['./IERC20.sol'] || '')
                        const hasIERC20Meta = /\.deps\/npm\/@openzeppelin\/contracts@.+\/token\/ERC20\/extensions\/IERC20Metadata\.sol$/.test(erc20Map['./extensions/IERC20Metadata.sol'] || '')
                        const hasContext = /\.deps\/npm\/@openzeppelin\/contracts@.+\/utils\/Context\.sol$/.test(erc20Map['../../utils/Context.sol'] || '')
                            ; (browser as any).assert.ok(hasIERC20 && hasIERC20Meta && hasContext, 'ERC20.sol should record relative imports to concrete .deps paths')
                    }

                    // 3) Ownable.sol source key should have relative Context import recorded (use spec key directly)
                    const ownableMap = idx['@openzeppelin/contracts@5.4.0/access/Ownable.sol']
                        ; (browser as any).assert.ok(!!ownableMap, 'Ownable.sol map should exist in resolution index')
                    if (ownableMap) {
                        const hasOwnableCtx = /\.deps\/npm\/@openzeppelin\/contracts@5\.4\.0\/utils\/Context\.sol$/.test(ownableMap['../utils/Context.sol'] || '')
                            ; (browser as any).assert.ok(hasOwnableCtx, 'Ownable.sol should record relative Context import to concrete .deps path')
                    }
                } catch (e) {
                    ; (browser as any).assert.fail('Resolution index should be valid JSON and contain expected mappings: ' + (e as Error).message)
                }
            })
    },

    'Test CCIPReceiver internal mapping uses contracts@1.4.0 #group23': function (browser: NightwatchBrowser) {
        // Add the exact CCIP base contract, then open CCIPReceiver.sol from .deps and verify its internal imports map to @chainlink/contracts@1.4.0 (not 1.5.0)
        browser
            .addFile('ChainlinkCCIPExact.sol', chainlinkCCIPSource['ChainlinkCCIP.sol'])
            // Ensure .deps tree is created and Chainlink packages resolved
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 120000)
            .expandAllFolders()
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm"]', 60000)
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@chainlink"]', 60000)
            // Quick sanity: parent resolution produced contracts@1.4.0 and contracts-ccip@1.6.1
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@chainlink/contracts@1.4.0"]', 60000)
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@chainlink/contracts-ccip@1.6.1"]', 60000)


            // Open CCIPReceiver.sol directly from .deps and compile it
            .openFile('.deps/npm/@chainlink/contracts-ccip@1.6.1/contracts/applications/CCIPReceiver.sol')
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(2000)
            // Verify in resolution index that CCIPReceiver internal @chainlink/contracts deps map to 1.4.0 (not 1.5.0)
            .clickLaunchIcon('filePanel')
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/.resolution-index.json"]', 60000)
            .openFile('.deps/npm/.resolution-index.json')
            .pause(1000)
            .getEditorValue((content) => {
                try {
                    const idx = JSON.parse(content)
                    const keys = Object.keys(idx || {})
                    // Find CCIPReceiver entry
                    const entryKey = keys.find(k => k.includes('@chainlink/contracts-ccip@1.6.1/contracts/applications/CCIPReceiver.sol'))
                    // If not present (e.g., hidden entry path differences), search by CCIPReceiver and contracts-ccip
                    const fallbackKey = keys.find(k => k.includes('contracts-ccip@1.6.1') && k.endsWith('/contracts/applications/CCIPReceiver.sol'))
                    const targetKey = entryKey || fallbackKey
                    if (!targetKey) {
                        throw new Error('CCIPReceiver entry not found in resolution index')
                    }
                    const mappings = idx[targetKey] || {}
                    const mappingKeys = Object.keys(mappings)
                    // Look for any mapping of @chainlink/contracts
                    const hasContractsImport = mappingKeys.some(k => k.includes('@chainlink/contracts'))
                    if (!hasContractsImport) {
                        throw new Error('No @chainlink/contracts import found in CCIPReceiver mappings')
                    }
                    // Ensure mapped paths point to @chainlink/contracts@1.4.0 and do NOT include 1.5.0
                    const resolvedTargets = Object.values(mappings).map(String)
                    const uses140 = resolvedTargets.some(p => p.includes('@chainlink/contracts@1.4.0'))
                    const uses150 = resolvedTargets.some(p => p.includes('@chainlink/contracts@1.5.0'))
                        ; (browser as any).assert.ok(uses140, 'CCIPReceiver internal deps should use @chainlink/contracts@1.4.0')
                        ; (browser as any).assert.ok(!uses150, 'CCIPReceiver internal deps should not use @chainlink/contracts@1.5.0')
                } catch (e) {
                    ; (browser as any).assert.fail('Resolution index should be valid and contain CCIPReceiver entry: ' + (e as Error).message)
                }
            })
    },

    'Test Chainlink BurnMintTokenPool with correct folders #group26': function (browser: NightwatchBrowser) {
        browser
            .clickLaunchIcon('filePanel')
            .addFile('ChainlinkBurnMint.sol', chainlinkBurnMintSource['ChainlinkBurnMint.sol'])
            .openFile('ChainlinkBurnMint.sol')
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .waitForElementPresent('*[data-id="compiledContracts"]', 10000)
            .clickLaunchIcon('filePanel')
            .expandAllFolders()
            // Verify .deps/npm/@chainlink/contracts-ccip@1.6.1 folder structure exists
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@chainlink/contracts-ccip@1.6.1/contracts/pools/BurnMintTokenPool.sol"]', 30000)
            .perform(function () {
                browser.assert.ok(true, 'BurnMintTokenPool.sol found in correct folder structure')
            })
            // Verify package.json exists at root of package
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@chainlink/contracts-ccip@1.6.1/package.json"]', 10000)
            .openFile('.deps/npm/@chainlink/contracts-ccip@1.6.1/package.json')
            .pause(1000)
            .getEditorValue((content) => {
                try {
                    const pkg = JSON.parse(content)
                        ; (browser as any).assert.strictEqual(pkg.version, '1.6.1', 'Package version should be 1.6.1')
                        ; (browser as any).assert.strictEqual(pkg.name, '@chainlink/contracts-ccip', 'Package name should be @chainlink/contracts-ccip')
                } catch (e) {
                    ; (browser as any).assert.fail('package.json should be valid JSON with correct version')
                }
            })
    },

    'Test debug logging with localStorage flag #group10': function (browser: NightwatchBrowser) {
        browser
            // Enable debug logging
            .execute(function () {
                localStorage.setItem('remix-debug-resolver', 'true');
                return localStorage.getItem('remix-debug-resolver');
            }, [], function (result) {
                browser.assert.strictEqual(result.value, 'true', 'Debug flag should be set');
            })
            .addFile('DebugLogTest.sol', debugLoggingSource['DebugLogTest.sol'])
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(2000)
            // Verify debug flag is set (simplified test since we can't easily capture console in E2E)
            .perform(function () {
                browser.execute(function () {
                    // Just verify the debug flag is correctly set
                    return localStorage.getItem('remix-debug-resolver') === 'true';
                }, [], function (result) {
                    if (result.value === true) {
                        browser.assert.ok(true, 'Debug flag should be enabled');
                    } else {
                        browser.assert.ok(false, 'Debug flag should be enabled');
                    }
                });
            })
    },

    'Test debug logging disabled by default #group10': function (browser: NightwatchBrowser) {
        browser
            // Disable debug logging
            .execute(function () {
                localStorage.removeItem('remix-debug-resolver');
                return localStorage.getItem('remix-debug-resolver');
            }, [], function (result) {
                browser.assert.strictEqual(result.value, null, 'Debug flag should be disabled');
            })
            .addFile('NoDebugLogTest.sol', debugLoggingSource['NoDebugLogTest.sol'])
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(2000)
            // Verify debug flag is disabled
            .perform(function () {
                browser.execute(function () {
                    // Verify the debug flag is correctly disabled
                    return localStorage.getItem('remix-debug-resolver') === null;
                }, [], function (result) {
                    if (result.value === true) {
                        browser.assert.ok(true, 'Debug flag should be disabled');
                    } else {
                        browser.assert.ok(false, 'Debug flag should be disabled');
                    }
                });
            })
    },

    'Test multi-line import with symbols parsing #group11': function (browser: NightwatchBrowser) {
        const source = {
            'ImportParsingEdgeCases.sol': {
                content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Multi-line import with symbols
import {
    IERC20,
    IERC20Metadata
} from "@openzeppelin/contracts@4.8.0/token/ERC20/extensions/IERC20Metadata.sol";

// Additional valid import (no star import in Solidity)
import { Context } from "@openzeppelin/contracts@4.8.0/utils/Context.sol";

// Minimal contract to ensure a definition exists
contract ImportParsingEdgeCaseDummy { }
`
            }
        }
        browser
            .addFile('ImportParsingEdgeCases.sol', source['ImportParsingEdgeCases.sol'])
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(2000)
            .clickLaunchIcon('filePanel')

            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 60000)
            .expandAllFolders()

            // Verify that multi-line imports are resolved correctly
            .waitForElementVisible('*[data-id^="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@4.8.0"]', 60000)
            // Verify the imported files actually exist - check IERC20Metadata.sol
            .waitForElementVisible('*[data-id$="contracts@4.8.0/token"]', 10000)
            .waitForElementVisible('*[data-id$="contracts@4.8.0/token/ERC20"]', 10000)
            .waitForElementVisible('*[data-id$="contracts@4.8.0/token/ERC20/extensions"]', 10000)
            .waitForElementVisible('*[data-id$="contracts@4.8.0/token/ERC20/extensions/IERC20Metadata.sol"]', 10000)
            // Collapse and re-expand to check Context.sol in utils folder
            // removed collapse under .deps
            .pause(500)
            .waitForElementVisible('*[data-id$="contracts@4.8.0/utils"]', 10000)
            .waitForElementVisible('*[data-id$="contracts@4.8.0/utils/Context.sol"]', 10000)
            .perform(function () {
                browser.assert.ok(true, 'All imported files exist in the correct folder structure');
            })

    },

    'Test commented imports are ignored #group11': function (browser: NightwatchBrowser) {
        const source = {
            'CommentedImports.sol': {
                content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Regular import (should be resolved)
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Commented imports (should be ignored)
// import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
/* 
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
*/

contract CommentedImports is ERC20 {
    constructor() ERC20("Test", "TST") {}
}
`
            }
        }
        browser
            .addFile('CommentedImports.sol', source['CommentedImports.sol'])
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(2000)
            .clickLaunchIcon('filePanel')

            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 60000)
            .expandAllFolders()
            .waitForElementVisible('*[data-id$="/token"]', 10000)
            .waitForElementVisible('*[data-id$="/ERC20"]', 10000)
            // Verify ERC721 and ERC1155 folders don't exist (commented imports ignored)
            .waitForElementNotPresent('*[data-id$="/ERC721"]', 5000)
            .waitForElementNotPresent('*[data-id$="/ERC1155"]', 5000)
            .perform(function () {
                browser.assert.ok(true, 'Commented imports should be ignored during parsing');
            })
    },

    'Test proper error handling for unresolvable imports #group11': function (browser: NightwatchBrowser) {
        browser
            .addFile('UnresolvableImportTest.sol', unresolvableImportSource['UnresolvableImportTest.sol'])
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(3000)
            // Verify that compilation shows proper error message instead of crashing
            .waitForElementVisible('*[data-id="compiledErrors"]', 10000)
            .waitForElementContainsText('*[data-id="compiledErrors"]', 'Fetch failed 404')
            .waitForElementContainsText('*[data-id="compiledErrors"]', 'SafeMath.sol')
            .perform(function () {
                browser.assert.ok(true, 'Unresolvable imports should show proper error messages without crashing');
            })
    },

    'Test unpkg CDN imports #group12': function (browser: NightwatchBrowser) {
        browser
            .addFile('UnpkgTest.sol', cdnImportsSource['UnpkgTest.sol'])
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(5000) // CDN imports may take longer
            .clickLaunchIcon('filePanel')
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 120000)
            .expandAllFolders()
            // CDN npm packages are normalized to .deps/npm/
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm"]', 60000)
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin"]', 60000)
            .waitForElementVisible('*[data-id^="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@4.8.0"]', 60000)
            .perform(function () {
                browser.assert.ok(true, 'unpkg.com CDN imports should be normalized to npm folder');
            })
    },

    'Test jsdelivr npm CDN imports #group12': function (browser: NightwatchBrowser) {
        browser
            .addFile('JsdelivrNpmTest.sol', cdnImportsSource['JsdelivrNpmTest.sol'])
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(5000)
            .clickLaunchIcon('filePanel')

            // CDN npm packages are normalized to .deps/npm/
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 60000)
            .expandAllFolders()
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin"]', 60000)
            .waitForElementVisible('*[data-id^="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@4.8.0"]', 60000)
            .perform(function () {
                browser.assert.ok(true, 'cdn.jsdelivr.net npm imports should be normalized to npm folder');
            })
    },

    'Test unpkg unversioned CDN imports #group12': function (browser: NightwatchBrowser) {
        browser
            .addFile('UnpkgUnversionedTest.sol', cdnImportsSource['UnpkgUnversionedTest.sol'])
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(5000)
            .clickLaunchIcon('filePanel')

            // Unversioned CDN npm packages are normalized to .deps/npm/ with version from workspace
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 60000)
            .expandAllFolders()
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin"]', 60000)
            // Should have versioned folder (version resolved from workspace/lock file/npm)
            .waitForElementPresent('*[data-id^="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@"]', 60000)
            .perform(function () {
                browser.assert.ok(true, 'unpkg.com unversioned imports should be normalized to npm folder with resolved version');
            })
    },

    'Test jsdelivr unversioned CDN imports #group12': function (browser: NightwatchBrowser) {
        browser
            .addFile('JsdelivrUnversionedTest.sol', cdnImportsSource['JsdelivrUnversionedTest.sol'])
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(5000)
            .clickLaunchIcon('filePanel')
            // Unversioned CDN npm packages are normalized to .deps/npm/ with version from workspace
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 60000)
            .expandAllFolders()
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin"]', 60000)
            // Should have versioned folder (version resolved from workspace/lock file/npm)
            .waitForElementPresent('*[data-id^="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@"]', 60000)
            .perform(function () {
                browser.assert.ok(true, 'cdn.jsdelivr.net unversioned imports should be normalized to npm folder with resolved version');
            })
    },

    'Test raw.githubusercontent.com imports #group12': function (browser: NightwatchBrowser) {
        browser
            .addFile('RawGitHubTest.sol', cdnImportsSource['RawGitHubTest.sol'])
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(5000)
            .clickLaunchIcon('filePanel')
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 120000)
            .expandAllFolders()
            // raw.githubusercontent.com URLs are normalized to .deps/github/owner/repo@ref/
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/github"]', 60000)
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/github/OpenZeppelin"]', 60000)
            .waitForElementVisible('*[data-id^="treeViewDivDraggableItem.deps/github/OpenZeppelin/openzeppelin-contracts@v4.8.0"]', 60000)
            .perform(function () {
                browser.assert.ok(true, 'raw.githubusercontent.com imports should be normalized to github folder');
            })
    },


    'Test invalid non-sol import rejection #group15': function (browser: NightwatchBrowser) {
        browser
            .addFile('InvalidImportTest.sol', invalidImportSource['InvalidImportTest.sol'])
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .waitForElementContainsText('*[data-id="compiledErrors"]', 'Invalid import', 10000)
    },

    'Test invalid package.json import rejection #group15': function (browser: NightwatchBrowser) {
        browser
            .addFile('InvalidPackageJsonImport.sol', invalidImportSource['InvalidPackageJsonImport.sol'])
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .waitForElementContainsText('*[data-id="compiledErrors"]', 'Invalid import', 10000)
    },

    // ============================================================================
    // REMAPPING TESTS (group27)
    // Based on Foundry and Hardhat conventions
    // ============================================================================

    'Test Foundry-style prefix remapping #group27': function (browser: NightwatchBrowser) {
        browser
            .addFile('remappings.txt', foundryStyleRemappingSource['remappings.txt'])
            .addFile('FoundryStyleTest.sol', foundryStyleRemappingSource['FoundryStyleTest.sol'])
            // Enable generate-contract-metadata to create build-info files
            .waitForElementVisible('*[data-id="topbar-settingsIcon"]')
            .click('*[data-id="topbar-settingsIcon"]')
            .waitForElementVisible('*[data-id="settings-sidebar-general"]')
            .click('*[data-id="settings-sidebar-general"]')
            .waitForElementPresent('[data-id="generate-contract-metadataSwitch"]')
            .click('[data-id="generate-contract-metadataSwitch"]')
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(5000)
            .clickLaunchIcon('filePanel')

            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 60000)
            .expandAllFolders()
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm"]', 60000)
            // Should resolve oz/ to @openzeppelin/contracts@5.0.2/
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@5.0.2"]', 60000)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@5.0.2/token"]', 10000)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@5.0.2/token/ERC20"]', 10000)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@5.0.2/token/ERC20/ERC20.sol"]', 10000)
            .perform(function () {
                browser.assert.ok(true, 'Foundry-style remapping oz/ -> @openzeppelin/contracts@5.0.2/ should work')
            })
            // Verify compilation succeeded
            .waitForElementPresent('*[data-id="compiledContracts"]', 10000)
            .clickLaunchIcon('solidity')
            .assert.containsText('*[data-id="compiledContracts"]', 'FoundryStyleTest')
            .clickLaunchIcon('filePanel')
            // Verify build-info reflects remapping resolution
            .verifyArtifactsBuildInfo([
                {
                    packagePath: '@openzeppelin/contracts@5.0.2/token/ERC20/ERC20.sol',
                    versionComment: '5.0.0',
                    description: 'Foundry remap oz/ -> OZ v5 resolves ERC20'
                }
            ])
            .getEditorValue((content) => {
                const txt = (content || '').toString()
                ;(browser as any).assert.ok(txt.includes('"remappings"'), 'Build-info should contain remappings array')
                ;(browser as any).assert.ok(txt.includes('oz/=@openzeppelin/contracts@5.0.2/'), 'Build-info should include Foundry remapping oz/')
            })
    },

    'Test npm: prefix remapping (prevents infinite loops) #group28': function (browser: NightwatchBrowser) {
        browser
            .addFile('remappings.txt', npmPrefixRemappingSource['remappings.txt'])
            .addFile('NpmPrefixTest.sol', npmPrefixRemappingSource['NpmPrefixTest.sol'])
            // Enable generate-contract-metadata to create build-info files
            .waitForElementVisible('*[data-id="topbar-settingsIcon"]')
            .click('*[data-id="topbar-settingsIcon"]')
            .waitForElementVisible('*[data-id="settings-sidebar-general"]')
            .click('*[data-id="settings-sidebar-general"]')
            .waitForElementPresent('[data-id="generate-contract-metadataSwitch"]')
            .click('[data-id="generate-contract-metadataSwitch"]')
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(5000)
            .clickLaunchIcon('filePanel')

            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 60000)
            .expandAllFolders()
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm"]', 60000)
            // Should have both versions
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@4.9.6"]', 60000)
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@5.0.2"]', 60000)
            .perform(function () {
                browser.assert.ok(true, 'npm: prefix remapping should not cause infinite loops')
            })
            // Verify SafeMath from v4.9.6
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@4.9.6/utils"]', 10000)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@4.9.6/utils/math"]', 10000)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@4.9.6/utils/math/SafeMath.sol"]', 10000)
            // Verify Strings from v5.0.2
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@5.0.2/utils"]', 10000)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@5.0.2/utils/Strings.sol"]', 10000)
            // Verify compilation succeeded
            .waitForElementPresent('*[data-id="compiledContracts"]', 10000)
            .clickLaunchIcon('solidity')
            .assert.containsText('*[data-id="compiledContracts"]', 'NpmPrefixTest')
            .clickLaunchIcon('filePanel')
            // Verify build-info reflects both remapped versions
            .verifyArtifactsBuildInfo([
                {
                    packagePath: '@openzeppelin/contracts@4.9.6/utils/math/SafeMath.sol',
                    versionComment: '4.9.0',
                    description: 'npm: remap → OZ v4 SafeMath in build-info'
                },
                {
                    packagePath: '@openzeppelin/contracts@5.0.2/utils/Strings.sol',
                    versionComment: '5.0.0',
                    description: 'npm: remap → OZ v5 Strings in build-info'
                }
            ])
            .getEditorValue((content) => {
                const txt = (content || '').toString()
                ;(browser as any).assert.ok(txt.includes('"remappings"'), 'Build-info should contain remappings array')
                ;(browser as any).assert.ok(txt.includes('@openzeppelin/contracts@4.9.6/=npm:@openzeppelin/contracts@4.9.6/'), 'Build-info should include npm remapping v4.9.6')
                ;(browser as any).assert.ok(txt.includes('@openzeppelin/contracts@5.0.2/=npm:@openzeppelin/contracts@5.0.2/'), 'Build-info should include npm remapping v5.0.2')
            })
    },

    'Test Hardhat-style remapping #group29': function (browser: NightwatchBrowser) {
        browser
            .addFile('remappings.txt', hardhatStyleRemappingSource['remappings.txt'])
            .addFile('HardhatStyleTest.sol', hardhatStyleRemappingSource['HardhatStyleTest.sol'])
            // Enable generate-contract-metadata to create build-info files
            .waitForElementVisible('*[data-id="topbar-settingsIcon"]')
            .click('*[data-id="topbar-settingsIcon"]')
            .waitForElementVisible('*[data-id="settings-sidebar-general"]')
            .click('*[data-id="settings-sidebar-general"]')
            .waitForElementPresent('[data-id="generate-contract-metadataSwitch"]')
            .click('[data-id="generate-contract-metadataSwitch"]')
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(5000)
            .clickLaunchIcon('filePanel')

            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 60000)
            .expandAllFolders()
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm"]', 60000)
            // Should resolve to @openzeppelin/contracts@4.8.0/
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@4.8.0"]', 60000)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@4.8.0/token"]', 10000)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@4.8.0/token/ERC20"]', 10000)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@4.8.0/token/ERC20/ERC20.sol"]', 10000)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@4.8.0/access"]', 10000)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@4.8.0/access/Ownable.sol"]', 10000)
            .perform(function () {
                browser.assert.ok(true, 'Hardhat-style remapping @openzeppelin/contracts/ -> @openzeppelin/contracts@4.8.0/ should work')
            })
            // Verify compilation succeeded
            .waitForElementPresent('*[data-id="compiledContracts"]', 10000)
            .clickLaunchIcon('solidity')
            .assert.containsText('*[data-id="compiledContracts"]', 'HardhatStyleTest')
            .clickLaunchIcon('filePanel')
            // Verify build-info reflects hardhat remapping
            .verifyArtifactsBuildInfo([
                {
                    packagePath: '@openzeppelin/contracts@4.8.0/token/ERC20/ERC20.sol',
                    versionComment: '4.8.0',
                    description: 'Hardhat remap → OZ v4.8 ERC20 in build-info'
                },
                {
                    packagePath: '@openzeppelin/contracts@4.8.0/access/Ownable.sol',
                    versionComment: '4.7.0',
                    description: 'Hardhat remap → OZ v4.8 Ownable in build-info'
                }
            ])
            .getEditorValue((content) => {
                const txt = (content || '').toString()
                ;(browser as any).assert.ok(txt.includes('"remappings"'), 'Build-info should contain remappings array')
                ;(browser as any).assert.ok(txt.includes('@openzeppelin/contracts/=@openzeppelin/contracts@4.8.0/'), 'Build-info should include Hardhat remapping @openzeppelin/contracts/')
            })
    },

    'Test multi-version aliasing with remappings #group30': function (browser: NightwatchBrowser) {
        browser
            .addFile('remappings.txt', multiVersionRemappingSource['remappings.txt'])
            .addFile('MultiVersionTest.sol', multiVersionRemappingSource['MultiVersionTest.sol'])
            // Enable generate-contract-metadata to create build-info files
            .waitForElementVisible('*[data-id="topbar-settingsIcon"]')
            .click('*[data-id="topbar-settingsIcon"]')
            .waitForElementVisible('*[data-id="settings-sidebar-general"]')
            .click('*[data-id="settings-sidebar-general"]')
            .waitForElementPresent('[data-id="generate-contract-metadataSwitch"]')
            .click('[data-id="generate-contract-metadataSwitch"]')
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(5000)
            .clickLaunchIcon('filePanel')

            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 60000)
            .expandAllFolders()
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm"]', 60000)
            // Should have both versions
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@4.9.6"]', 60000)
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@5.0.2"]', 60000)
            .perform(function () {
                browser.assert.ok(true, 'Multi-version aliasing (@openzeppelin/contracts-v4/ and -v5/) should coexist')
            })
            // Verify v4 SafeMath
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@4.9.6/utils/math/SafeMath.sol"]', 10000)
            // Verify v5 Strings
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@5.0.2/utils/Strings.sol"]', 10000)
            // Verify compilation succeeded
            .waitForElementPresent('*[data-id="compiledContracts"]', 10000)
            .clickLaunchIcon('solidity')
            .assert.containsText('*[data-id="compiledContracts"]', 'MultiVersionTest')
            .clickLaunchIcon('filePanel')
            // Verify build-info reflects both alias remappings
     
            .verifyArtifactsBuildInfo([
                {
                    packagePath: '@openzeppelin/contracts@4.9.6/utils/math/SafeMath.sol',
                    versionComment: '4.9.0',
                    description: 'Alias remap v4 SafeMath in build-info'
                },
                {
                    packagePath: '@openzeppelin/contracts@5.0.2/utils/Strings.sol',
                    versionComment: '5.0.0',
                    description: 'Alias remap v5 Strings in build-info'
                }
            ])
            .getEditorValue((content) => {
                const txt = (content || '').toString()
                ;(browser as any).assert.ok(txt.includes('"remappings"'), 'Build-info should contain remappings array')
                ;(browser as any).assert.ok(txt.includes('@openzeppelin/contracts-v4/=@openzeppelin/contracts@4.9.6/'), 'Build-info should include alias remapping v4')
                ;(browser as any).assert.ok(txt.includes('@openzeppelin/contracts-v5/=@openzeppelin/contracts@5.0.2/'), 'Build-info should include alias remapping v5')
            })
            .end()
    },

    'Test npm alias with multiple package versions #group18': function (browser: NightwatchBrowser) {
        browser
            .addFile('package.json', npmAliasMultiVersionSource['package.json'])
            .addFile('eee.sol', npmAliasMultiVersionSource['eee.sol'])
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(3000)
            .clickLaunchIcon('filePanel')

            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 60000)
            .expandAllFolders()
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm"]', 60000)
            // Verify both versions are present
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin"]', 60000)
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@4.9.6"]', 60000)
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@5.0.2"]', 60000)
            .perform(function () {
                browser.assert.ok(true, 'Both @openzeppelin/contracts@4.9.6 and @openzeppelin/contracts@5.0.2 should be present')
            })
            // Verify contracts@4.9.6 structure
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@4.9.6/token"]', 10000)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@4.9.6/token/ERC20"]', 10000)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@4.9.6/token/ERC20/ERC20.sol"]', 10000)
            .perform(function () {
                browser.assert.ok(true, 'contracts@4.9.6 should contain token/ERC20/ERC20.sol')
            })
            // Verify contracts@5.0.2 structure
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@5.0.2/token"]', 10000)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@5.0.2/token/ERC20"]', 10000)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@5.0.2/token/ERC20/ERC20.sol"]', 10000)
            .perform(function () {
                browser.assert.ok(true, 'contracts@5.0.2 should contain token/ERC20/ERC20.sol')
            })
            // Check resolution index
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/.resolution-index.json"]', 60000)
            .openFile('.deps/npm/.resolution-index.json')
            .pause(1000)
            .getEditorValue((content) => {
                try {
                    const idx = JSON.parse(content)
                    const sourceFiles = Object.keys(idx || {})

                    // Find eee.sol entry
                    const eeeSolEntry = sourceFiles.find(file => file.includes('eee.sol'))
                    browser.assert.ok(!!eeeSolEntry, 'Resolution index should contain eee.sol')

                    if (eeeSolEntry) {
                        const mappings = idx[eeeSolEntry]

                        // Check that both imports are mapped correctly
                        const hasV4Import = Object.keys(mappings).some(key =>
                            key.includes('@openzeppelin/contracts/token/ERC20/ERC20.sol') &&
                            mappings[key].includes('@openzeppelin/contracts@4.9.6')
                        )
                        const hasV5Import = Object.keys(mappings).some(key =>
                            key.includes('@openzeppelin/contracts-5/token/ERC20/ERC20.sol') &&
                            mappings[key].includes('@openzeppelin/contracts@5.0.2')
                        )

                        browser.assert.ok(hasV4Import, 'Resolution index should map @openzeppelin/contracts to version 4.9.6')
                        browser.assert.ok(hasV5Import, 'Resolution index should map @openzeppelin/contracts-5 to version 5.0.2')
                    }
                } catch (e) {
                    browser.assert.fail('Resolution index should be valid JSON: ' + e.message)
                }
            })
    },

    'Test jsDelivr CDN with multiple versions from same package #group19': function (browser: NightwatchBrowser) {
        browser
            .addFile('MixedCDNVersions.sol', jsDelivrMultiVersionSource['MixedCDNVersions.sol'])
            // Enable generate-contract-metadata to create build-info files
            .waitForElementVisible('*[data-id="topbar-settingsIcon"]')
            .click('*[data-id="topbar-settingsIcon"]')
            .waitForElementVisible('*[data-id="settings-sidebar-general"]')
            .click('*[data-id="settings-sidebar-general"]')
            .waitForElementPresent('[data-id="generate-contract-metadataSwitch"]')
            .click('[data-id="generate-contract-metadataSwitch"]')
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .clickLaunchIcon('filePanel')

            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 60000)
            .expandAllFolders()
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm"]', 60000)
            // Verify both versions are present
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin"]', 60000)
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@4.9.6"]', 60000)
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@5.0.2"]', 60000)
            .perform(function () {
                browser.assert.ok(true, 'Both @openzeppelin/contracts@4.9.6 and @openzeppelin/contracts@5.0.2 should be present from jsDelivr CDN')
            })
            // Verify contracts@4.9.6 structure (ECDSA utilities)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@4.9.6/utils"]', 10000)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@4.9.6/utils/cryptography"]', 10000)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@4.9.6/utils/cryptography/ECDSA.sol"]', 10000)
            .perform(function () {
                browser.assert.ok(true, 'contracts@4.9.6 should contain utils/cryptography/ECDSA.sol from jsDelivr')
            })
            // Verify contracts@5.0.2 structure (ERC20 token)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@5.0.2/token"]', 10000)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@5.0.2/token/ERC20"]', 10000)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@5.0.2/token/ERC20/ERC20.sol"]', 10000)
            .perform(function () {
                browser.assert.ok(true, 'contracts@5.0.2 should contain token/ERC20/ERC20.sol from jsDelivr')
            })
            // Verify resolution index mappings
            .isVisible({
                selector: '*[data-id="treeViewLitreeViewItem.deps/npm/.resolution-index.json"]',
                timeout: 10000,
                suppressNotFoundErrors: true
            })
            .perform(async function () {
                const resolutionIndexExists = await new Promise((resolve) => {
                    browser.isVisible({
                        selector: '*[data-id="treeViewLitreeViewItem.deps/npm/.resolution-index.json"]',
                        suppressNotFoundErrors: true
                    }, (result) => {
                        resolve(result.value === true)
                    })
                })

                if (resolutionIndexExists) {
                    browser.assert.ok(true, 'Resolution index file should exist for jsDelivr multi-version imports')
                } else {
                    browser.assert.ok(true, 'Resolution index not visible (may be hidden file)')
                }
            })
            .openFile('.deps/npm/.resolution-index.json')
            .pause(1000)
            .getEditorValue((content) => {
                try {
                    const idx = JSON.parse(content)
                    const sourceFiles = Object.keys(idx || {})

                    // Find MixedCDNVersions.sol entry
                    const wkEntry = sourceFiles.find(file => file.includes('MixedCDNVersions.sol'))
                    browser.assert.ok(!!wkEntry, 'Resolution index should contain MixedCDNVersions.sol')

                    if (wkEntry) {
                        const mappings = idx[wkEntry]

                        // Check that both jsDelivr imports are mapped correctly
                        const hasV4Import = Object.keys(mappings).some(key =>
                            key.includes('cdn.jsdelivr.net/npm/@openzeppelin/contracts@4.9.6') &&
                            key.includes('ECDSA.sol')
                        )
                        const hasV5Import = Object.keys(mappings).some(key =>
                            key.includes('cdn.jsdelivr.net/npm/@openzeppelin/contracts@5.0.2') &&
                            key.includes('ERC20.sol')
                        )

                        browser.assert.ok(hasV4Import, 'Resolution index should map jsDelivr 4.9.6 ECDSA import')
                        browser.assert.ok(hasV5Import, 'Resolution index should map jsDelivr 5.0.2 ERC20 import')
                    }
                } catch (e) {
                    browser.assert.fail('Resolution index should be valid JSON: ' + e.message)
                }
            })
            // Verify build-info artifacts contain both versions
            .verifyArtifactsBuildInfo([
                {
                    packagePath: '@openzeppelin/contracts@4.9.6/utils/cryptography/ECDSA.sol',
                    versionComment: '4.9.0',
                    description: 'Should find OpenZeppelin v4.9.6 ECDSA.sol with version comment'
                },
                {
                    packagePath: '@openzeppelin/contracts@5.0.2/token/ERC20/ERC20.sol',
                    versionComment: '5.0.0',
                    description: 'Should find OpenZeppelin v5.0.2 ERC20.sol with version comment'
                }
            ])
    },

    'Test jsDelivr CDN mixing v5 ERC20 with v4 SafeMath #group20': function (browser: NightwatchBrowser) {
        browser
            .addFile('djdidjod.sol', jsDelivrV5WithV4UtilsSource['djdidjod.sol'])
            // Enable generate-contract-metadata to create build-info files
            .waitForElementVisible('*[data-id="topbar-settingsIcon"]')
            .click('*[data-id="topbar-settingsIcon"]')
            .waitForElementVisible('*[data-id="settings-sidebar-general"]')
            .click('*[data-id="settings-sidebar-general"]')
            .waitForElementPresent('[data-id="generate-contract-metadataSwitch"]')
            .click('[data-id="generate-contract-metadataSwitch"]')
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(3000)
            .clickLaunchIcon('filePanel')

            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 60000)
            .expandAllFolders()
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm"]', 60000)
            // Verify both versions are present
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin"]', 60000)
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@4.9.6"]', 60000)
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@5.0.2"]', 60000)
            .perform(function () {
                browser.assert.ok(true, 'Both @openzeppelin/contracts@4.9.6 and @openzeppelin/contracts@5.0.2 should be present for SafeMath + ERC20v5')
            })
            // Verify contracts@4.9.6 structure (SafeMath utilities)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@4.9.6/utils"]', 10000)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@4.9.6/utils/math"]', 10000)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@4.9.6/utils/math/SafeMath.sol"]', 10000)
            .perform(function () {
                browser.assert.ok(true, 'contracts@4.9.6 should contain utils/math/SafeMath.sol from jsDelivr')
            })
            // Verify contracts@5.0.2 structure (ERC20 token)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@5.0.2/token"]', 10000)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@5.0.2/token/ERC20"]', 10000)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@5.0.2/token/ERC20/ERC20.sol"]', 10000)
            .perform(function () {
                browser.assert.ok(true, 'contracts@5.0.2 should contain token/ERC20/ERC20.sol from jsDelivr')
            })
            // Verify compilation succeeded (no errors)
            .waitForElementPresent('*[data-id="compiledContracts"]', 10000)
            .perform(function () {
                browser.assert.ok(true, 'Contract should compile successfully with v5 ERC20 and v4 SafeMath')
            })
            // Verify resolution index mappings
            .openFile('.deps/npm/.resolution-index.json')
            .pause(1000)
            .getEditorValue((content) => {
                try {
                    const idx = JSON.parse(content)
                    const sourceFiles = Object.keys(idx || {})

                    // Find djdidjod.sol entry
                    const djEntry = sourceFiles.find(file => file.includes('djdidjod.sol'))
                    browser.assert.ok(!!djEntry, 'Resolution index should contain djdidjod.sol')

                    if (djEntry) {
                        const mappings = idx[djEntry]

                        // Check that both jsDelivr imports are mapped correctly
                        const hasV4Import = Object.keys(mappings).some(key =>
                            key.includes('cdn.jsdelivr.net/npm/@openzeppelin/contracts@4.9.6') &&
                            key.includes('SafeMath.sol')
                        )
                        const hasV5Import = Object.keys(mappings).some(key =>
                            key.includes('cdn.jsdelivr.net/npm/@openzeppelin/contracts@5.0.2') &&
                            key.includes('ERC20.sol')
                        )

                        browser.assert.ok(hasV4Import, 'Resolution index should map jsDelivr 4.9.6 SafeMath import')
                        browser.assert.ok(hasV5Import, 'Resolution index should map jsDelivr 5.0.2 ERC20 import')
                    }
                } catch (e) {
                    browser.assert.fail('Resolution index should be valid JSON: ' + e.message)
                }
            })
            // Verify build-info artifacts contain both versions
            .verifyArtifactsBuildInfo([
                {
                    packagePath: '@openzeppelin/contracts@4.9.6/utils/math/SafeMath.sol',
                    versionComment: '4.9.0',
                    description: 'Should find OpenZeppelin v4.9.6 SafeMath.sol with version comment'
                },
                {
                    packagePath: '@openzeppelin/contracts@5.0.2/token/ERC20/ERC20.sol',
                    versionComment: '5.0.0',
                    description: 'Should find OpenZeppelin v5.0.2 ERC20.sol with version comment'
                }
            ])
    },

    'Test Chainlink contracts with transitive multi-version OpenZeppelin dependencies #group21': function (browser: NightwatchBrowser) {
        browser
            .addFile('ChainlinkMultiVersion.sol', chainlinkMultiVersionSource['ChainlinkMultiVersion.sol'])
            // Enable generate-contract-metadata to create build-info files
            .waitForElementVisible('*[data-id="topbar-settingsIcon"]')
            .click('*[data-id="topbar-settingsIcon"]')
            .waitForElementVisible('*[data-id="settings-sidebar-general"]')
            .click('*[data-id="settings-sidebar-general"]')
            .waitForElementPresent('[data-id="generate-contract-metadataSwitch"]')
            .click('[data-id="generate-contract-metadataSwitch"]')
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(5000) // Longer pause for multiple CDN fetches
            .clickLaunchIcon('filePanel')

            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 120000)
            .expandAllFolders()
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm"]', 60000)
            // Verify both OpenZeppelin versions are present (pulled in as transitive deps from Chainlink)
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin"]', 60000)
            .waitForElementPresent('*[data-id^="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@4"]', 60000)
            .waitForElementPresent('*[data-id^="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@5"]', 60000)
            .perform(function () {
                browser.assert.ok(true, 'Both OpenZeppelin v4 and v5 should be present as transitive dependencies from Chainlink')
            })
            // Verify Chainlink contracts are resolved
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@chainlink"]', 60000)
            .waitForElementPresent('*[data-id^="treeViewDivDraggableItem.deps/npm/@chainlink/contracts@1.5.0"]', 60000)
            .perform(function () {
                browser.assert.ok(true, 'Chainlink contracts@1.5.0 should be resolved from jsDelivr CDN')
            })
            // Verify specific Chainlink imports exist
            .waitForElementVisible('*[data-id$="contracts@1.5.0/src"]', 10000)
            .waitForElementVisible('*[data-id$="contracts@1.5.0/src/v0.8"]', 10000)
            // Check for functions directory
            .waitForElementVisible('*[data-id$="contracts@1.5.0/src/v0.8/functions"]', 10000)
            .waitForElementVisible('*[data-id$="contracts@1.5.0/src/v0.8/functions/v1_3_0"]', 10000)
            .perform(function () {
                browser.assert.ok(true, 'Chainlink functions/v1_3_0 directory should exist')
            })
            // Verify compilation succeeded despite multiple OpenZeppelin versions
            .waitForElementPresent('*[data-id="compiledContracts"]', 10000)
            .perform(function () {
                browser.assert.ok(true, 'Contract should compile successfully with Chainlink and transitive multi-version OpenZeppelin dependencies')
            })
            // Check build info to verify actual sources sent to compiler
            .verifyArtifactsBuildInfo([
                {
                    packagePath: '@openzeppelin/contracts@4.8.3/utils/Address.sol',
                    versionComment: '4.8.0',
                    description: 'Should find OpenZeppelin v4.8.x Address.sol with version comment'
                },
                {
                    packagePath: '@openzeppelin/contracts@4.8.3/utils/structs/EnumerableSet.sol',
                    versionComment: '4.8.0',
                    description: 'Should find OpenZeppelin EnumerableSet.sol with v4.8.0 comment'
                },
                {
                    packagePath: '@openzeppelin/contracts@5.0.2/utils/introspection/IERC165.sol',
                    versionComment: '5.0.0',
                    description: 'Should find OpenZeppelin IERC165.sol with v5.0.0 comment'
                }
            ])
    },

        'Test remix.config.json remappings in metadata #group32': function (browser: NightwatchBrowser) {
                const remixConfig = {
                        content: `{
    "solidity-compiler": {
        "language": "Solidity",
        "settings": {
            "optimizer": {
                "enabled": true,
                "runs": 200
            },
            "remappings": [
                "open4.7.3/=npm:@openzeppelin/contracts@4.7.3/",
                "open5.0.2/=npm:@openzeppelin/contracts@5.0.2/"
            ],
            "outputSelection": {
                "*": {
                    "": [
                        "ast"
                    ],
                    "*": [
                        "abi",
                        "metadata",
                        "devdoc",
                        "userdoc",
                        "storageLayout",
                        "evm.legacyAssembly",
                        "evm.bytecode",
                        "evm.deployedBytecode",
                        "evm.methodIdentifiers",
                        "evm.gasEstimates",
                        "evm.assembly"
                    ]
                }
            }
        }
    }
}`
                }
                const dddSource = {
                        content: `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n\nimport "open5.0.2/utils/Strings.sol";\nimport "open4.7.3/utils/Address.sol";\n\ncontract DD { }\n`
                }

                browser
                        // Enable generate-contract-metadata to create build-info files
                        .waitForElementVisible('*[data-id="topbar-settingsIcon"]')
                        .click('*[data-id="topbar-settingsIcon"]')
                        .waitForElementVisible('*[data-id="settings-sidebar-general"]')
                        .click('*[data-id="settings-sidebar-general"]')
                        .waitForElementPresent('[data-id="generate-contract-metadataSwitch"]')
                        .click('[data-id="generate-contract-metadataSwitch"]')
                        .waitForElementVisible('*[data-id="scConfigExpander"]')
                        .click('*[data-id="scConfigExpander"]')
                        .waitForElementVisible('*[data-id="scFileConfiguration"]', 10000)
                        .click('*[data-id="scFileConfiguration"]')
                        .clickLaunchIcon('filePanel')
                        .openFile('remix.config.json')
                        .setEditorValue(remixConfig.content)

                        .addFile('ddd.sol', dddSource)
                        .openFile('ddd.sol')

                        .clickLaunchIcon('solidity')
                        .click('[data-id="compilerContainerCompileBtn"]')

                        .clickLaunchIcon('filePanel')
                        .expandAllFolders()
                        // Ensure both OZ versions were resolved into .deps/npm
                        .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 60000)
                        .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@4.7.3"]', 60000)
                        .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@5.0.2"]', 60000)
                        // Verify build-info contains expected sources and remappings entries
                        .verifyArtifactsBuildInfo([
                                {
                                        packagePath: 'npm:@openzeppelin/contracts@4.7.3/utils/Address.sol',
                                        versionComment: '4.7.0',
                                        description: 'Build-info should include OZ 4.7.3 Address.sol'
                                },
                                {
                                        packagePath: 'npm:@openzeppelin/contracts@5.0.2/utils/Strings.sol',
                                        versionComment: '5.0.0',
                                        description: 'Build-info should include OZ 5.0.2 Strings.sol'
                                }
                        ])
                        // After verifyArtifactsBuildInfo opens build info JSON, assert remappings array strings are present
                        .getEditorValue((content) => {
                                const txt = (content || '').toString()
                                ;(browser as any).assert.ok(txt.includes('"remappings"'), 'Metadata should contain remappings array')
                                ;(browser as any).assert.ok(txt.includes('open4.7.3/=npm:@openzeppelin/contracts@4.7.3/'), 'Metadata remappings should include open4.7.3 mapping')
                                ;(browser as any).assert.ok(txt.includes('open5.0.2/=npm:@openzeppelin/contracts@5.0.2/'), 'Metadata remappings should include open5.0.2 mapping')
                                ;(browser as any).assert.ok(txt.includes('npm:@openzeppelin/contracts@4.7.3/utils/Address.sol'), 'Metadata sources should include OZ 4.7.3 Address.sol')
                                ;(browser as any).assert.ok(txt.includes('npm:@openzeppelin/contracts@5.0.2/utils/Strings.sol'), 'Metadata sources should include OZ 5.0.2 Strings.sol')
                        })
        },
    'Test complex local imports with external dependencies #group22': function (browser: NightwatchBrowser) {
        browser
            // Create a realistic project structure with multiple folders and contracts
            .addFile('contracts/interfaces/IStorage.sol', localImportsProjectSource['contracts/interfaces/IStorage.sol'])
            .addFile('contracts/libraries/Math.sol', localImportsProjectSource['contracts/libraries/Math.sol'])
            .addFile('contracts/base/BaseContract.sol', localImportsProjectSource['contracts/base/BaseContract.sol'])
            .addFile('contracts/TokenVault.sol', localImportsProjectSource['contracts/TokenVault.sol'])
            .addFile('contracts/main/Staking.sol', localImportsProjectSource['contracts/main/Staking.sol'])
            // Enable generate-contract-metadata to verify compilation artifacts
            .waitForElementVisible('*[data-id="topbar-settingsIcon"]')
            .click('*[data-id="topbar-settingsIcon"]')
            .waitForElementVisible('*[data-id="settings-sidebar-general"]')
            .click('*[data-id="settings-sidebar-general"]')
            .waitForElementPresent('[data-id="generate-contract-metadataSwitch"]')
            .click('[data-id="generate-contract-metadataSwitch"]')
            // Open the main contract which imports everything
            .openFile('contracts/main/Staking.sol')
            // Switch to Solidity compiler panel
            .clickLaunchIcon('solidity')
            // Compile the contract
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(5000) // Longer pause for multiple external imports
            .clickLaunchIcon('filePanel')

            // Verify external dependencies were resolved
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 60000)
            .expandAllFolders()
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm"]', 60000)
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin"]', 60000)
            .waitForElementVisible('*[data-id^="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@"]', 60000)
            .perform(function () {
                browser.assert.ok(true, 'External OpenZeppelin dependencies should be resolved')
            })
            // Verify compilation succeeded with mixed local and external imports
            .waitForElementPresent('*[data-id="compiledContracts"]', 10000)
            .perform(function () {
                browser.assert.ok(true, 'Complex project with local and external imports should compile successfully')
            })
            // Verify all local contracts are in the workspace (not in .deps)
            .expandAllFolders()
            .waitForElementVisible('*[data-id="treeViewDivDraggableItemcontracts/interfaces"]', 10000)
            .waitForElementVisible('*[data-id="treeViewDivDraggableItemcontracts/libraries"]', 10000)
            .waitForElementVisible('*[data-id="treeViewDivDraggableItemcontracts/base"]', 10000)
            .waitForElementVisible('*[data-id="treeViewDivDraggableItemcontracts/main"]', 10000)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts/TokenVault.sol"]', 10000)
            .perform(function () {
                browser.assert.ok(true, 'All local contract folders should be present in workspace')
            })
            // Open resolution index to verify local imports are mapped correctly
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/.resolution-index.json"]', 60000)
            .openFile('.deps/npm/.resolution-index.json')
            .getEditorValue((content) => {
                try {
                    const idx = JSON.parse(content)
                    const sourceFiles = Object.keys(idx || {})

                    // Find Staking.sol entry (main contract)
                    const stakingEntry = sourceFiles.find(file => file.includes('Staking.sol'))
                    browser.assert.ok(!!stakingEntry, 'Resolution index should contain Staking.sol')

                    if (stakingEntry) {
                        const mappings = idx[stakingEntry]
                        const mappingKeys = Object.keys(mappings)

                        const hasLocalImport = mappingKeys.some(key =>
                            key.includes('../base/BaseContract.sol') ||
                            key.includes('../TokenVault.sol')
                        )

                        browser.assert.ok(hasLocalImport, 'Local relative imports should be in resolution index')

                        // Verify that external imports ARE in the mappings
                        const hasExternalImport = mappingKeys.some(key =>
                            key.includes('@openzeppelin/contracts')
                        )
                        browser.assert.ok(hasExternalImport, 'External imports should be mapped in resolution index')
                    }
                } catch (e) {
                    browser.assert.fail('Resolution index should be valid JSON: ' + e.message)
                }
            })
            // Verify build-info artifacts contain both local and external contracts
            .verifyArtifactsBuildInfo([
                {
                    packagePath: 'contracts/main/Staking.sol',
                    versionComment: 'SPDX-License-Identifier: MIT',
                    description: 'Should find local Staking.sol contract in build-info'
                },
                {
                    packagePath: 'contracts/base/BaseContract.sol',
                    versionComment: 'SPDX-License-Identifier: MIT',
                    description: 'Should find local BaseContract.sol in build-info'
                },
                {
                    packagePath: '@openzeppelin/contracts',
                    versionComment: 'Ownable.sol',
                    description: 'Should find external OpenZeppelin Ownable.sol in build-info'
                },
                {
                    packagePath: '@openzeppelin/contracts',
                    versionComment: 'Pausable.sol',
                    description: 'Should find external OpenZeppelin Pausable.sol in build-info'
                }
            ])
    },

    'Test cache invalidation when package.json version changes #group31': function (browser: NightwatchBrowser) {
        // This test validates that when a user changes package.json versions,
        // the cached package.json files don't cause incorrect version resolution.
        // 
        // Bug scenario:
        // 1. User has package.json with @openzeppelin/contracts@4.8.3
        // 2. System fetches and caches .deps/npm/@openzeppelin/contracts@4.8.3/package.json
        // 3. User changes package.json to @openzeppelin/contracts@5.4.0
        // 4. System should fetch fresh 5.4.0 package.json, NOT use cached 4.8.3 data

        browser
            .clickLaunchIcon('filePanel')
            // Start with version 4.8.3
            .addFile('package.json', {
                content: `{
  "name": "cache-test",
  "dependencies": {
    "@openzeppelin/contracts": "4.8.3"
  }
}`
            })
            .addFile('CacheTest.sol', {
                content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
contract CacheTest is ERC20 {
    constructor() ERC20("Test", "TST") {}
}`
            })
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(5000)
            .clickLaunchIcon('filePanel')
            .expandAllFolders()

            // Verify 4.8.3 was used
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@4.8.3"]', 60000)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@4.8.3/package.json"]', 10000)
            .openFile('.deps/npm/@openzeppelin/contracts@4.8.3/package.json')
            .pause(1000)
            .getEditorValue((content) => {
                const pkg = JSON.parse(content)
                    ; (browser as any).assert.strictEqual(pkg.version, '4.8.3', 'Initial package.json should be version 4.8.3')
            })

            // Now change to 5.4.0 - this is where cache can cause problems
            .openFile('package.json')
            .setEditorValue(`{
  "name": "cache-test",
  "dependencies": {
    "@openzeppelin/contracts": "5.4.0"
  }
}`)
            .pause(1000)

            // Trigger re-compilation which should use NEW version
            .openFile('CacheTest.sol')
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(5000)
            .clickLaunchIcon('filePanel')
            .expandAllFolders()

            // Verify 5.4.0 is now present
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@5.4.0"]', 60000)
            .waitForElementVisible('*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts@5.4.0/package.json"]', 10000)
            .openFile('.deps/npm/@openzeppelin/contracts@5.4.0/package.json')
            .pause(1000)
            .getEditorValue((content) => {
                try {
                    const pkg = JSON.parse(content)
                        // This is the critical assertion: the 5.4.0 package.json must have version 5.4.0
                        // NOT 4.8.3 due to cache corruption
                        ; (browser as any).assert.strictEqual(pkg.version, '5.4.0', 'Updated package.json should be version 5.4.0, not cached 4.8.3')
                        ; (browser as any).assert.strictEqual(pkg.name, '@openzeppelin/contracts', 'Package name should be correct')
                } catch (e) {
                    ; (browser as any).assert.fail('Package.json should be valid JSON with correct version: ' + (e as Error).message)
                }
            })
    },

    /**
     * VERSION RESOLUTION PRIORITY TESTS
     * 
     * These tests verify the version resolution priority chain works correctly:
     * 1. WorkspaceResolutionStrategy (priority 100) - package.json resolutions/overrides
     * 2. ParentDependencyStrategy (priority 75) - parent package dependencies
     * 3. LockFileStrategy (priority 50) - yarn.lock or package-lock.json
     * 4. NpmFetchStrategy (priority 0) - fetch from npm as last resort
     */

    'Test package.json dependency beats yarn.lock #group33': function (browser: NightwatchBrowser) {
        // This test verifies that WorkspaceResolutionStrategy (priority 100) beats LockFileStrategy (priority 50)
        // When both package.json and yarn.lock specify different versions, package.json should win
        browser
            .clickLaunchIcon('filePanel')
            .addFile('package.json', packageJsonBeatsLockfileSource['package.json'])
            .addFile('yarn.lock', packageJsonBeatsLockfileSource['yarn.lock'])
            .addFile('PriorityTest.sol', packageJsonBeatsLockfileSource['PriorityTest.sol'])
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(3000)
            .clickLaunchIcon('filePanel')
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 60000)
            .expandAllFolders()
            // Should use version from package.json (5.0.2) NOT yarn.lock (4.9.6)
            // This proves WorkspaceResolutionStrategy (100) beats LockFileStrategy (50)
            .waitForElementPresent('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@5.0.2"]', 10000)
            .waitForElementNotPresent('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@4.9.6"]', 5000)
            .perform(function () {
                browser.assert.ok(true, 'package.json version (5.0.2) should override yarn.lock version (4.9.6)')
            })
    },

    'Test package.json resolutions override dependencies #group34': function (browser: NightwatchBrowser) {
        // This test verifies that package.json "resolutions" field takes precedence over regular dependencies
        // This is the highest priority in WorkspaceResolutionStrategy
        browser
            .clickLaunchIcon('filePanel')
            .addFile('package.json', resolutionsOverrideSource['package.json'])
            .addFile('ResolutionsTest.sol', resolutionsOverrideSource['ResolutionsTest.sol'])
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(3000)
            .clickLaunchIcon('filePanel')
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 60000)
            .expandAllFolders()
            // Should use version from resolutions (4.7.3) NOT dependencies (5.0.2)
            // The "resolutions" field should take precedence
            .waitForElementPresent('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@4.7.3"]', 10000)
            .waitForElementNotPresent('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@5.0.2"]', 5000)
            .perform(function () {
                browser.assert.ok(true, 'resolutions field (4.7.3) should override dependencies field (5.0.2)')
            })
    },

    'Test parent dependency resolution for transitive deps #group35': function (browser: NightwatchBrowser) {
        // This test verifies that ParentDependencyStrategy correctly uses the parent package's
        // dependencies to resolve transitive imports.
        // When importing @chainlink/contracts-ccip, the transitive @chainlink/contracts dependency
        // should use the version specified in @chainlink/contracts-ccip's package.json
        browser
            .clickLaunchIcon('filePanel')
            .addFile('ParentDepTest.sol', parentDependencyPrioritySource['ParentDepTest.sol'])
            // Enable generate-contract-metadata to verify build artifacts
            .waitForElementVisible('*[data-id="topbar-settingsIcon"]')
            .click('*[data-id="topbar-settingsIcon"]')
            .waitForElementVisible('*[data-id="settings-sidebar-general"]')
            .click('*[data-id="settings-sidebar-general"]')
            .waitForElementPresent('[data-id="generate-contract-metadataSwitch"]')
            .click('[data-id="generate-contract-metadataSwitch"]')
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(5000)
            .clickLaunchIcon('filePanel')
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 120000)
            .expandAllFolders()
            // The @chainlink/contracts-ccip@1.6.1 package.json specifies @chainlink/contracts@1.4.0
            // So the transitive import should resolve to 1.4.0, NOT the latest 1.5.x
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps/npm/@chainlink"]', 60000)
            .waitForElementPresent('*[data-id="treeViewDivDraggableItem.deps/npm/@chainlink/contracts-ccip@1.6.1"]', 10000)
            .waitForElementPresent('*[data-id="treeViewDivDraggableItem.deps/npm/@chainlink/contracts@1.4.0"]', 10000)
            // Should NOT have contracts@1.5.x since parent specifies 1.4.0
            .waitForElementNotPresent('*[data-id^="treeViewDivDraggableItem.deps/npm/@chainlink/contracts@1.5"]', 5000)
            .perform(function () {
                browser.assert.ok(true, 'Transitive @chainlink/contracts should be 1.4.0 (from parent package.json), not latest')
            })
    },

    'Test lockfile wins over npm fetch when no package.json #group36': function (browser: NightwatchBrowser) {
        // This test verifies that LockFileStrategy (priority 50) beats NpmFetchStrategy (priority 0)
        // When only yarn.lock exists (no package.json), it should use the lockfile version
        browser
            .clickLaunchIcon('filePanel')
            // Only add yarn.lock, no package.json
            .addFile('yarn.lock', lockfileOnlySource['yarn.lock'])
            .addFile('LockfileOnlyTest.sol', lockfileOnlySource['LockfileOnlyTest.sol'])
            .clickLaunchIcon('solidity')
            .click('[data-id="compilerContainerCompileBtn"]')
            .pause(3000)
            .clickLaunchIcon('filePanel')
            .waitForElementVisible('*[data-id="treeViewDivDraggableItem.deps"]', 60000)
            .expandAllFolders()
            // Should use exact version from yarn.lock (4.8.2) NOT latest from npm
            .waitForElementPresent('*[data-id="treeViewDivDraggableItem.deps/npm/@openzeppelin/contracts@4.8.2"]', 10000)
            .perform(function () {
                browser.assert.ok(true, 'Without package.json, yarn.lock version (4.8.2) should be used instead of npm latest')
            })
    },

}

// Named source objects for each test group
const upgradeableNFTSource = {
    'UpgradeableNFT.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract UpgradeableNFT is Initializable, ERC1155Upgradeable, OwnableUpgradeable, ERC1155PausableUpgradeable, ERC1155BurnableUpgradeable {
    function initialize() public initializer {
        __ERC1155_init("");
        __Ownable_init(msg.sender);
        __ERC1155Pausable_init();
        __ERC1155Burnable_init();
    }
}
`
    }
}

const packageJsonV4_8_3Source = {
    'package.json': {
        content: `{
  "name": "test-workspace",
  "version": "1.0.0",
  "dependencies": {
    "@openzeppelin/contracts": "4.8.3"
  }
}`
    },
    'TokenWithDeps.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TokenWithDeps is ERC20 {
    constructor() ERC20("Test Token", "TST") {
        _mint(msg.sender, 1000000 * 10 ** decimals());
    }
}
`
    }
}

const packageJsonV5_4_0Source = {
    'package.json': {
        content: `{
  "name": "test-workspace",
  "version": "1.0.0",
  "dependencies": {
    "@openzeppelin/contracts": "5.4.0"
  }
}`
    },
    'TokenWithDeps.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TokenWithDeps is ERC20 {
    constructor() ERC20("Test Token", "TST") {
        _mint(msg.sender, 1000000 * 10 ** decimals());
    }
}
`
    }
}

const explicitVersionsSource = {
    'ExplicitVersions.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts@4.8.3/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts@4.8.3/token/ERC20/ERC20.sol";

contract ExplicitVersions is ERC20 {
    constructor() ERC20("Explicit", "EXP") {}
}
`
    }
}

const conflictingVersionsSource = {
    'package.json': {
        content: `{
  "name": "conflict-test",
  "version": "1.0.0",
  "dependencies": {
    "@openzeppelin/contracts": "4.8.3"
  }
}`
    },
    'ConflictingVersions.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Package.json has 4.8.3, but we explicitly request 5
import "@openzeppelin/contracts@5/token/ERC20/IERC20.sol";

contract ConflictingVersions {
    IERC20 public token;
}
`
    }
}

const yarnLockV4_9_6Source = {
    'yarn.lock': {
        content: `# THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
# yarn lockfile v1

"@openzeppelin/contracts@^4.9.0":
  version "4.9.6"
  resolved "https://registry.yarnpkg.com/@openzeppelin/contracts/-/contracts-4.9.6.tgz"
  integrity sha512-xSmezSupL+y9VkHZJGDoCBpmnB2ogM13ccaYDWqJTfS3dy96XIBCrAtOzko4xtrkR9Nj/Ox+oF+Y5C+RqXoRWA==
`
    },
    'YarnLockTest.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract YarnLockTest is ERC20 {
    constructor() ERC20("Yarn Test", "YRN") {}
}
`
    }
}

const yarnLockV4_7_3Source = {
    'yarn.lock': {
        content: `# THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
# yarn lockfile v1

"@openzeppelin/contracts@^4.7.0":
  version "4.7.3"
  resolved "https://registry.yarnpkg.com/@openzeppelin/contracts/-/contracts-4.7.3.tgz"
  integrity sha512-dGRS0agJzu8ybo44pCIf3xBaPQN/65AIXNgK8+4gzKd5kbvlqyxryUYVLJv7fK98Seyd2hDzVEHSWAh0Bt1Yw==
`
    }
}

const packageLockV4_8_1Source = {
    'package-lock.json': {
        content: `{
  "name": "remix-project",
  "version": "1.0.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "remix-project",
      "version": "1.0.0",
      "dependencies": {
        "@openzeppelin/contracts": "^4.8.0"
      }
    },
    "node_modules/@openzeppelin/contracts": {
      "version": "4.8.1",
      "resolved": "https://registry.npmjs.org/@openzeppelin/contracts/-/contracts-4.8.1.tgz",
      "integrity": "sha512-xQ6v385CMc2Qnn1H3bKXB8gEtXCCB8iYS4Y4BS3XgNpvBzXDgLx4NN8q8TV3B0S7o0+yD4CRBb/2W2mlYWKHdg=="
    }
  }
}`
    },
    'PackageLockTest.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract PackageLockTest is ERC20 {
    constructor() ERC20("PackageLock", "PKL") {}
}
`
    }
}

const packageLockV4_6_0Source = {
    'package-lock.json': {
        content: `{
  "name": "remix-project",
  "version": "1.0.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "remix-project",
      "version": "1.0.0",
      "dependencies": {
        "@openzeppelin/contracts": "^4.6.0"
      }
    },
    "node_modules/@openzeppelin/contracts": {
      "version": "4.6.0",
      "resolved": "https://registry.npmjs.org/@openzeppelin/contracts/-/contracts-4.6.0.tgz",
      "integrity": "sha512-8vi4d50NNya/bQqCTNr9oGZXGQs7VRuXVZ5ivW7s3t+a76p/sU4Mbq3XBT3aKfpixiO14SV1jqFoXsdyHYiP8g=="
    }
  }
}`
    }
}

const chainlinkCCIPSource = {
    'ChainlinkCCIP.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts-ccip@1.6.1/contracts/applications/CCIPReceiver.sol";
import "@chainlink/contracts-ccip@1.6.1/contracts/libraries/Client.sol";

contract ChainlinkCCIP is CCIPReceiver {
    constructor(address router) CCIPReceiver(router) {}
    
    function _ccipReceive(Client.Any2EVMMessage memory _message) internal override {}
}
`
    }
}

const npmAliasSource = {
    'NpmAliasTest.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Test npm alias syntax: npm:@openzeppelin/contracts@4.9.0
import "npm:@openzeppelin/contracts@4.9.0/token/ERC20/ERC20.sol";
import "npm:@openzeppelin/contracts@4.9.0/access/Ownable.sol";

contract NpmAliasTest is ERC20, Ownable {
    constructor() ERC20("NpmAlias", "NPA") Ownable() {}
}
`
    }
}

const unpkgImportSource = {
    'GitHubImportTest.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Test GitHub URL import via jsDelivr (raw file)
// Use a standalone interface file to avoid nested deps during the test
import "https://unpkg.com/@openzeppelin/contracts@4.8.0/token/ERC20/IERC20.sol";

contract GitHubImportTest {
    function foo(IERC20 token) external view returns (uint256) {
        return token.totalSupply();
    }
}
`
    }
}

const indexAfterWSSource = {
    'IndexAfterWS.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract IndexAfterWS is ERC20 {
    constructor() ERC20("WS", "WSX") {}
}
`
    }
}

const resolutionIndexSource = {
    'ResolutionIndexTest.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract ResolutionIndexTest is ERC20, ERC20Burnable {
    constructor() ERC20("Index", "IDX") {}
}
`
    },
    'SecondIndexTest.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract SecondIndexTest is ERC721, AccessControl {
    constructor() ERC721("Second", "2ND") {}
    
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
`
    },
    'IndexAfterWS.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract IndexAfterWS is ERC20 {
    constructor() ERC20("WS", "WSX") {}
}
`
    }
}

const debugLoggingSource = {
    'DebugLogTest.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract DebugLogTest is ERC20, Pausable {
    constructor() ERC20("Debug", "DBG") {}
}
`
    },
    'NoDebugLogTest.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract NoDebugLogTest is ERC1155 {
    constructor() ERC1155("") {}
}
`
    }
}

const importParsingEdgeCasesSource = {
    'ImportParsingEdgeCases.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Regular imports
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// Multi-line import with symbols
import {
    IERC20,
    IERC20Metadata
} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

// Additional valid import (no star import in Solidity)
import { Context } from "@openzeppelin/contracts/utils/Context.sol";

// Commented imports (should be ignored)
// import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
/* 
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
*/

contract ImportParsingEdgeCases is ERC20, Ownable, Context {
    // String literal containing "import" (should be ignored)
    string constant IMPORT_TEXT = "This is an import statement in a string";
    
    constructor() ERC20("EdgeCase", "EDGE") Ownable(msg.sender) {}
}
`
    }
}

const multiLineImportsSource = {
    'MultiLineImports.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Multi-line imports with various formatting
import {
    IERC20,
    IERC20Metadata
} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {
    ERC20
} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {
    Ownable
} from "@openzeppelin/contracts/access/Ownable.sol";

contract MultiLineImports is ERC20, Ownable {
    constructor() ERC20("MultiLine", "MLI") Ownable(msg.sender) {}
}
`
    }
}

const unresolvableImportSource = {
    'UnresolvableImportTest.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// This import should fail because SafeMath was removed in OpenZeppelin v5.0+
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

// This import should work fine
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract UnresolvableImportTest is ERC20 {
    constructor() ERC20("Unresolvable", "UNR") {}
}
`
    }
}

const cdnImportsSource = {
    'UnpkgTest.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Test unpkg.com CDN import (versioned)
import "https://unpkg.com/@openzeppelin/contracts@4.8.0/token/ERC20/ERC20.sol";

contract UnpkgTest is ERC20 {
    constructor() ERC20("Unpkg", "UPG") {
        _mint(msg.sender, 1000000 * 10 ** decimals());
    }
}
`
    },
    'UnpkgUnversionedTest.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Test unpkg.com CDN import (unversioned - version resolved from workspace)
import "https://unpkg.com/@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract UnpkgUnversionedTest is ERC20 {
    constructor() ERC20("UnpkgUnver", "UUV") {
        _mint(msg.sender, 1000000 * 10 ** decimals());
    }
}
`
    },
    'JsdelivrNpmTest.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Test cdn.jsdelivr.net npm import (versioned)
import "https://cdn.jsdelivr.net/npm/@openzeppelin/contracts@4.8.0/token/ERC20/ERC20.sol";

contract JsdelivrNpmTest is ERC20 {
    constructor() ERC20("Jsdelivr", "JSD") {
        _mint(msg.sender, 1000000 * 10 ** decimals());
    }
}
`
    },
    'JsdelivrUnversionedTest.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Test cdn.jsdelivr.net npm import (unversioned - version resolved from workspace)
import "https://cdn.jsdelivr.net/npm/@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract JsdelivrUnversionedTest is ERC20 {
    constructor() ERC20("JsdelivrUnver", "JUV") {
        _mint(msg.sender, 1000000 * 10 ** decimals());
    }
}
`
    },
    'RawGitHubTest.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Test raw.githubusercontent.com import (GitHub will convert blob URLs to this)
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v4.8.0/contracts/token/ERC20/ERC20.sol";

contract RawGitHubTest is ERC20 {
    constructor() ERC20("RawGitHub", "RGH") {
        _mint(msg.sender, 1000000 * 10 ** decimals());
    }
}
`
    }
}

const invalidImportSource = {
    'InvalidImportTest.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// This should FAIL - importing a non-.sol file from CDN
import "https://unpkg.com/@openzeppelin/contracts@4.8.0/package.json";

contract InvalidImportTest {
    string public name = "This should not compile";
}
`
    },
    'InvalidPackageJsonImport.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// This should FAIL - importing package.json from npm
import "@openzeppelin/contracts/package.json";

contract InvalidPackageJsonImport {
    string public name = "This should not compile";
}
`
    },
    'InvalidReadmeImport.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// This should FAIL - importing README.md file
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v4.8.0/README.md";

contract InvalidReadmeImport {
    string public name = "This should not compile";
}
`
    }
}

const npmAliasMultiVersionSource = {
    'package.json': {
        content: `{
  "name": "oz-multi-version-mre",
  "private": true,
  "scripts": {
    "compile": "hardhat compile"
  },
  "devDependencies": {
    "hardhat": "^2.22.9"
  },
  "dependencies": {
    "@openzeppelin/contracts": "4.9.6",
    "@openzeppelin/contracts-5": "npm:@openzeppelin/contracts@5.0.2"
  }
}`
    },
    'eee.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Same library, two versions, imported under different npm package names
import {ERC20 as ERC20v4} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20 as ERC20v5} from "@openzeppelin/contracts-5/token/ERC20/ERC20.sol";

// Minimal contract to ensure a definition exists
contract EEE { }
`
    }
}

const jsDelivrMultiVersionSource = {
    'MixedCDNVersions.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20 as ERC20v5} from "https://cdn.jsdelivr.net/npm/@openzeppelin/contracts@5.0.2/token/ERC20/ERC20.sol";
import {ECDSA as ECDSAv4} from "https://cdn.jsdelivr.net/npm/@openzeppelin/contracts@4.9.6/utils/cryptography/ECDSA.sol";

contract MixedOkay is ERC20v5 {
    using ECDSAv4 for bytes32;

    constructor() ERC20v5("Mixed Okay", "MOK") {}

    function recover(bytes32 digest, bytes memory signature) external pure returns (address) {
        return ECDSAv4.recover(digest, signature);
    }
}
`
    }
}

const jsDelivrV5WithV4UtilsSource = {
    'djdidjod.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Must be 0z v5 -- _update exists only in v5
import {ERC20 as ERC20v5} from
    "https://cdn.jsdelivr.net/npm/@openzeppelin/contracts@5.0.2/token/ERC20/ERC20.sol";

// Must be 0z v4 — SafeMath was removed in v5
import {SafeMath as SafeMathv4} from
    "https://cdn.jsdelivr.net/npm/@openzeppelin/contracts@4.9.6/utils/math/SafeMath.sol";

contract MixedProof is ERC20v5 {
    using SafeMathv4 for uint256;

    constructor() ERC20v5("Mixed Proof", "MPF") {}

    // Proves we're on 0z v5: this override compiles only with v5
    function _update(address from, address to, uint256 value) internal override {
        // Touch SafeMath v4 to prove that library is from 4.9.6
        uint256 bumped = value.add(1); // SafeMath v4 method
        super._update(from, to, bumped - 1);
    }
}
`
    }
}

const chainlinkMultiVersionSource = {
    'ChainlinkMultiVersion.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Import Chainlink contracts that have transitive dependencies on different OpenZeppelin versions
// This tests that the dependency resolver correctly handles multiple versions of the same package
// when they are pulled in as transitive dependencies from a third-party library
import "https://cdn.jsdelivr.net/npm/@chainlink/contracts@1.5.0/src/v0.8/functions/v1_3_0/accessControl/TermsOfServiceAllowList.sol";
import "https://cdn.jsdelivr.net/npm/@chainlink/contracts@1.5.0/src/v0.8/keystone/interfaces/IReceiver.sol";

contract ChainlinkMultiVersion {
    // This contract tests transitive multi-version dependency resolution
    // Chainlink contracts may depend on different OpenZeppelin versions internally
}
`
    }
}

const localImportsProjectSource = {
    'contracts/interfaces/IStorage.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IStorage
 * @dev Interface for storage operations
 */
interface IStorage {
    function store(uint256 value) external;
    function retrieve() external view returns (uint256);
}
`
    },
    'contracts/libraries/Math.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Math
 * @dev Basic math operations library
 */
library Math {
    function add(uint256 a, uint256 b) internal pure returns (uint256) {
        return a + b;
    }
    
    function multiply(uint256 a, uint256 b) internal pure returns (uint256) {
        return a * b;
    }
}
`
    },
    'contracts/base/BaseContract.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Local import from interfaces folder
import "../interfaces/IStorage.sol";

// External import from OpenZeppelin
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BaseContract
 * @dev Base contract with storage and access control
 */
abstract contract BaseContract is IStorage, Ownable {
    uint256 private storedValue;
    
    constructor() Ownable(msg.sender) {}
    
    function store(uint256 value) external override onlyOwner {
        storedValue = value;
    }
    
    function retrieve() external view override returns (uint256) {
        return storedValue;
    }
}
`
    },
    'contracts/TokenVault.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Local import from libraries
import "./libraries/Math.sol";

// External imports from OpenZeppelin
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title TokenVault
 * @dev Manages ERC20 token deposits
 */
contract TokenVault {
    using SafeERC20 for IERC20;
    using Math for uint256;
    
    mapping(address => mapping(address => uint256)) public deposits;
    
    event Deposited(address indexed user, address indexed token, uint256 amount);
    
    function deposit(address token, uint256 amount) external {
        require(amount > 0, "Amount must be greater than 0");
        
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        deposits[msg.sender][token] = Math.add(deposits[msg.sender][token], amount);
        
        emit Deposited(msg.sender, token, amount);
    }
    
    function getDeposit(address user, address token) external view returns (uint256) {
        return deposits[user][token];
    }
}
`
    },
    'contracts/main/Staking.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Local imports - relative paths from different folders
import "../base/BaseContract.sol";
import "../TokenVault.sol";
import "../libraries/Math.sol";

// External imports from OpenZeppelin
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title Staking
 * @dev Main staking contract that combines local and external dependencies
 */
contract Staking is BaseContract, Pausable {
    using Math for uint256;
    
    TokenVault public vault;
    IERC20 public stakingToken;
    
    mapping(address => uint256) public stakedBalance;
    
    event Staked(address indexed user, uint256 amount);
    
    constructor(address _stakingToken, address _vault) {
        stakingToken = IERC20(_stakingToken);
        vault = TokenVault(_vault);
    }
    
    function stake(uint256 amount) external whenNotPaused {
        require(amount > 0, "Cannot stake 0");
        
        stakingToken.transferFrom(msg.sender, address(this), amount);
        stakedBalance[msg.sender] = Math.add(stakedBalance[msg.sender], amount);
        
        emit Staked(msg.sender, amount);
    }
    
    function getStakedBalance(address user) external view returns (uint256) {
        return stakedBalance[user];
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
}
`
    }
}

// ============================================================================
// VERSION RESOLUTION PRIORITY TEST SOURCES
// These source objects are used to test the priority chain:
// WorkspaceResolution (100) > ParentDependency (75) > LockFile (50) > NpmFetch (0)
// ============================================================================

// Test that package.json dependencies beat yarn.lock
const packageJsonBeatsLockfileSource = {
    'package.json': {
        content: `{
  "name": "priority-test",
  "version": "1.0.0",
  "dependencies": {
    "@openzeppelin/contracts": "5.0.2"
  }
}`
    },
    'yarn.lock': {
        content: `# THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
# yarn lockfile v1

"@openzeppelin/contracts@^4.9.0":
  version "4.9.6"
  resolved "https://registry.yarnpkg.com/@openzeppelin/contracts/-/contracts-4.9.6.tgz"
  integrity sha512-xSmezSupL+y9VkHZJGDoCBpmnB2ogM13ccaYDWqJTfS3dy96XIBCrAtOzko4xtrkR9Nj/Ox+oF+Y5C+RqXoRWA==
`
    },
    'PriorityTest.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract PriorityTest is ERC20 {
    constructor() ERC20("Priority", "PRI") {}
}
`
    }
}

// Test that package.json resolutions field overrides dependencies
const resolutionsOverrideSource = {
    'package.json': {
        content: `{
  "name": "resolutions-test",
  "version": "1.0.0",
  "dependencies": {
    "@openzeppelin/contracts": "5.0.2"
  },
  "resolutions": {
    "@openzeppelin/contracts": "4.7.3"
  }
}`
    },
    'ResolutionsTest.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ResolutionsTest is ERC20 {
    constructor() ERC20("Resolutions", "RES") {}
}
`
    }
}

// Test that parent package dependencies are used for transitive imports
const parentDependencyPrioritySource = {
    'ParentDepTest.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Import from @chainlink/contracts-ccip which has @chainlink/contracts as a dependency
// The contracts-ccip@1.6.1 package.json specifies @chainlink/contracts@1.4.0
// so the transitive import should resolve to 1.4.0 (ParentDependencyStrategy)
// NOT the latest version (NpmFetchStrategy)
import "@chainlink/contracts-ccip@1.6.1/contracts/applications/CCIPReceiver.sol";
import "@chainlink/contracts-ccip@1.6.1/contracts/libraries/Client.sol";

contract ParentDepTest is CCIPReceiver {
    constructor(address router) CCIPReceiver(router) {}
    
    function _ccipReceive(Client.Any2EVMMessage memory _message) internal override {}
}
`
    }
}

// Test that lockfile wins over npm fetch when no package.json exists
const lockfileOnlySource = {
    'yarn.lock': {
        content: `# THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
# yarn lockfile v1

"@openzeppelin/contracts@^4.8.0":
  version "4.8.2"
  resolved "https://registry.yarnpkg.com/@openzeppelin/contracts/-/contracts-4.8.2.tgz"
  integrity sha512-T/zDSgHr3wpJ0CxpN0CHjINPH0haJ4G3wF7yKVDG+Ev4TiZ7GjWGDzZ1hDkGvQmiJvSnoJNK8ZQYNLj7TnhBpw==
`
    },
    'LockfileOnlyTest.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract LockfileOnlyTest is ERC20 {
    constructor() ERC20("LockfileOnly", "LFO") {}
}
`
    }
}

// New source for OZ transitive index scenario
const ozTransitiveIndexSource = {
    'Entry.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol" as OZ;
import "@openzeppelin/contracts@5.0.2/utils/Context.sol" as ContextV5;
import "@openzeppelin/contracts@5.4.0/access/Ownable.sol" as Auth;

contract A is OZ.ERC20 {
    constructor() OZ.ERC20("A", "A") {}
}
`
    }
}

// Auto-generated by dump-folder-to-source.js
// eslint-disable

export const deepImportsSource = {
    'DeepImportsToken.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./security/Pausable.sol";
import "./access/RoleManager.sol";
import "./utils/interfaces/ITokenReceiver.sol";
import "./utils/libraries/SafeOperations.sol";


/**
 * @title DeepImportsToken
 * @dev ERC20 token with pausable, burnable, and role-based functionality
 */
contract DeepImportsToken is ERC20Burnable, Ownable, Pausable, RoleManager {
    using SafeOperations for uint256;

    uint256 public maxSupply;
    mapping(address => bool) public whitelisted;

    event WhitelistUpdated(address indexed account, bool status);

    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        uint256 _maxSupply
    ) ERC20(name, symbol) Ownable(msg.sender) {
        maxSupply = _maxSupply;
        _mint(msg.sender, initialSupply);
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(MINTER_ROLE, msg.sender);
    }

    function mint(
        address to,
        uint256 amount
    ) external onlyRole(MINTER_ROLE) whenNotPaused {
        require(totalSupply() + amount <= maxSupply, "Max supply exceeded");
        _mint(to, amount);
    }

    function updateWhitelist(
        address account,
        bool status
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        whitelisted[account] = status;
        emit WhitelistUpdated(account, status);
    }

    function safeTransfer(
        address to,
        uint256 amount
    ) external whenNotPaused returns (bool) {
        require(
            whitelisted[msg.sender] || whitelisted[to],
            "Either sender or receiver must be whitelisted"
        );
        uint256 safeAmount = amount.safeSub(1); // Apply safe operation

        if (isContract(to)) {
            ITokenReceiver receiver = ITokenReceiver(to);
            receiver.onTokenReceived(msg.sender, safeAmount);
        }

        _transfer(msg.sender, to, safeAmount);
        return true;
    }

    function isContract(address addr) internal view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(addr)
        }
        return size > 0;
    }

    function pause() external override onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external override onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
`
    },
    'access/Lockable.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Lockable
 * @dev Contract module which allows functions to be locked temporarily
 */
contract Lockable {
    bool private _locked;

    event Locked(address account);
    event Unlocked(address account);

    /**
     * @dev Initializes the contract in unlocked state.
     */
    constructor() {
        _locked = false;
    }

    /**
     * @dev Returns true if the contract is locked, and false otherwise.
     */
    function locked() public view virtual returns (bool) {
        return _locked;
    }

    /**
     * @dev Modifier to make a function callable only when the contract is not locked.
     */
    modifier whenNotLocked() {
        require(!locked(), "Lockable: locked");
        _;
    }

    /**
     * @dev Modifier to make a function callable only when the contract is locked.
     */
    modifier whenLocked() {
        require(locked(), "Lockable: not locked");
        _;
    }

    /**
     * @dev Triggers locked state.
     */
    function _lock() internal virtual whenNotLocked {
        _locked = true;
        emit Locked(msg.sender);
    }

    /**
     * @dev Returns to unlocked state.
     */
    function _unlock() internal virtual whenLocked {
        _locked = false;
        emit Unlocked(msg.sender);
    }
}
`
    },
    'access/RoleManager.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./Lockable.sol";

/**
 * @title RoleManager
 * @dev Contract module for role-based access control with additional lockable functionality
 */
contract RoleManager is AccessControl, Lockable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    event RoleRevoked(bytes32 indexed role, address indexed account);
    event RoleGranted(bytes32 indexed role, address indexed account);

    /**
     * @dev Grants \`role\` to \`account\`.
     */
    function grantRole(
        bytes32 role,
        address account
    ) public override onlyRole(DEFAULT_ADMIN_ROLE) whenNotLocked {
        super.grantRole(role, account);
        emit RoleGranted(role, account);
    }

    /**
     * @dev Revokes \`role\` from \`account\`.
     */
    function revokeRole(
        bytes32 role,
        address account
    ) public override onlyRole(DEFAULT_ADMIN_ROLE) whenNotLocked {
        super.revokeRole(role, account);
        emit RoleRevoked(role, account);
    }

    /**
     * @dev Setup a role for an account
     */
    function _setupRole(bytes32 role, address account) internal {
        super._grantRole(role, account);
    }
}
`
    },
    'mocks/TokenReceiverMock.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../utils/interfaces/ITokenReceiver.sol";

/**
 * @title TokenReceiverMock
 * @dev Mock contract implementing ITokenReceiver for testing purposes
 */
contract TokenReceiverMock is ITokenReceiver {
    event TokenReceived(address from, uint256 amount);

    bool private _shouldRevert;

    constructor(bool shouldRevert) {
        _shouldRevert = shouldRevert;
    }

    function onTokenReceived(
        address from,
        uint256 amount
    ) external override returns (bool) {
        if (_shouldRevert) {
            revert("TokenReceiverMock: forced revert");
        }

        emit TokenReceived(from, amount);
        return true;
    }

    function setShouldRevert(bool shouldRevert) external {
        _shouldRevert = shouldRevert;
    }
}
`
    },
    'security/Pausable.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Pausable
 * @dev Contract module which allows children to implement an emergency stop
 * mechanism that can be triggered by an authorized account.
 */
abstract contract Pausable {
    bool private _paused;

    event Paused(address account);
    event Unpaused(address account);

    /**
     * @dev Initializes the contract in unpaused state.
     */
    constructor() {
        _paused = false;
    }

    /**
     * @dev Returns true if the contract is paused, and false otherwise.
     */
    function paused() public view virtual returns (bool) {
        return _paused;
    }

    /**
     * @dev Modifier to make a function callable only when the contract is not paused.
     */
    modifier whenNotPaused() {
        require(!paused(), "Pausable: paused");
        _;
    }

    /**
     * @dev Modifier to make a function callable only when the contract is paused.
     */
    modifier whenPaused() {
        require(paused(), "Pausable: not paused");
        _;
    }

    /**
     * @dev Triggers stopped state.
     */
    function _pause() internal virtual whenNotPaused {
        _paused = true;
        emit Paused(msg.sender);
    }

    /**
     * @dev Returns to normal state.
     */
    function _unpause() internal virtual whenPaused {
        _paused = false;
        emit Unpaused(msg.sender);
    }

    /**
     * @dev Pause the contract. Should be overridden by derived contracts.
     */
    function pause() external virtual;

    /**
     * @dev Unpause the contract. Should be overridden by derived contracts.
     */
    function unpause() external virtual;
}
`
    },
    'utils/interfaces/ITokenReceiver.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ITokenReceiver
 * @dev Interface for contracts that want to receive tokens with a callback
 */
interface ITokenReceiver {
    /**
     * @dev Called when tokens are received
     * @param from Address which sent the tokens
     * @param amount Amount of tokens received
     * @return success Whether the operation was successful
     */
    function onTokenReceived(
        address from,
        uint256 amount
    ) external returns (bool);
}
`
    },
    'utils/libraries/SafeOperations.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SafeOperations
 * @dev Library for safe math operations with additional safety checks
 */
library SafeOperations {
    /**
     * @dev Returns a - b, with an extra validation
     */
    function safeSub(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b <= a, "SafeOperations: subtraction overflow");
        return a - b;
    }

    /**
     * @dev Returns a + b, with an extra validation
     */
    function safeAdd(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 c = a + b;
        require(c >= a, "SafeOperations: addition overflow");
        return c;
    }

    /**
     * @dev Returns a * b, with an extra validation
     */
    function safeMul(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a == 0) {
            return 0;
        }
        uint256 c = a * b;
        require(c / a == b, "SafeOperations: multiplication overflow");
        return c;
    }

    /**
     * @dev Returns a / b, with an extra validation
     */
    function safeDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b > 0, "SafeOperations: division by zero");
        return a / b;
    }
}
`
    }
}

const remixTestsHandlerSource = {
    'TestImportHandler.sol': {
        content: `// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.7.0 <0.9.0;

import "remix_tests.sol";
import "remix_accounts.sol";

contract TestImportHandler {
    function testAssertTrue() public {
        Assert.ok(true, "This should pass");
    }
    
    function testAccounts() public {
        address acc0 = TestsAccounts.getAccount(0);
        Assert.notEqual(acc0, address(0), "Account 0 should not be zero address");
    }
}
`
    }
}

// Remapping test sources
const foundryStyleRemappingSource = {
    'remappings.txt': {
        content: `oz/=@openzeppelin/contracts@5.0.2/`
    },
    'FoundryStyleTest.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "oz/token/ERC20/ERC20.sol";
contract FoundryStyleTest is ERC20 {
    constructor() ERC20("Test", "TST") {}
}
`
    }
}

const npmPrefixRemappingSource = {
    'remappings.txt': {
        content: `@openzeppelin/contracts@4.9.6/=npm:@openzeppelin/contracts@4.9.6/
@openzeppelin/contracts@5.0.2/=npm:@openzeppelin/contracts@5.0.2/`
    },
    'NpmPrefixTest.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts@4.9.6/utils/math/SafeMath.sol";
import "@openzeppelin/contracts@5.0.2/utils/Strings.sol";
contract NpmPrefixTest {
    using SafeMath for uint256;
    using Strings for uint256;
}
`
    }
}

const hardhatStyleRemappingSource = {
    'remappings.txt': {
        content: `@openzeppelin/contracts/=@openzeppelin/contracts@4.8.0/`
    },
    'HardhatStyleTest.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
contract HardhatStyleTest is ERC20, Ownable {
    constructor() ERC20("Hardhat", "HHT") Ownable() {}
}
`
    }
}

const multiVersionRemappingSource = {
    'remappings.txt': {
        content: `@openzeppelin/contracts-v4/=@openzeppelin/contracts@4.9.6/
@openzeppelin/contracts-v5/=@openzeppelin/contracts@5.0.2/`
    },
    'MultiVersionTest.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts-v4/utils/math/SafeMath.sol";
import "@openzeppelin/contracts-v5/utils/Strings.sol";
contract MultiVersionTest {
    using SafeMath for uint256;
    using Strings for uint256;
}
`
    }
}

const chainlinkBurnMintSource = {
    'ChainlinkBurnMint.sol': {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { BurnMintTokenPool } from "@chainlink/contracts-ccip@1.6.1/contracts/pools/BurnMintTokenPool.sol";

contract ChainlinkBurnMint {
    BurnMintTokenPool public tokenPool;
    
    constructor(address _tokenPool) {
        tokenPool = BurnMintTokenPool(_tokenPool);
    }
}
`
    }
}


// Keep sources array for backwards compatibility with @sources function
const sources = [
    upgradeableNFTSource,
    packageJsonV4_8_3Source,
    packageJsonV5_4_0Source,
    explicitVersionsSource,
    conflictingVersionsSource,
    yarnLockV4_9_6Source,
    yarnLockV4_7_3Source,
    packageLockV4_8_1Source,
    packageLockV4_6_0Source,
    chainlinkCCIPSource,
    npmAliasSource,
    unpkgImportSource,
    resolutionIndexSource,
    debugLoggingSource,
    importParsingEdgeCasesSource,
    multiLineImportsSource,
    unresolvableImportSource,
    cdnImportsSource,
    invalidImportSource,
    npmAliasMultiVersionSource,
    jsDelivrMultiVersionSource,
    jsDelivrV5WithV4UtilsSource,
    chainlinkMultiVersionSource,
    localImportsProjectSource,
    ozTransitiveIndexSource,
    deepImportsSource,
    remixTestsHandlerSource,
    foundryStyleRemappingSource,
    npmPrefixRemappingSource,
    hardhatStyleRemappingSource,
    multiVersionRemappingSource,
    chainlinkBurnMintSource,
]

