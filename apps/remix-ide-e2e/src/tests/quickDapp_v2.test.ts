'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'
import { releaseAccount } from '../helpers/pool'

require('dotenv').config()

const poolApiKey = process.env.E2E_POOL_API_KEY || ''

type QuickDappFlowState = {
  streaming: string
  assistantText: string
  workspaceName: string
  hasDashboard: boolean
  hasEditor: boolean
  hasCard: boolean
  hasProcessingOverlay: boolean
  statusText: string
  approvalCount: number
  hasApproveAll: boolean
  hasAutoAcceptBanner: boolean
}

type QuickDappFlowResult = {
  sawProcessing: boolean
  sawApproval: boolean
  sawAutoAccept: boolean
  finalState: QuickDappFlowState
}

const DESIGN_ANSWER = [
  'Create the simplest possible standard React DApp for this Storage contract.',
  'Use one plain page only: show the stored value, one number input, a Store button, and a Retrieve button.',
  'Use minimal default styling. No animations, no extra pages, no extra components, no logo, no images, and no custom design system.',
  'No Figma design URL or token. Do not make it a Base Mini App.',
  'Please generate the minimal DApp now.'
].join(' ')

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function execInBrowser<T> (
  browser: NightwatchBrowser,
  fn: (...args: any[]) => T,
  args: any[] = []
): Promise<T> {
  return new Promise((resolve) => {
    browser.execute(fn, args, (result: any) => resolve(result?.value as T))
  })
}

async function sendAssistantMessage (browser: NightwatchBrowser, message: string): Promise<void> {
  const sent = await execInBrowser<boolean>(browser, function (prompt: string) {
    const chat = (window as any).remixAIChat?.current
    if (!chat) return false
    chat.sendChat(prompt)
    return true
  }, [message])
  browser.assert.ok(sent, 'AI assistant chat ref is available')
}

async function getQuickDappFlowState (browser: NightwatchBrowser): Promise<QuickDappFlowState> {
  return execInBrowser<QuickDappFlowState>(browser, function () {
    const textOf = (selector: string) => {
      const el = document.querySelector(selector)
      return el?.textContent?.trim() || ''
    }
    const textOfAll = (selector: string) => Array.from(document.querySelectorAll(selector))
      .map((el) => el.textContent?.trim() || '')
      .join(' ')
    const assistantText = Array.from(document.querySelectorAll('.chat-bubble.bubble-assistant'))
      .map((el) => el.textContent || '')
      .join('\n')

    return {
      streaming: document.querySelector('[data-id="remix-ai-streaming"]')?.getAttribute('data-streaming') || 'missing',
      assistantText,
      workspaceName: textOf('[data-id="editor-workspace-name"]'),
      hasDashboard: !!document.querySelector('[data-id="quick-dapp-dashboard"]'),
      hasEditor: !!document.querySelector('[data-id="back-to-dashboard-btn"]'),
      hasCard: !!document.querySelector('div.card[data-id^="dapp-card-"]'),
      hasProcessingOverlay: !!document.querySelector('.qd-progress-overlay--card, [data-id="ai-updating-overlay"]'),
      statusText: textOfAll('[data-id^="dapp-status-"]').toLowerCase(),
      approvalCount: document.querySelectorAll('.tool-approval-card').length,
      hasApproveAll: !!document.querySelector('[data-id="approve-all-changes"]'),
      hasAutoAcceptBanner: !!document.querySelector('[data-id="hitl-auto-accept-banner"]')
    }
  })
}

async function approvePendingHitl (browser: NightwatchBrowser, enableAutoAccept: boolean): Promise<'none' | 'single' | 'all'> {
  return execInBrowser<'none' | 'single' | 'all'>(browser, function (shouldEnableAutoAccept: boolean) {
    const approveAll = document.querySelector('[data-id="approve-all-changes"]') as HTMLButtonElement | null
    if (approveAll) {
      approveAll.click()
      return 'all'
    }

    const card = document.querySelector('.tool-approval-card') as HTMLElement | null
    if (!card) return 'none'

    const checkbox = card.querySelector('[data-id="hitl-auto-accept-checkbox"]') as HTMLInputElement | null
    if (shouldEnableAutoAccept && checkbox && !checkbox.checked) {
      checkbox.click()
    }

    const approveButton = Array.from(card.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Approve') as HTMLButtonElement | undefined
    if (!approveButton) return 'none'

    approveButton.click()
    return 'single'
  }, [enableAutoAccept])
}

async function waitForAssistantIdle (browser: NightwatchBrowser, timeout = 120000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const state = await getQuickDappFlowState(browser)
    if (state.streaming === 'false') return
    await delay(1000)
  }
  browser.assert.fail('AI assistant did not become idle before timeout')
}

