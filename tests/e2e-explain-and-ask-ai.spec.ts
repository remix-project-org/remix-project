import { test, expect } from './helpers/e2e-pool';

test.use({ viewport: { width: 1440, height: 900 } })

// DISABLED: Playwright E2E tests
/*
/**
 * Quota-tier user flow:
 *   1. Sign in via topbar (E2E Test Pool)
 *   2. Switch to Mistral Medium for faster runs
 *   3. Open contracts/1_Storage.sol
 *   4. Click "Explain contract" in the bottom bar → assert the assistant responds
 *//*
test('explain contract with AI', async ({ page }) => {
  test.setTimeout(300_000)
  const poolApiKey = process.env.E2E_POOL_API_KEY || process.env.E2E_POOL_KEY
  if (!poolApiKey) {
    throw new Error('Missing E2E pool key. Set E2E_POOL_API_KEY (or E2E_POOL_KEY) in your environment before running this test.')
  }

  const url = `http://localhost:8080/?#e2e_feature_groups=e2e-free-with-quotas&e2e_pool_key=${encodeURIComponent(poolApiKey)}&lang=en&optimize&runs=200&evmVersion&version=soljson-v0.8.34+commit.80d5c536.js`
  await page.goto(url);

  // --- 1. Sign in via topbar -------------------------------------------------
  await page.locator('[data-id="login-button"]').click();
  await page.locator('[data-id="loginModalE2EPoolButton"]').click();

  // Confirm we're signed in (topbar user menu shows pool label)
  await expect(page.locator('[data-id="user-menu-compact"]').first()).toBeVisible({ timeout: 30000 });

  // --- 2. Open contracts/1_Storage.sol via file explorer --------------------
  // (file panel is open by default — clicking the icon again would just close it)
  await page.locator('li[data-id="treeViewLitreeViewItemcontracts"]').click();
  await page.locator('li[data-id="treeViewLitreeViewItemcontracts/1_Storage.sol"]').click();
  // Editor is now showing the file — wait for bottom bar to recognize the extension
  await expect(page.locator('[data-id="bottomBarExplainBtn"]')).toBeVisible({ timeout: 10000 });

  // --- 3. Open AI panel and switch to Mistral Medium ------------------------
  await page.locator('[data-id="verticalIconsKindremixaiassistant"]').click();
  await page.locator('[data-id="ai-model-selector-btn"]').click();
  await page.locator('[data-id="ai-model-mistral-medium-latest"]').click();

  // Wait for the route to stabilise (badge leaves "initializing") before we
  // trigger any AI action — otherwise the prompt area is gated and the
  // first click can be silently no-op'd in CI.
  await expect(page.locator('[data-id="ai-route-status"]'))
    .toHaveAttribute('data-route', /agent|tools|chat/, { timeout: 30000 })

  // --- 4. Click "Explain contract" in the bottom bar ------------------------
  await page.locator('[data-id="bottomBarExplainBtn"]').click();

  // Assistant panel should open and respond. The landing screen disappears once
  // the first message is added, and an assistant bubble (.me-3) eventually appears.
  await expect(page.locator('[data-id="ai-assistant-landing"]')).toBeHidden({ timeout: 15000 });
  await expect(
    page.locator('[data-id="ai-response-chat-bubble-section"] [data-id="ai-user-chat-bubble"]').first()
  ).toBeVisible({ timeout: 90000 });
  // Sanity: the assistant bubble should actually contain text
  await expect.poll(
    async () => (await page.locator('[data-id="ai-response-chat-bubble-section"] [data-id="ai-user-chat-bubble"]').first().innerText()).trim().length,
    { timeout: 90000, intervals: [1000, 2000, 3000] }
  ).toBeGreaterThan(20)
});

/**
 * Quota-tier compile-error flow:
 *   1. Sign in via topbar (E2E Test Pool)
 *   2. Switch to Mistral Medium for faster runs
 *   3. Replace contracts/1_Storage.sol with a faulty contract
 *   4. Compile → error card appears with "Ask RemixAI" button
 *   5. Click "Ask RemixAI" → assert the assistant responds
 *//*
test('ask AI about a compile error', async ({ page }) => {
  test.setTimeout(240_000)
  const poolApiKey = process.env.E2E_POOL_API_KEY || process.env.E2E_POOL_KEY
  if (!poolApiKey) {
    throw new Error('Missing E2E pool key. Set E2E_POOL_API_KEY (or E2E_POOL_KEY) in your environment before running this test.')
  }

  const url = `http://localhost:8080/?#e2e_feature_groups=e2e-free-with-quotas&e2e_pool_key=${encodeURIComponent(poolApiKey)}&lang=en&optimize&runs=200&evmVersion&version=soljson-v0.8.34+commit.80d5c536.js`
  await page.goto(url);

  // --- 1. Sign in via topbar -------------------------------------------------
  await page.locator('[data-id="login-button"]').click();
  await page.locator('[data-id="loginModalE2EPoolButton"]').click();
  await expect(page.locator('[data-id="user-menu-compact"]').first()).toBeVisible({ timeout: 30000 });

  // --- 2. Open contracts/1_Storage.sol via file explorer --------------------
  await page.locator('li[data-id="treeViewLitreeViewItemcontracts"]').click();
  await page.locator('li[data-id="treeViewLitreeViewItemcontracts/1_Storage.sol"]').click();
  await expect(page.locator('[data-id="bottomBarExplainBtn"]')).toBeVisible({ timeout: 10000 });

  // --- 3. Open AI panel and switch to Mistral Medium ------------------------
  await page.locator('[data-id="verticalIconsKindremixaiassistant"]').click();
  await page.locator('[data-id="ai-model-selector-btn"]').click();
  await page.locator('[data-id="ai-model-mistral-medium-latest"]').click();

  await expect(page.locator('[data-id="ai-route-status"]'))
    .toHaveAttribute('data-route', /agent|tools|chat/, { timeout: 30000 })

  // --- 4. Replace the file with a faulty contract ---------------------------
  const faultyContract = `// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.2 <0.9.0;

contract Storage {
    uint256 number;

    function store(uint256 num) public {
        number = dddum; // <-- undeclared identifier on purpose
    }

    function retrieve() public view returns (uint256) {
        return number;
    }
}
`
  await page.evaluate((value) => {
    const elem: any = document.getElementById('editorView')
    elem.setCurrentContent(value)
  }, faultyContract)

  // --- 5. Compile → error card appears --------------------------------------
  await page.locator('[data-id="verticalIconsKindsolidity"]').click();
  await page.locator('[data-id="compilerContainerCompileBtn"]').click();

  const askAiBtn = page.locator('[data-id="ask-remix-ai-button"]').first()
  await expect(askAiBtn).toBeVisible({ timeout: 60000 });

  // Re-confirm the AI route is ready before the second request — switching
  // away to the solidity panel and back can transiently flip the badge.
  await expect(page.locator('[data-id="ai-route-status"]'))
    .toHaveAttribute('data-route', /agent|tools|chat/, { timeout: 30000 })

  // --- 6. Click "Ask RemixAI" on the error card -----------------------------
  await askAiBtn.click();

  const assistantBubbles = page.locator('[data-id="ai-response-chat-bubble-section"] [data-id="ai-user-chat-bubble"]')
  await expect(assistantBubbles.first()).toBeVisible({ timeout: 90000 })
  await expect.poll(
    async () => (await assistantBubbles.last().innerText()).trim().length,
    { timeout: 90000, intervals: [1000, 2000, 3000] }
  ).toBeGreaterThan(20)
});

/**
 * Anonymous user flow:
 *   1. Load Remix (no sign-in)
 *   2. Open contracts/1_Storage.sol
 *   3. Click "Explain contract" in the bottom bar → assert plan-manager pops up
 *   4. Close the plan manager
 *   5. Replace the file with a faulty contract and compile
 *   6. Click "Ask RemixAI" on the error card → assert plan-manager pops up again
 *//*
test('anonymous user is prompted by plan-manager when triggering AI actions', async ({ page }) => {
  test.setTimeout(120_000)

  // No pool key / no sign-in
  const url = `http://localhost:8080/?lang=en&optimize&runs=200&evmVersion&version=soljson-v0.8.34+commit.80d5c536.js`
  await page.goto(url);

  // Make sure we're really signed out — topbar should show Sign In
  await expect(page.locator('[data-id="login-button"]')).toBeVisible({ timeout: 30000 });

  // --- Open contracts/1_Storage.sol ----------------------------------------
  await page.locator('li[data-id="treeViewLitreeViewItemcontracts"]').click();
  await page.locator('li[data-id="treeViewLitreeViewItemcontracts/1_Storage.sol"]').click();
  await expect(page.locator('[data-id="bottomBarExplainBtn"]')).toBeVisible({ timeout: 10000 });

  // --- Click "Explain contract" → plan-manager should appear ---------------
  await page.locator('[data-id="bottomBarExplainBtn"]').click();
  await expect(page.locator('[data-id="planManagerSignIn"]')).toBeVisible({ timeout: 15000 });

  // Close the plan-manager so we can interact with the rest of the IDE
  await page.locator('[data-id="planManagerCloseButton"]').click();
  await expect(page.locator('.pm-backdrop')).toBeHidden({ timeout: 10000 });

  // --- Replace the file with a faulty contract ------------------------------
  const faultyContract = `// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.2 <0.9.0;

contract Storage {
    uint256 number;

    function store(uint256 num) public {
        number = dddum; // <-- undeclared identifier on purpose
    }

    function retrieve() public view returns (uint256) {
        return number;
    }
}
`
  await page.evaluate((value) => {
    const elem: any = document.getElementById('editorView')
    elem.setCurrentContent(value)
  }, faultyContract)

  // --- Compile → error card appears with "Ask RemixAI" ---------------------
  await page.locator('[data-id="verticalIconsKindsolidity"]').click();
  await page.locator('[data-id="compilerContainerCompileBtn"]').click();

  const askAiBtn = page.locator('[data-id="ask-remix-ai-button"]').first()
  await expect(askAiBtn).toBeVisible({ timeout: 60000 });

  // --- Click "Ask RemixAI" → plan-manager should appear again --------------
  await askAiBtn.click();
  await expect(page.locator('[data-id="planManagerSignIn"]')).toBeVisible({ timeout: 15000 });
});
*/
