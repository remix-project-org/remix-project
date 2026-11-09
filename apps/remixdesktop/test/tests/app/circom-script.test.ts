import { NightwatchBrowser } from "nightwatch"


const tests = {
    before: function (browser: NightwatchBrowser, done: VoidFunction) {
        browser.hideToolTips().perform(() => done())
    },
    'Should create semaphore workspace': function (browser: NightwatchBrowser) {
        browser
            .hideToolTips()
            .waitForElementVisible('*[data-id="homeTabGetStartedsemaphore"]', 20000)
            .click('*[data-id="homeTabGetStartedsemaphore"]')
            .pause(3000)
            .windowHandles(function (result) {
                console.log(result.value)
                browser.hideToolTips().switchWindow(result.value[1])
                    .hideToolTips()
                    .waitForElementVisible('*[data-id="treeViewLitreeViewItemcircuits"]')
                    .click('*[data-id="treeViewLitreeViewItemcircuits"]')
                    .waitForElementVisible('*[data-id="treeViewLitreeViewItemcircuits/semaphore.circom"]')
                    .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts"]')
                    .click('*[data-id="treeViewLitreeViewItemscripts"]')
                    .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/groth16"]')
                    .click('*[data-id="treeViewLitreeViewItemscripts/groth16"]')
                    .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/groth16/groth16_trusted_setup.ts"]')
                    .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/groth16/groth16_zkproof.ts"]')
                    .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/plonk"]')
                    .click('*[data-id="treeViewLitreeViewItemscripts/plonk"]')
                    .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/plonk/plonk_trusted_setup.ts"]')
                    .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/plonk/plonk_zkproof.ts"]')
                    .waitForElementVisible('*[data-id="treeViewLitreeViewItemtemplates"]')
                    .click('*[data-id="treeViewLitreeViewItemtemplates"]')
                    .waitForElementVisible('*[data-id="treeViewLitreeViewItemtemplates/groth16_verifier.sol.ejs"]')
                    .waitForElementVisible('*[data-id="treeViewLitreeViewItemtemplates/plonk_verifier.sol.ejs"]')
            })
    },
    'Should run plonk trusted setup script for hash checker #group6': function (browser: NightwatchBrowser) {
        browser
            .click('[data-id="treeViewLitreeViewItemscripts/plonk/plonk_trusted_setup.ts"]')
            .pause(2000)
            .click('[data-id="compile-action"]')
            .waitForElementVisible('[data-id="verticalIconsKindcircuit-compiler"]')
            .waitForElementVisible({
                locateStrategy: 'xpath',
                selector: "//span[@class='text-log' and contains(., 'setup done.')]",
                timeout: 240000
            })
            .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/plonk/zk"]')
            .click('*[data-id="treeViewLitreeViewItemscripts/plonk/zk"]')
            .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/plonk/zk/keys"]')
            .click('*[data-id="treeViewLitreeViewItemscripts/plonk/zk/keys"]')
            .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/plonk/zk/keys/verification_key.json"]')
    },
    'Should run plonk zkproof script for hash checker #group6': function (browser: NightwatchBrowser) {
        browser
            .click('[data-id="treeViewLitreeViewItemscripts/plonk/plonk_zkproof.ts"]')
            .pause(2000)
            .click('[data-id="compile-action"]')
            .waitForElementVisible({
                locateStrategy: 'xpath',
                selector: "//span[@class='text-log' and contains(., 'proof done')]",
                timeout: 240000
            })
    }

}

module.exports = {} // disable for now, it takes too long to run tests
