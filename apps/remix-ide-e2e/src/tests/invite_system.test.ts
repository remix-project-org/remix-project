'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'
import { releaseAccount } from '../helpers/pool'

require('dotenv').config()

const poolApiKey = process.env.E2E_POOL_API_KEY || ''
const INVITE_CODE = process.env.E2E_INVITE_CODE || ''

module.exports = {
    '@disabled': true,

    before: function (browser: NightwatchBrowser, done: VoidFunction) {
        if (!poolApiKey) {
            console.error('[TestPoolLogin] E2E_POOL_API_KEY not set — cannot run pool test')
            return done()
        }

        // Pass the pool key + enableLogin in the hash so the auth plugin can use it.
        // No fake token injection — the real login flow will do the checkout.
        const url = `http://127.0.0.1:8080#e2e_pool_key=${poolApiKey}&e2e_feature_groups=ai-pro&invite=${INVITE_CODE}`
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
    'look at the beta invite system #group1': function (browser: NightwatchBrowser) {
        browser
            // Wait for the BetaJoinModal's "Sign In" button and click it
            .waitForElementVisible('*[data-id="invite-sign-in-btn"]', 15000)
            .click('*[data-id="invite-sign-in-btn"]')
            .pause(2000)
    },


    'Should login via the test pool through the real UI flow #group1': function (browser: NightwatchBrowser) {
        browser
            .pause(3000)
            // The modal should detect the e2e_pool_key and show the "E2E Test Pool" button
            .waitForElementVisible({
                selector: '//button[contains(., "E2E Test Pool")]',
                locateStrategy: 'xpath',
                timeout: 15000
            })
            // Click the test pool login button — this triggers a real pool checkout
            .click({
                selector: '//button[contains(., "E2E Test Pool")]',
                locateStrategy: 'xpath'
            })
            // Wait for the login to complete (modal closes, tokens get stored)
            .pause(5000)
    },

    'Should click Join Beta on the invite modal #group1': function (browser: NightwatchBrowser) {
        browser
            // Wait for the "Join the Beta" button in the BetaJoinModal
            .waitForElementVisible('*[data-id="invite-join-beta-btn"]', 15000)
            .click('*[data-id="invite-join-beta-btn"]')
            // After redeem succeeds, the BetaJoinModal closes
            .waitForElementNotPresent('*[data-id="invite-join-beta-btn"]', 15000)
            .pause(3000)
    },

    'Should show the user as logged in with test provider #group1': function (browser: NightwatchBrowser) {
        browser
            .execute(function () {
                const user = localStorage.getItem('remix_user')
                if (user) {
                    try {
                        const parsed = JSON.parse(user)
                        return { email: parsed.email, name: parsed.name, provider: parsed.provider }
                    } catch (e) {
                        return null
                    }
                }
                return null
            }, [], function (result: any) {
                const user = result.value
                browser
                    .assert.ok(user !== null, 'User data is parseable')
                    .assert.ok(user.email && user.email.includes('@'), 'User has a valid email')
                    .assert.equal(user.provider, 'test', 'Provider is "test"')
                console.log(`[TestPoolLogin] Logged in as: ${user.name} (${user.email})`)
            })
    },

    'Should show BETA tag on user menu button #group1': function (browser: NightwatchBrowser) {
        browser
            .waitForElementVisible('*[data-id="user-menu-compact"]', 10000)
            .click('*[data-id="user-menu-compact"]')
            .waitForElementVisible('*[data-id="feature-badge-name-e2e-beta"]', 10000)
    },
    'refresh and there should not be an invite modal #group1': function (browser: NightwatchBrowser) {
        browser
            .refreshPage()
            .pause(3000)
            .assert.not.elementPresent('*[data-id="invite-sign-in-btn"]', 'Invite modal should not reappear after refresh')
    },

    // ─── Group 2: invite token in URL — defer / dismiss behaviour ───────────────

    'should show the invite modal when arriving with invite token in URL #group2': function (browser: NightwatchBrowser) {
        browser
            .waitForElementVisible('*[data-id="invite-sign-in-btn"]', 15000)
    },

    'should dismiss with I will do this later and close the modal #group2': function (browser: NightwatchBrowser) {
        browser
            .waitForElementVisible('*[data-id="invite-later-btn"]', 15000)
            .click('*[data-id="invite-later-btn"]')
            .waitForElementNotPresent('.invite-overlay', 5000)
    },

    'should reappear after page reload when later was chosen #group2': function (browser: NightwatchBrowser) {
        browser
            // Reload — the invite token is still in sessionStorage so the modal must come back
            .refreshPage()
            .waitForElementVisible('*[data-id="invite-sign-in-btn"]', 15000)
    },

    'should dismiss forever with do not show me again #group2': function (browser: NightwatchBrowser) {
        browser
            .waitForElementVisible('*[data-id="invite-never-btn"]', 15000)
            .click('*[data-id="invite-never-btn"]')
            .waitForElementNotPresent('.invite-overlay', 5000)
            // Reload — the modal must NOT reappear
            .refreshPage()
            .pause(5000)
            .assert.not.elementPresent('*[data-id="invite-sign-in-btn"]')
    }
}
