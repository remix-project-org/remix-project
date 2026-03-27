'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'
import { releaseAccount } from '../helpers/pool'

require('dotenv').config()

const poolApiKey = process.env.E2E_POOL_API_KEY || ''
const INVITE_CODE_MEMBERSHIP = process.env.E2E_INVITE_CODE_MEMBERSHIP || ''

module.exports = {
    '@disabled': true,

    before: function (browser: NightwatchBrowser, done: VoidFunction) {
        if (!poolApiKey) {
            console.error('[TestPoolLogin] E2E_POOL_API_KEY not set — cannot run pool test')
            return done()
        }

        // Pass the pool key + enableLogin in the hash so the auth plugin can use it.
        // No fake token injection — the real login flow will do the checkout.
        const url = `http://127.0.0.1:8080#e2e_pool_key=${poolApiKey}&e2e_feature_groups=ai-pro&invite=${INVITE_CODE_MEMBERSHIP}`
        init(browser, done, url, false, null, true, false)
    },

    after: async function (browser: NightwatchBrowser, done: VoidFunction) {
        // Read the pool session that the auth plugin stored in sessionStorage
        try {
            const result: any = await new Promise((resolve) => {
                browser.execute(function () {
                    return sessionStorage.getItem('remix_pool_session')
                }, [], (res: any) => resolve(res))
            })

            if (result && result.value) {
                const session = JSON.parse(result.value)
                console.log(`[TestPoolLogin] Releasing pool session: ${session.sessionId}`)
                await releaseAccount(session.sessionId)
            }
        } catch (err: any) {
            console.error(`[TestPoolLogin] Release failed: ${err.message}`)
        }
        browser.end()
        done()
    },
    'Should show the membership request form #group1': '' + function (browser: NightwatchBrowser) {
        browser
            .waitForElementVisible('*[data-id="survey-ai-yes"]', 30000)
    },

    'Should fill in the form and submit #group1': '' + function (browser: NightwatchBrowser) {
        browser
            .click('*[data-id="survey-ai-yes"]')
            // Select at least one subscription feature
            .click('.survey-checkbox-item:first-child')
            .setValue('*[data-id="membership-email"]', 'e2e-test@remix.ethereum.org')
            .click('*[data-id="membership-consent"]')
            .click('*[data-id="membership-apply-btn"]')
    },

    'Should see the success confirmation #group1': '' + function (browser: NightwatchBrowser) {
        browser
            .waitForElementVisible('*[data-id="membership-got-it-btn"]', 15000)
            .click('*[data-id="membership-got-it-btn"]')
            .waitForElementNotPresent('.invite-overlay', 5000)
    },

    'Should receive approval notification #group1': '' + function (browser: NightwatchBrowser) {
        browser
            // Wait for the notification badge to appear (polling may take up to ~2 min)
            .waitForElementVisible('*[data-id="notification-badge"]', 120000)
            // Open the notification panel
            .click('*[data-id="notification-bell"]')
            .waitForElementVisible('*[data-id="notification-dropdown"]', 5000)
            // Click "Accept Invitation"
            .waitForElementVisible('.notification-action-invitation', 120000)
            .click('.notification-action-invitation')

    },
    'look at the beta invite system #group1': '' + function (browser: NightwatchBrowser) {
        browser
            // Wait for the invite modal's "Sign In" button and click it
            .waitForElementVisible({
                selector: '//div[contains(@class, "invite-modal-right-footer")]//button[@data-id="login-button"]',
                locateStrategy: 'xpath',
                timeout: 15000
            })
        // the rest we tested in invite_system.test.ts, but we can keep the test here to check the full flow with the pool login
    },

}
