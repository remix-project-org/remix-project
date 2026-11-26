import { expect, test } from '@playwright/test'
import { isUrlCallAllowed, URL_CALL_ALLOWLIST } from '../apps/remix-ide/src/urlCallAllowlist'

test.describe('isUrlCallAllowed', () => {
  test('allows every entry in the allowlist', () => {
    for (const [plugin, methods] of Object.entries(URL_CALL_ALLOWLIST)) {
      for (const method of methods) {
        expect(isUrlCallAllowed(plugin, method), `${plugin}//${method} should be allowed`).toBe(true)
      }
    }
  })

  test('blocks scriptRunnerBridge//execute', () => {
    expect(isUrlCallAllowed('scriptRunnerBridge', 'execute')).toBe(false)
  })

  test('blocks unknown plugins', () => {
    expect(isUrlCallAllowed('remixd', 'folderIsReadOnly')).toBe(false)
    expect(isUrlCallAllowed('fileManager', 'writeFile')).toBe(false)
    expect(isUrlCallAllowed('udapp', 'sendTransaction')).toBe(false)
  })

  test('blocks a known plugin with an unlisted method', () => {
    expect(isUrlCallAllowed('fileManager', 'writeFile')).toBe(false)
    expect(isUrlCallAllowed('terminal', 'execute')).toBe(false)
    expect(isUrlCallAllowed('LearnEth', 'load')).toBe(false)
  })

  test('blocks empty strings', () => {
    expect(isUrlCallAllowed('', '')).toBe(false)
    expect(isUrlCallAllowed('fileManager', '')).toBe(false)
    expect(isUrlCallAllowed('', 'open')).toBe(false)
  })
})