async function driveQuickDappGeneration (browser: NightwatchBrowser): Promise<QuickDappFlowResult> {
  await waitForAssistantIdle(browser)
  const firstQuestion = await getQuickDappFlowState(browser)
  const firstQuestionText = firstQuestion.assistantText.toLowerCase()
  await sendAssistantMessage(browser, DESIGN_ANSWER)

  let sawProcessing = false
  let sawApproval = false
  let sawAutoAccept = false
  let answeredFigma = firstQuestionText.includes('figma')
  let answeredBase = firstQuestionText.includes('base mini')
  let answeredProceed = false
  let finalState = await getQuickDappFlowState(browser)
  const start = Date.now()
  const timeout = 8 * 60 * 1000

  while (Date.now() - start < timeout) {
    const state = await getQuickDappFlowState(browser)
    finalState = state

    if (state.hasCard && (state.hasProcessingOverlay || state.statusText.includes('creating'))) {
      sawProcessing = true
    }
    if (state.hasAutoAcceptBanner) {
      sawAutoAccept = true
    }

    if (state.approvalCount > 0 || state.hasApproveAll) {
      const approved = await approvePendingHitl(browser, !sawAutoAccept)
      if (approved === 'all') {
        sawApproval = true
      } else if (approved === 'single') {
        sawApproval = true
        sawAutoAccept = true
      }
      await delay(1500)
      continue
    }

    if (state.streaming === 'false') {
      const lowerAssistantText = state.assistantText.toLowerCase()
      const generationStarted =
        state.hasCard ||
        state.hasProcessingOverlay ||
        state.statusText.includes('creating') ||
        lowerAssistantText.includes('generate_dapp') ||
        lowerAssistantText.includes('finalize_dapp_generation')

      if (!generationStarted && !answeredFigma && lowerAssistantText.includes('figma')) {
        answeredFigma = true
        await sendAssistantMessage(browser, 'No Figma design URL or token. Continue with the simplest possible DApp.')
        await delay(1000)
        continue
      }
      if (!generationStarted && !answeredBase && lowerAssistantText.includes('base mini')) {
        answeredBase = true
        await sendAssistantMessage(browser, 'No. Create a standard minimal React DApp.')
        await delay(1000)
        continue
      }
      if (
        !generationStarted &&
        !answeredProceed &&
        (lowerAssistantText.includes('shall i') ||
          lowerAssistantText.includes('should i') ||
          lowerAssistantText.includes('proceed') ||
          lowerAssistantText.includes('confirm'))
      ) {
        answeredProceed = true
        await sendAssistantMessage(browser, 'Yes. Generate the simplest possible DApp now.')
        await delay(1000)
        continue
      }
    }

    if (state.hasEditor && state.streaming === 'false' && state.approvalCount === 0 && !state.hasProcessingOverlay) {
      return {
        sawProcessing,
        sawApproval,
        sawAutoAccept,
        finalState: state
      }
    }

    await delay(2000)
  }

  browser.assert.fail(`QuickDapp generation did not finish. Last state: ${JSON.stringify(finalState)}`)
  return { sawProcessing, sawApproval, sawAutoAccept, finalState }
}

module.exports = {}

