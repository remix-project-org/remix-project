'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'
import { releaseAccount } from '../helpers/pool'

require('dotenv').config()

const poolApiKey = process.env.E2E_POOL_API_KEY || ''
const INVITE_CODE = process.env.E2E_INVITE_CODE || 'IF0FQCY7'

/**
 * Per-group setup. The invite IF0FQCY7 grants the [e2e]-starter-with-quotas
 * feature group on redeem; each variant pre-seeds the user with a different
 * starting set of feature groups so we cover the three combinations:
 *
 *   group1: no pre-seeded groups        → after invite: just starter
 *   group2: pre-seeded free-with-quotas → after invite: free-with-quotas + starter (additive)
 *   group3: pre-seeded "free"           → after invite: starter only           (overwritten)
 */
const GROUP_CONFIG: Record<string, { featureGroups: string; expectedBadges: number }> = {
    group1: { featureGroups: '', expectedBadges: 1 },
    group2: { featureGroups: 'e2e-free-with-quotas', expectedBadges: 2 },
    group3: { featureGroups: 'free', expectedBadges: 1 }
}

function detectGroup(browser: NightwatchBrowser): 'group1' | 'group2' | 'group3' {
    const mod = (browser as any).currentTest?.module || ''
    if (mod.includes('group2')) return 'group2'
    if (mod.includes('group3')) return 'group3'
    return 'group1'
}

// ─── Shared step bodies (assigned to multiple group-tagged keys below) ─────

const stepShowSignIn = function (browser: NightwatchBrowser) {
    browser
        // The invite overlay also renders the shared LoginButton, but so does
        // the top bar — scope strictly to the one inside the overlay so we
        // don't try to click the (covered) top-bar button.
        .waitForElementVisible('.invite-overlay [data-id="login-button"]', 15000)
        // The "Activate Invite" button must NOT be present yet.
        .waitForElementNotPresent('*[data-id="invite-activate-btn"]', 2000)
        .click('.invite-overlay [data-id="login-button"]')
        .pause(2000)
}

const stepLoginViaPool = function (browser: NightwatchBrowser) {
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
}

const stepShowActivate = function (browser: NightwatchBrowser) {
    browser
        .waitForElementVisible('*[data-id="invite-activate-btn"]', 15000)
        .waitForElementNotPresent('*[data-id="login-button"]', 5000)
}

const stepActivateAndDismiss = function (browser: NightwatchBrowser) {
    browser
        .click('*[data-id="invite-activate-btn"]')
        .waitForElementVisible('*[data-id="invite-get-started-btn"]', 15000)
        .click('*[data-id="invite-get-started-btn"]')
        .waitForElementNotPresent('.invite-overlay', 10000)
}

const stepVerifyLoggedIn = function (browser: NightwatchBrowser) {
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
}

/**
 * Open the user menu and assert the badge count matches the expected
 * number for the current group. Proves refreshPermissions propagated
 * the post-redeem feature_groups into the UI without a page reload.
 */
const stepAssertBadges = function (browser: NightwatchBrowser) {
    const group = detectGroup(browser)
    const expected = GROUP_CONFIG[group].expectedBadges

    browser
        .waitForElementVisible('*[data-id="user-menu-compact"]', 10000)
        .click('*[data-id="user-menu-compact"]')
        // At least one badge must be visible before counting.
        .waitForElementVisible({
            selector: '//*[starts-with(@data-id, "feature-badge-name-")]',
            locateStrategy: 'xpath',
            timeout: 10000
        })
        .elements('xpath', '//*[starts-with(@data-id, "feature-badge-name-")]', function (result: any) {
            const count = Array.isArray(result.value) ? result.value.length : 0
            console.log(`[InviteTest:${group}] Feature badges visible: ${count} (expected ${expected})`)
            browser.assert.equal(
                count,
                expected,
                `Expected ${expected} feature badge(s) for ${group}, got ${count}`
            )
        })
}

const test = {
    '@disabled': true,

    before: function (browser: NightwatchBrowser, done: VoidFunction) {
        if (!poolApiKey) {
            console.error('[TestPoolLogin] E2E_POOL_API_KEY not set — cannot run pool test')
            return done()
        }

        const group = detectGroup(browser)
        const { featureGroups } = GROUP_CONFIG[group]

        let url = `http://127.0.0.1:8080#e2e_pool_key=${poolApiKey}`
        if (featureGroups) url += `&e2e_feature_groups=${featureGroups}`
        url += `&invite=${INVITE_CODE}`

        console.log(`[TestPoolLogin] ${group} URL: ${url}`)
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
                console.log(`[TestPoolLogin] Releasing pool session: ${session.sessionId}`)
                await releaseAccount(session.sessionId)
            }
        } catch (err: any) {
            console.error(`[TestPoolLogin] Release failed: ${err.message}`)
        }
        browser.end()
        done()
    },

    // ─── group1: no pre-seeded groups → invite grants starter only ──────────
    'Should show the default invite modal with a Sign In button when unauthenticated #group1': stepShowSignIn,
    'Should login via the test pool through the real UI flow #group1': stepLoginViaPool,
    'Should show the invite modal with the Activate Invite button after login #group1': stepShowActivate,
    'Should activate the invite and dismiss the success modal #group1': stepActivateAndDismiss,
    'Should show the user as logged in with test provider #group1': stepVerifyLoggedIn,
    'Should reflect the new plan/feature group without a page reload #group1': stepAssertBadges,

    // ─── group2: pre-seeded free-with-quotas → invite ADDS starter (2 badges) ──
    'Should show the default invite modal with a Sign In button when unauthenticated #group2': stepShowSignIn,
    'Should login via the test pool through the real UI flow #group2': stepLoginViaPool,
    'Should show the invite modal with the Activate Invite button after login #group2': stepShowActivate,
    'Should activate the invite and dismiss the success modal #group2': stepActivateAndDismiss,
    'Should show the user as logged in with test provider #group2': stepVerifyLoggedIn,
    'Should reflect both pre-seeded and invite-granted feature groups #group2': stepAssertBadges,

    // ─── group3: pre-seeded "free" → invite OVERWRITES to starter (1 badge) ──
    'Should show the default invite modal with a Sign In button when unauthenticated #group3': stepShowSignIn,
    'Should login via the test pool through the real UI flow #group3': stepLoginViaPool,
    'Should show the invite modal with the Activate Invite button after login #group3': stepShowActivate,
    'Should activate the invite and dismiss the success modal #group3': stepActivateAndDismiss,
    'Should show the user as logged in with test provider #group3': stepVerifyLoggedIn,
    'Should overwrite the pre-seeded free group with the invite-granted group #group3': stepAssertBadges
}

// module.exports = test
module.exports = {}