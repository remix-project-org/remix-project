import { test, expect } from '@playwright/test'
import { build } from 'esbuild'

let bundle: string

test.beforeAll(async () => {
  // Mount the real controls and step manager without unrelated IDE plugins.
  const modules = {
    '@remix-project/remix-lib': `import { findLowerBound } from './libs/remix-lib/src/util'; export const util = { findLowerBound }; export const hash = {}`,
    '@remix-api': 'export const Features = {}',
    '@remix-ide/tracking': `import React from 'react'; export const TrackingContext = React.createContext({})`,
    '@remix-ui/app': `import React from 'react'; export const AppContext = React.createContext({ appStateDispatch() {} }); export const useAuth = () => ({}); export const appActionTypes = {}`,
    '@remix-ui/helper': `export const CustomTooltip = ({ children }) => children; export const isQuickDappRemixVMIdentifier = () => false; export const normalizeQuickDappEnvironment = value => value`,
    '@remix-ui/quick-dapp-v2': 'export const QuickDappContractSelector = () => null'
  }
  bundle = (await build({
    bundle: true, write: false, platform: 'browser', format: 'iife', loader: { '.css': 'empty' },
    plugins: [{
      name: 'control-fixture',
      setup(plugin) {
        plugin.onResolve({ filter: /^@remix/ }, args => modules[args.path] ? { path: args.path, namespace: 'fixture' } : undefined)
        plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: modules[args.path], resolveDir: process.cwd(), loader: 'js' }))
      }
    }],
    stdin: {
      resolveDir: process.cwd(), loader: 'tsx', contents: `
        import React from 'react'
        import { createRoot } from 'react-dom/client'
        import { BottomBar } from './apps/remix-ide/src/app/components/bottom-bar'
        import { DebuggerStepManager } from './libs/remix-debug/src/debugger/stepManager'
        import { EventManager } from './libs/remix-debug/src/eventManager'

        const events = new Map()
        const plugin = {
          on: (name, event, callback) => events.set(name + ':' + event, callback),
          off: (name, event) => events.delete(name + ':' + event),
          call: async (name, method) => method === 'currentFocus' ? 'debugger' : ''
        }
        const traceManager = {
          isLoaded: () => true,
          inRange: step => step >= 0 && step < 10,
          getLength: callback => callback(null, 10),
          findStepOut: step => step,
          findStepOverBack: step => step - 1,
          findStepOverForward: step => step + 1,
          buildCallPath: async () => [{}]
        }
        const stepManager = new DebuggerStepManager({
          event: new EventManager(),
          callTree: { event: new EventManager(), reducedTrace: [0, 3, 6, 9] }
        }, traceManager)
        stepManager.traceLength = 10
        const moves = []
        const fixture = {
          ready: () => events.has('debugger:debuggingStarted'),
          currentStep: () => stepManager.currentStepIndex,
          reset: () => stepManager.jumpTo(3),
          moves,
          setOpcodes: value => events.get('debugger:showOpcodesChanged')(value),
          async start(showOpcodes) {
            const controls = { showOpcodes, traceLength: 10, registerEvent: stepManager.event.register.bind(stepManager.event) }
            for (const name of ['stepIntoForward', 'stepIntoBack', 'stepOverForward', 'stepOverBack']) {
              controls[name] = mode => { moves.push({ name, mode }); stepManager[name](mode) }
            }
            await events.get('debugger:debuggingStarted')({ stepManager: controls })
            stepManager.jumpTo(3)
          }
        }
        window.fixture = fixture
        createRoot(document.getElementById('root')).render(<BottomBar plugin={plugin} />)
      `
    }
  })).outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
  await page.setContent('<div id="root"></div>')
  await page.addScriptTag({ content: bundle })
  await page.waitForFunction(() => (window as any).fixture?.ready())
})

for (const scenario of [
  { name: 'source mode', showOpcodes: false, solidityMode: true, next: 6, previous: 0 },
  { name: 'opcode mode', showOpcodes: true, solidityMode: false, next: 4, previous: 2 },
  { name: 'default mode', showOpcodes: undefined, solidityMode: true, next: 6, previous: 0 }
]) {
  test(`bottom-bar controls use ${scenario.name}`, async ({ page }) => {
    await page.evaluate(mode => (window as any).fixture.start(mode), scenario.showOpcodes)
    await page.locator('[data-id="btnStepInto"]').click()
    expect(await page.evaluate(() => (window as any).fixture.currentStep())).toBe(scenario.next)
    await page.evaluate(() => (window as any).fixture.reset())
    await page.locator('[data-id="btnStepBack"]').click()
    expect(await page.evaluate(() => (window as any).fixture.currentStep())).toBe(scenario.previous)
    await page.evaluate(() => (window as any).fixture.reset())
    await page.locator('[data-id="btnStepForward"]').click()
    await page.locator('[data-id="btnStepBackward"]').click()
    expect(await page.evaluate(() => (window as any).fixture.moves)).toEqual([
      { name: 'stepIntoForward', mode: scenario.solidityMode },
      { name: 'stepIntoBack', mode: scenario.solidityMode },
      { name: 'stepOverForward', mode: scenario.solidityMode },
      { name: 'stepOverBack', mode: scenario.solidityMode }
    ])
  })
}

test('changing Show Opcodes during debugging updates subsequent stepping', async ({ page }) => {
  await page.evaluate(() => (window as any).fixture.start(false))
  await page.evaluate(() => (window as any).fixture.setOpcodes(true))
  await page.locator('[data-id="btnStepInto"]').click()
  expect(await page.evaluate(() => (window as any).fixture.currentStep())).toBe(4)
  await page.evaluate(() => {
    (window as any).fixture.reset()
    ;(window as any).fixture.setOpcodes(false)
  })
  await page.locator('[data-id="btnStepInto"]').click()
  expect(await page.evaluate(() => (window as any).fixture.currentStep())).toBe(6)
})
