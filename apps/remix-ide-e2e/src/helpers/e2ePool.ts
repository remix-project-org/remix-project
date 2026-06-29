import { NightwatchBrowser } from 'nightwatch'
import init from './init'
import { releaseAccount } from './pool'

type LoadPlugin = {
  name: string
  url: string
}

export const poolApiKey = process.env.E2E_POOL_API_KEY || process.env.E2E_POOL_KEY || ''
export const unlimitedQuotaFeatureGroup = 'e2e-unlimited-quota'

export function getE2EPoolUrl (featureGroups = unlimitedQuotaFeatureGroup): string {
  return `http://127.0.0.1:8080#e2e_pool_key=${poolApiKey}&e2e_feature_groups=${featureGroups}`
}

export function initWithE2EPool (
  browser: NightwatchBrowser,
  done: VoidFunction,
  logLabel: string,
  featureGroups = unlimitedQuotaFeatureGroup,
  preloadPlugins = true,
  loadPlugin?: LoadPlugin,
  hideToolTips = true,
  showTerminal = true
): void {
  if (!poolApiKey) {
    console.error(`[${logLabel}] E2E_POOL_API_KEY or E2E_POOL_KEY not set - cannot run pool test`)
    return done()
  }

  init(browser, done, getE2EPoolUrl(featureGroups), preloadPlugins, loadPlugin, hideToolTips, showTerminal)
}

export function loginWithE2EPool (browser: NightwatchBrowser): void {
  browser
    .execute(function () {
      localStorage.setItem('enableLogin', 'true')
    })
    .refreshPage()
    .pause(5000)
    .waitForElementVisible('*[data-id="login-button"]', 15000)
    .click('*[data-id="login-button"]')
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

export async function releaseE2EPool (browser: NightwatchBrowser, done: VoidFunction, logLabel: string): Promise<void> {
  try {
    const result: any = await new Promise((resolve) => {
      browser.execute(function () {
        return sessionStorage.getItem('remix_pool_session')
      }, [], (response: any) => resolve(response))
    })

    if (result && result.value) {
      const session = JSON.parse(result.value)
      console.log(`[${logLabel}] Releasing pool session: ${session.sessionId}`)
      await releaseAccount(session.sessionId)
    }
  } catch (error: any) {
    console.error(`[${logLabel}] Release failed: ${error.message}`)
  }

  browser.end()
  done()
}