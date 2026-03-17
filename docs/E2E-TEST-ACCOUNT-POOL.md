# E2E Test Account Pool

The test account pool provides **exclusive, pre-provisioned user accounts** for E2E tests. Each CI shard (or local test run) checks out a unique account, receives real JWT tokens, runs tests as an authenticated user, and releases the account when done. On release the server **wipes all user data** (DB rows, S3 objects, Redis keys) so the next run starts clean.

## Why?

- **Isolation** — Parallel CI shards never share the same user, eliminating flaky tests from data collisions.
- **Realistic auth** — Tests use real JWT tokens issued by the SSO server. No mocking, no fake localStorage injection.
- **Clean state** — Every release wipes the account's data so tests are deterministic.
- **Feature group control** — Accounts are assigned to specific feature groups (e.g. `beta`, `storage`) at checkout time, mirroring real permission tiers.

## Architecture Overview

```
┌─────────────────────────┐
│  CI Shard / Local Dev   │
│  (Nightwatch + Chrome)  │
└──────────┬──────────────┘
           │
           │ 1. checkout (featureGroups: ['beta'])
           ▼
┌──────────────────────────┐      ┌──────────────────┐
│  Pool API                │ ───► │  20 pre-seeded   │
│  /sso/test/pool/*        │      │  test accounts   │
│  (Bearer rmx_... auth)   │      │  (e2e-pool-001   │
└──────────┬───────────────┘      │   ... -020)      │
           │                      └──────────────────┘
           │ returns: sessionId, accountId,
           │          access_token, refresh_token, user
           ▼
┌──────────────────────────┐
│  Browser                 │
│  - Tokens in localStorage│
│  - AuthPlugin recognises │
│    the session           │
│  - Tests run as real user│
└──────────┬───────────────┘
           │
           │ 2. release (sessionId)
           ▼
┌──────────────────────────┐
│  Pool API wipes:         │
│  - DB rows (cascade)     │
│  - S3 workspaces/avatars │
│  - Redis sessions/cache  │
└──────────────────────────┘
```

## Quick Start

### Prerequisites

| Item | Description |
|---|---|
| `E2E_POOL_API_KEY` | A `rmx_...` API key with `test-account-access` scope. Store in `.env` at the project root or export as an env var. |
| `REMIX_API_URL` | *(Optional)* SSO base URL. Defaults to `https://auth.api.remix.live:8443`. |

### Local Development

1. Create `.env` in the project root:

   ```env
   E2E_POOL_API_KEY=rmx_your_key_here
   ```

2. Start the dev server:

   ```bash
   yarn serve          # or yarn serve:hot
   ```

3. Build the E2E tests:

   ```bash
   yarn build:e2e
   ```

4. Run a test that uses the pool:

   ```bash
   yarn nightwatch \
     --config dist/apps/remix-ide-e2e/nightwatch-chrome.js \
     dist/apps/remix-ide-e2e/src/tests/testPoolLogin_group1.test.js \
     --env=chromeDesktop
   ```

   The test will:
   - Navigate to Remix with `#e2e_pool_key=rmx_...` in the URL hash
   - Click **Sign In** → **E2E Test Pool** in the modal
   - The AuthPlugin checks out an account, stores tokens, logs in
   - After tests finish, the session is released and data wiped

### CI (CircleCI)

Set `E2E_POOL_API_KEY` as a CircleCI environment variable. The `browser_test.sh` script handles everything automatically:

```
┌───────────────────────────────────────────────────┐
│  browser_test.sh                                  │
│                                                   │
│  1. pool.js checkout "beta" → POOL_JSON           │
│  2. Exports E2E_ACCESS_TOKEN, E2E_REFRESH_TOKEN,  │
│     E2E_USER_JSON, POOL_SESSION_ID                │
│  3. Runs Nightwatch tests                         │
│  4. trap EXIT → pool.js release $POOL_SESSION_ID  │
│     (always runs, even on failure)                │
└───────────────────────────────────────────────────┘
```

The tokens are injected into the browser's `localStorage` by `init.ts` before each test starts.

## Two Login Approaches

### Approach 1: UI Flow (Recommended for pool-specific tests)

The test navigates to Remix with the pool key in the URL hash and clicks through the real login UI:

