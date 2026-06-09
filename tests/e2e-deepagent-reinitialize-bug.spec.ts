import { test, expect } from './helpers/e2e-pool'

test.use({ viewport: { width: 1440, height: 900 } })

/**
 * Regression test for a previously-permanent DeepAgent disable bug.
 *
 * `DeepAgentManager.reinitialize()` used to dereference
 * `plugin.selectedModel.provider` without a null-guard. If anything triggered
 * `reinitialize()` while `selectedModel` was transiently null (e.g. an
 * auth-state change racing with the model picker), the resulting TypeError was
 * swallowed by the catch block, which then hard-set `plugin.deepAgentEnabled = false`
 * and `plugin.deepAgentInferencer = null` — permanently, until the page reloaded.
 *
 * Fix: `reinitialize()` now also requires `selectedModel` + `selectedModelId`
 * before proceeding, and a missing model is a benign no-op instead of a crash.
 */
test('reinitialize() with null selectedModel is a no-op and leaves DeepAgent enabled', async ({ page }) => {
  test.setTimeout(120_000)

  const poolApiKey = process.env.E2E_POOL_API_KEY || process.env.E2E_POOL_KEY
  if (!poolApiKey) {
    throw new Error('Missing E2E pool key. Set E2E_POOL_API_KEY (or E2E_POOL_KEY) before running.')
  }

  const url = `http://localhost:8080/?#e2e_feature_groups=e2e-free-with-quotas&e2e_pool_key=${encodeURIComponent(poolApiKey)}&lang=en`
  await page.goto(url)

  // Sign in so /permissions resolves and DeepAgent actually initializes.
  await page.locator('[data-id="topbarSignInButton"]').click()
  await page.locator('[data-id="loginModalE2EPoolButton"]').click()
  await expect(page.locator('[data-id="user-menu-compact"]').first()).toBeVisible({ timeout: 30000 })

  // Open the AI panel so the plugin is fully activated.
  await page.locator('[data-id="verticalIconsKindremixaiassistant"]').click()

  // Wait for the plugin handle to exist on window.
  await page.waitForFunction(() => !!(window as any).getRemixAIPlugin, null, { timeout: 30000 })

  // Wait until DeepAgent has finished its first successful init.
  await page.waitForFunction(
    () => {
      const p = (window as any).getRemixAIPlugin
      return !!(p && p.deepAgentEnabled === true && p.deepAgentInferencer)
    },
    null,
    { timeout: 30000 }
  )

  // Snapshot the "before" state, then force the race: clear selectedModel and
  // call reinitialize() directly. With the null-guard in place, reinitialize()
  // should detect the missing model, emit a `:enter` trace with `willProceed=false`,
  // and leave DeepAgent state untouched. No `:failed` trace should appear.
  const result = await page.evaluate(async () => {
    const plugin: any = (window as any).getRemixAIPlugin
    const before = {
      enabled: !!plugin.deepAgentEnabled,
      hasInferencer: !!plugin.deepAgentInferencer,
      selectedModelId: plugin.selectedModelId,
      selectedProvider: plugin.selectedModel?.provider ?? null
    }

    const originalInferencer = plugin.deepAgentInferencer

    const traces: Array<{ event: string; details: any }> = []
    const originalTrace = plugin.traceDeepAgentLifecycle?.bind(plugin)
    plugin.traceDeepAgentLifecycle = (event: string, _msg: string, details: any) => {
      traces.push({ event, details })
      try { originalTrace?.(event, _msg, details) } catch (_) { /* ignore */ }
    }

    plugin.selectedModel = null
    plugin.selectedModelId = ''
    let escapedError: string | null = null
    try {
      await plugin.deepAgentManager.reinitialize()
    } catch (err: any) {
      escapedError = err?.message || String(err)
    }

    if (originalTrace) plugin.traceDeepAgentLifecycle = originalTrace

    const after = {
      enabled: !!plugin.deepAgentEnabled,
      hasInferencer: !!plugin.deepAgentInferencer,
      sameInferencer: plugin.deepAgentInferencer === originalInferencer
    }

    return { before, after, traces, escapedError }
  })

  console.log('[reinit-fix] before:', JSON.stringify(result.before))
  console.log('[reinit-fix] after :', JSON.stringify(result.after))
  console.log('[reinit-fix] escaped error:', result.escapedError)
  console.log('[reinit-fix] traces:')
  for (const t of result.traces) {
    console.log('  ', t.event, JSON.stringify(t.details))
  }

  // Sanity: started from a healthy DeepAgent.
  expect(result.before.enabled).toBe(true)
  expect(result.before.hasInferencer).toBe(true)

  // Nothing should escape reinitialize().
  expect(result.escapedError).toBeNull()

  // No failure trace.
  const failedTrace = result.traces.find(t => t.event === 'manager.reinitialize:failed')
  expect(failedTrace, 'reinitialize() should not throw when selectedModel is null').toBeUndefined()

  // Enter trace marks the call as a no-op.
  const enterTrace = result.traces.find(t => t.event === 'manager.reinitialize:enter')
  expect(enterTrace, 'reinitialize() should still emit an :enter trace').toBeTruthy()
  expect(enterTrace?.details?.willProceed, 'willProceed must be false when selectedModel is null').toBe(false)
  expect(enterTrace?.details?.hasSelectedModel, 'hasSelectedModel must be reported as false').toBe(false)

  // DeepAgent state is intact.
  expect(result.after.enabled).toBe(true)
  expect(result.after.hasInferencer).toBe(true)
  expect(result.after.sameInferencer, 'existing DeepAgent inferencer must not be replaced or torn down').toBe(true)
})