const tests = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    if (!poolApiKey) {
      console.error('[QuickDappV2] E2E_POOL_API_KEY not set — cannot run pool test')
      return done()
    }
    const url = `http://127.0.0.1:8080#e2e_pool_key=${poolApiKey}&e2e_feature_groups=beta`
    init(browser, done, url, true)
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
        console.log(`[QuickDappV2] Releasing pool session: ${session.sessionId}`)
        await releaseAccount(session.sessionId)
      }
    } catch (err: any) {
      console.error(`[QuickDappV2] Release failed: ${err.message}`)
    }
    browser.end()
    done()
  },

  '@sources': function () {
    return sources
  },

  'Should login, compile, deploy, and prepare AI assistant #group1': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        localStorage.setItem('enableLogin', 'true')
        localStorage.removeItem('remix_hitl_auto_accept')
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
      .waitForElementPresent('*[data-id="remixIdeSidePanel"]')
      .clickLaunchIcon('filePanel')
      .addFile('Storage.sol', sources[0]['Storage.sol'])
      .clickLaunchIcon('solidity')
      .waitForElementVisible('*[data-id="compilerContainerCompileBtn"]')
      .click('*[data-id="compilerContainerCompileBtn"]')
      .waitForElementPresent('*[data-id="compiledContracts"] option', 60000)
      .clickLaunchIcon('remixaiassistant')
      .assistantWaitForReady()
      .assistantSetProvider('anthropic')
      .assistantClearChat()
      .clickLaunchIcon('udapp')
      .waitForElementVisible('*[data-id="deployButton"]', 45000)
      .click('*[data-id="deployButton"]')
      .waitForElementPresent('[data-id="deployedContractItem-0"]', 60000)
  },

  'Should request a DApp through AI, answer design questions, and approve HITL writes #group1': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="contractKebabIcon-0"]')
      .waitForElementVisible('*[data-id="createDapp"]', 10000)
      .click('*[data-id="createDapp"]')
      .assistantWaitForReady()
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//div[contains(@class,"chat-bubble") and contains(@class,"bubble-assistant") and (contains(translate(.,"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz"),"design") or contains(translate(.,"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz"),"look") or contains(translate(.,"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz"),"theme") or contains(translate(.,"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz"),"figma"))]',
        timeout: 120000
      })
      .perform(async (done) => {
        const result = await driveQuickDappGeneration(browser)
        browser.assert.ok(result.sawProcessing, 'QuickDapp card entered creating/processing state')
        browser.assert.ok(result.sawApproval || result.sawAutoAccept, 'HITL approval path was handled')
        browser.assert.ok(result.finalState.hasEditor, 'QuickDapp editor opened after finalization')
        done()
      })
  },

  'Should show generated DApp editor and created status #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="back-to-dashboard-btn"]', 300000)
      .waitForElementVisible('*[data-id="editor-dapp-title"]', 30000)
      .waitForElementVisible('*[data-id="editor-workspace-name"]', 30000)
      .waitForElementVisible('*[data-id="dapp-preview-iframe"]', 120000)
      .execute(function () {
        const workspaceName = document.querySelector('[data-id="editor-workspace-name"]')?.textContent?.trim() || ''
        ;(window as any).__quickDappV2E2EWorkspaceName = workspaceName
        return workspaceName
      }, [], function (result: any) {
        browser.assert.ok(!!result.value, 'Generated DApp workspace name is visible in the editor')
      })
      .waitForElementNotPresent('*[data-id="ai-updating-overlay"]', 60000)
      .executeAsync(function (done) {
        const workspaceName = ((window as any).__quickDappV2E2EWorkspaceName || '').trim()
        const aiPlugin = (window as any).getRemixAIPlugin

        if (!workspaceName || !aiPlugin) {
          done({ error: 'Missing generated workspace name or AI plugin' })
          return
        }

        aiPlugin.call('filePanel', 'readFileFromWorkspace', workspaceName, 'dapp.config.json')
          .then(function (content: string) {
            const config = JSON.parse(content)
            done({
              status: config.status,
              workspaceName
            })
          })
          .catch(function (error: any) {
            done({ error: error?.message || String(error) })
          })
      }, [], function (result: any) {
        const data = result.value || {}
        browser.assert.ok(!data.error, `dapp.config.json was read${data.error ? `: ${data.error}` : ''}`)
        browser.assert.equal(data.status, 'created', 'dapp.config.json status is created')
      })
  },

  'Should verify generated workspace files exist #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="back-to-dashboard-btn"]', 30000)
      .executeAsync(function (done) {
        const workspaceName = ((window as any).__quickDappV2E2EWorkspaceName || '').trim()
        const aiPlugin = (window as any).getRemixAIPlugin
        const expectedFiles = [
          'dapp.config.json',
          'index.html',
          'src/main.jsx',
          'src/App.jsx',
          'src/index.css'
        ]

        if (!workspaceName || !aiPlugin) {
          done({ error: 'Missing generated workspace name or AI plugin' })
          return
        }

        Promise.all(expectedFiles.map(function (path) {
          return aiPlugin.call('filePanel', 'existsInWorkspace', workspaceName, path)
            .then(function (exists: boolean) {
              return { path, exists }
            })
        }))
          .then(function (results: Array<{ path: string, exists: boolean }>) {
            done({
              workspaceName,
              missingFiles: results.filter(function (result) { return !result.exists }).map(function (result) { return result.path })
            })
          })
          .catch(function (error: any) {
            done({ error: error?.message || String(error) })
          })
      }, [], function (result: any) {
        const data = result.value || {}
        browser.assert.ok(!!data.workspaceName, 'Generated workspace name is stored for file checks')
        browser.assert.ok(!data.error, `Generated files were checked${data.error ? `: ${data.error}` : ''}`)
        browser.assert.ok(
          Array.isArray(data.missingFiles) && data.missingFiles.length === 0,
          `Generated workspace ${data.workspaceName} contains expected files`
        )
      })
  }
}

const sources = [
  {
    'Storage.sol': {
      content:
        `
      // SPDX-License-Identifier: GPL-3.0
      pragma solidity >=0.8.2 <0.9.0;

      /**
       * @title Storage
       * @dev Store & retrieve value in a variable
       */
      contract Storage {
          uint256 number;

          /**
           * @dev Store value in variable
           * @param num value to store
           */
          function store(uint256 num) public {
              number = num;
          }

          /**
           * @dev Return value
           * @return value of 'number'
           */
          function retrieve() public view returns (uint256){
              return number;
          }
      }`
    }
  }
]