```typescript
before: function (browser, done) {
  const url = `http://127.0.0.1:8080#e2e_pool_key=${poolApiKey}`
  init(browser, done, url, true)
}

// In the test:
browser
  .execute(() => localStorage.setItem('enableLogin', 'true'))
  .refreshPage()
  .click('*[data-id="login-button"]')           // Sign In
  .click({                                        // E2E Test Pool
    selector: '//button[contains(., "E2E Test Pool")]',
    locateStrategy: 'xpath'
  })
```

**How it works:**
1. `e2e_pool_key` is read from the hash by `AuthPlugin.ensurePoolApi()` via `QueryParams`
2. The login modal's `isPoolAvailable()` check finds the key → shows the "E2E Test Pool" button
3. Clicking it calls `AuthPlugin.loginWithPool()` which does a real `POST /checkout`
4. Tokens are stored in `localStorage`, session tracked in `sessionStorage`

**Teardown** — read the session from `sessionStorage` and release:

```typescript
after: async function (browser, done) {
  const result = await new Promise(resolve => {
    browser.execute(() => sessionStorage.getItem('remix_pool_session'), [], res => resolve(res))
  })
  if (result?.value) {
    const session = JSON.parse(result.value)
    await releaseAccount(session.sessionId)
  }
  browser.end(); done()
}
```

### Approach 2: Pre-injected Tokens (CI default, all tests)

`browser_test.sh` checks out an account *before* any test runs and exports env vars. `init.ts` detects `E2E_ACCESS_TOKEN` and injects tokens into `localStorage`:

```bash
# browser_test.sh does this automatically:
POOL_JSON=$(node pool.js checkout "beta")
export E2E_ACCESS_TOKEN=$(echo "$POOL_JSON" | jq -r '.accessToken')
export E2E_REFRESH_TOKEN=$(echo "$POOL_JSON" | jq -r '.refreshToken')
export E2E_USER_JSON=$(echo "$POOL_JSON" | jq -c '.user')
```

Then `init.ts` injects them:
```
localStorage.setItem('enableLogin', 'true')
localStorage.setItem('remix_access_token', accessToken)
localStorage.setItem('remix_refresh_token', refreshToken)
localStorage.setItem('remix_user', JSON.stringify(authUser))
```

This is faster (no modal clicks) and is suitable for tests that need auth but aren't testing the login flow itself.

## Pool CLI

The `pool.ts` helper doubles as a CLI tool:

```bash
# Checkout an account
node dist/apps/remix-ide-e2e/src/helpers/pool.js checkout beta
# → prints JSON: { sessionId, accountId, accessToken, ... }

# Checkout with multiple feature groups
node dist/apps/remix-ide-e2e/src/helpers/pool.js checkout beta,storage

# Release a session
node dist/apps/remix-ide-e2e/src/helpers/pool.js release <sessionId>

# Check pool status
node dist/apps/remix-ide-e2e/src/helpers/pool.js status

