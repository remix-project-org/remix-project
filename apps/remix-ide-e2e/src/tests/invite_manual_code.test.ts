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
            console.error('[InviteManualCode] E2E_POOL_API_KEY not set — cannot run pool test')
            return done()
        }

        // No invite= in the URL — this test enters the code manually via the login modal
        const url = `http://127.0.0.1:8080#e2e_pool_key=${poolApiKey}&e2e_feature_groups=ai-pro`
        init(browser, done, url, false, null, true, false)
    },

    after: async function (browser: NightwatchBrowser, done: VoidFunction) {
        try {
            const result: any = await new Promise((resolve) => {
                browser.execute(function () {
                    return sessionStorage.getItem('remix_pool_session')
                }, [], (res: any) => resolve(res))
            })

            if (result && result.value) {
                const session = JSON.parse(result.value)
                console.log(`[InviteManualCode] Releasing pool session: ${session.sessionId}`)
                await releaseAccount(session.sessionId)
            }
        } catch (err: any) {
            console.error(`[InviteManualCode] Release failed: ${err.message}`)
        }
        browser.end()
        done()
    },

    'Should click Sign In to open login modal #group1': function (browser: NightwatchBrowser) {
        browser
            // No invite in URL, so no invite overlay — just the normal IDE with a Sign In button
            .waitForElementVisible('*[data-id="login-button"]', 30000)
            .click('*[data-id="login-button"]')
            .pause(2000)
    },

    'Should show login modal with "I have an invite code" button #group1': function (browser: NightwatchBrowser) {
        browser
            // The login modal should now be open with the invite code toggle
            .waitForElementVisible('*[data-id="invite-code-toggle-btn"]', 15000)
    },

    'Should enter invite code and submit #group1': function (browser: NightwatchBrowser) {
        browser
            // Click the "I have an invite code" button to reveal the input
            .click('*[data-id="invite-code-toggle-btn"]')
            .waitForElementVisible('*[data-id="invite-code-input"]', 5000)
            // Type the invite code
            .setValue('*[data-id="invite-code-input"]', INVITE_CODE)
            .pause(500)
            // Click Apply — this closes the login modal and triggers invitationManager.showInvite
            .click('*[data-id="invite-code-apply-btn"]')
            .pause(2000)
    },

    'Should show invite overlay and click Sign In #group1': function (browser: NightwatchBrowser) {
        browser
            // The invite overlay should now be visible with a Sign In / login button
            .waitForElementVisible({
                selector: '//div[contains(@class, "invite-modal-right-footer")]//button[@data-id="login-button"]',
                locateStrategy: 'xpath',
                timeout: 15000
            })
            .click({
                selector: '//div[contains(@class, "invite-modal-right-footer")]//button[@data-id="login-button"]',
                locateStrategy: 'xpath'
            })
            .pause(2000)
    },

    'Should login via the test pool #group1': function (browser: NightwatchBrowser) {
        browser
            .pause(3000)
            .waitForElementVisible({
                selector: '//button[contains(., "E2E Test Pool")]',
                locateStrategy: 'xpath',
                timeout: 15000
            })
            .click({
                selector: '//button[contains(., "E2E Test Pool")]',
                locateStrategy: 'xpath'
            })
            .pause(5000)
    },

    'Should click Join Beta on the invite modal #group1': function (browser: NightwatchBrowser) {
        browser
            .waitForElementVisible('*[data-id="invite-join-beta-btn"]', 15000)
            .click('*[data-id="invite-join-beta-btn"]')
            .waitForElementVisible('*[data-id="invite-get-started-btn"]', 15000)
            .click('*[data-id="invite-get-started-btn"]')
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
                console.log(`[InviteManualCode] Logged in as: ${user.name} (${user.email})`)
            })
    },

    // 'Should show BETA tag on user menu button #group1': function (browser: NightwatchBrowser) {
    //     browser
    //         .waitForElementVisible('*[data-id="user-menu-compact"]', 10000)
    //         .click('*[data-id="user-menu-compact"]')
    //         .waitForElementVisible('*[data-id="feature-badge-name-e2e-beta"]', 10000)
    // },
}