# Emergency: release ALL accounts
node dist/apps/remix-ide-e2e/src/helpers/pool.js release-all
```

## API Endpoints

All endpoints require `Authorization: Bearer rmx_...` header.

| Method | Endpoint | Body | Description |
|---|---|---|---|
| `POST` | `/sso/test/pool/checkout` | `{ featureGroups: ['beta'] }` | Lock an account, assign groups, return JWT tokens |
| `POST` | `/sso/test/pool/release` | `{ sessionId: '...' }` | Unlock account + wipe all data (DB, S3, Redis) |
| `GET` | `/sso/test/pool/status` | — | Pool utilization: total, available, locked accounts |
| `GET` | `/sso/test/pool/accounts` | — | List all 20 pool account definitions |
| `POST` | `/sso/test/pool/release-all` | — | Emergency: force-release everything |

### Checkout Response

```json
{
  "sessionId": "a1b2c3d4-...",
  "accountId": "e2e-pool-003",
  "userId": 42,
  "groupId": 7,
  "featureGroups": ["beta"],
  "access_token": "eyJhbGciOi...",
  "refresh_token": "eyJhbGciOi...",
  "user": {
    "id": 42,
    "name": "E2E Pool 003",
    "email": "e2e-pool-003@remix-test.internal",
    "is_admin": false,
    "group_id": 7
  }
}
```

### Release Response

```json
{
  "ok": true,
  "accountId": "e2e-pool-003",
  "cleaned": {
    "db": { "nonCascadeDeleted": 5, "accountGroupDeleted": true },
    "s3": { "workspaceObjects": 12, "avatarObjects": 1, "walletObjects": 0 },
    "redis": { "keysDeleted": 3 }
  }
}
```

### Error Codes

| Code | HTTP | When |
|---|---|---|
| `POOL_EXHAUSTED` | 503 | All 20 accounts are locked (CI running too many shards) |
| `API_KEY_FORBIDDEN` | 403 | Invalid or missing API key |
| `LOGIN_FEATURE_GROUP_REQUIRED` | 403 | No feature group with `login:allowed` was requested |
| `INVALID_FEATURE_GROUPS` | 400 | One or more group names don't exist on the server |
| `SESSION_NOT_FOUND` | 404 | sessionId is unknown or the lock already expired |

## File Reference

| File | Purpose |
|---|---|
| [apps/remix-ide-e2e/src/helpers/pool.ts](../apps/remix-ide-e2e/src/helpers/pool.ts) | Node.js helper + CLI for checkout/release/status |
| [apps/remix-ide-e2e/src/helpers/init.ts](../apps/remix-ide-e2e/src/helpers/init.ts) | Injects pool tokens into browser localStorage |
| [apps/remix-ide-e2e/src/tests/testPoolLogin.test.ts](../apps/remix-ide-e2e/src/tests/testPoolLogin.test.ts) | Reference E2E test using real UI login flow |
| [apps/remix-ide/ci/browser_test.sh](../apps/remix-ide/ci/browser_test.sh) | CI script with pool checkout/release lifecycle |
| [apps/remix-ide/src/app/plugins/auth-plugin.tsx](../apps/remix-ide/src/app/plugins/auth-plugin.tsx) | AuthPlugin with pool methods (`poolCheckout`, `poolRelease`, `loginWithPool`) |
| [libs/remix-api/src/lib/plugins/api-services.ts](../libs/remix-api/src/lib/plugins/api-services.ts) | `TestPoolApiService` — typed HTTP client for pool endpoints |
| [libs/remix-api/src/lib/plugins/api-types.ts](../libs/remix-api/src/lib/plugins/api-types.ts) | TypeScript types: `PoolCheckoutResponse`, `PoolReleaseResponse`, etc. |

## URL Parameters

These are passed via the **URL hash** (not query string — Remix rewrites `?` params to `#`):

| Parameter | Example | Description |
|---|---|---|
| `e2e_pool_key` | `rmx_abc123...` | Pool API key — makes the "E2E Test Pool" button visible in the login modal |
| `e2e_feature_groups` | `beta,storage` | Comma-separated feature groups to request at checkout (default: `beta`) |

Example URL:
```
http://127.0.0.1:8080#e2e_pool_key=rmx_abc123&e2e_feature_groups=beta,storage
```

## Troubleshooting

### "POOL_EXHAUSTED" in CI

All 20 accounts are locked. This usually means:
- A previous CI run crashed without releasing its account
- Too many shards running concurrently (max 20)

**Fix:** Run the emergency release:
```bash
E2E_POOL_API_KEY=rmx_... node dist/apps/remix-ide-e2e/src/helpers/pool.js release-all
```

Or check what's locked:
```bash
E2E_POOL_API_KEY=rmx_... node dist/apps/remix-ide-e2e/src/helpers/pool.js status
```

### "E2E Test Pool" button not showing in modal

1. Make sure `enableLogin` is set to `'true'` in `localStorage` (required for the Sign In button to appear)
2. Make sure `e2e_pool_key` is in the URL **hash** (not query string): `#e2e_pool_key=rmx_...`
3. Check the browser console for `[LoginModal] Pool check failed` messages

### Tokens not appearing in localStorage

If using the CI approach (env var injection), check that:
- `E2E_ACCESS_TOKEN` is set in the environment
- `init.ts` runs before the test (it's called in the `before` hook)
- The page is refreshed after injection (`init.ts` does this automatically)

### Session expired / release returns 404

Pool sessions have a TTL (typically 30 minutes). If a test takes too long or hangs, the lock expires and the session becomes invalid. The account returns to the available pool automatically, but data isn't wiped. Re-running the test will get a fresh checkout.
