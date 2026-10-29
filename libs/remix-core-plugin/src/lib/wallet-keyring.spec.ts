/// <reference types="mocha" />
/**
 * Unit tests for WalletKeyringPlugin.
 *
 * Run with:
 *   nx test remix-core-plugin --file=wallet-keyring
 *
 * Golden vectors were computed offline with the test inputs below.
 * If any of these tests break after a code change, key derivation has
 * changed in a backwards-incompatible way — existing encrypted data is
 * permanently inaccessible for all affected users.
 */
import { expect } from 'chai'

/** Helper: assert an async function rejects with a message matching `pattern`. */
async function shouldReject(fn: () => Promise<unknown>, pattern: string | RegExp): Promise<void> {
  let caught: Error | undefined
  try { await fn() } catch (e) { caught = e as Error }
  expect(caught, 'expected promise to reject').to.be.instanceOf(Error)
  if (typeof pattern === 'string') {
    expect(caught!.message).to.include(pattern)
  } else {
    expect(caught!.message).to.match(pattern)
  }
}

/** Helper: assert an async function rejects with an instance of `Cls`. */
async function shouldRejectWith<T extends Error>(
  fn: () => Promise<unknown>,
  Cls: new (...args: any[]) => T
): Promise<void> {
  let caught: unknown
  try { await fn() } catch (e) { caught = e }
  expect(caught, `expected promise to reject with ${Cls.name}`).to.be.instanceOf(Cls)
}
import {
  WalletKeyringPlugin,
  deriveSessionKeys,
  normalizeSignature,
  privateKeyToAddress,
  toChecksumAddress,
  hexToBytes,
  bytesToHex,
  textToHex,
  validatePurpose,
  buildSignMessage,
  HKDF_SIGNING_LABEL,
  HKDF_ENCRYPTION_LABEL,
  hkdfExpand,
  InvalidPurposeError,
  UnsupportedWalletError,
  NonDeterministicWalletError,
  PurposeLockedError,
  WalletNotFoundError,
  EncryptedEnvelope,
} from './wallet-keyring'

// ─────────────────────────────────────────────────────────────────────────────
// Test double: WalletKeyringPlugin without the remixproject engine
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

class TestKeyring extends WalletKeyringPlugin {
  private _mockSig: string = ''
  private _mockAccount: string = MOCK_ACCOUNT
  private _sig2Override: string | undefined = undefined
  readonly emitted: Array<[string, ...unknown[]]> = []

  setMockSig(sig: string)     { this._mockSig = sig }
  setMockAccount(a: string)   { this._mockAccount = a }
  setSig2(sig: string)        { this._sig2Override = sig }

  // Override Plugin.call so we don't need the engine
  async call(name: string, method: string, ...args: unknown[]): Promise<unknown> {
    if (name === 'udappEnv'   && method === 'getSelectedAccount') return this._mockAccount
    if (name === 'web3Provider' && method === 'sendAsync') {
      const payload = args[0] as { id: number }
      if (payload.id === 2 && this._sig2Override !== undefined) {
        return { result: this._sig2Override }
      }
      return { result: this._mockSig }
    }
    throw new Error(`Unexpected call to ${name}.${method}`)
  }

  // Override Plugin.emit so events don't need the engine
  emit(event: string, ...args: unknown[]): void {
    this.emitted.push([event, ...args])
  }

  // Override listener registration (no-ops without the engine)
  on(_name: string, _event: string, _cb: unknown): void {}
  off(_name: string, _event: string): void {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Golden-vector fixtures
//
// rs_gold = Uint8Array(64).fill(0x42)
// These expected values were computed offline from the protocol constants.
// They are the REGRESSION GUARD: changing message template, HKDF labels, or
// derivation code must cause these tests to fail.
// ─────────────────────────────────────────────────────────────────────────────

const rs_gold = new Uint8Array(64).fill(0x42)
const GOLD_ADDRESS_ARKIV = '0x03EA4b08A6f86aa7f2dbFBa19e9B87bbA342A948'
const GOLD_ADDRESS_FOO   = '0x3342e95B2C57306e03874eBDe39b165089426733'

// Build a synthetic 65-byte personal_sign response from our known r||s
function make65(rs: Uint8Array): string {
  const full = new Uint8Array(65)
  full.set(rs)
  full[64] = 27  // v byte
  return bytesToHex(full)
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('wallet-keyring helpers', () => {
  it('hexToBytes / bytesToHex round-trip', () => {
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
    expect(bytesToHex(bytes)).to.equal('0xdeadbeef')
    expect(hexToBytes('0xdeadbeef')).to.deep.equal(bytes)
    expect(hexToBytes('deadbeef')).to.deep.equal(bytes)   // no 0x prefix ok
  })

  it('hexToBytes rejects odd-length strings', () => {
    expect(() => hexToBytes('0xabc')).to.throw()
  })

  it('textToHex encodes UTF-8', () => {
    const result = hexToBytes(textToHex('AB'))
    expect(result).to.deep.equal(new Uint8Array([0x41, 0x42]))
  })

  it('toChecksumAddress produces EIP-55 checksum', () => {
    const lower = '0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359'
    const expected = '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359'
    expect(toChecksumAddress(lower)).to.equal(expected)
  })

  it('privateKeyToAddress derives a deterministic address', async () => {
    const { signingKeyBytes } = await deriveSessionKeys(rs_gold, 'arkiv')
    const addr = privateKeyToAddress(signingKeyBytes)
    expect(addr).to.equal(GOLD_ADDRESS_ARKIV)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Purpose validation
// ─────────────────────────────────────────────────────────────────────────────

describe('purpose validation', () => {
  const valid = ['arkiv', 'foo', 'x1', 'my-app', 'my.app', 'a_b', 'a'.repeat(64)]
  const invalid = [
    '', 'A', 'Arkiv', '_foo', '-foo', '.foo',
    'has space', 'has/slash', 'a'.repeat(65),
    'foo!', '0'    // single char '0' is valid actually — re-check regex: /^[a-z0-9][a-z0-9._-]{0,63}$/
  ]

  for (const p of valid) {
    it(`accepts "${p}"`, () => { expect(() => validatePurpose(p)).not.to.throw() })
  }
  for (const p of invalid) {
    if (p === '0') continue  // '0' IS valid per regex
    it(`rejects "${p}"`, () => { expect(() => validatePurpose(p)).to.throw(InvalidPurposeError) })
  }

  it('accepts single digit "0"', () => { expect(() => validatePurpose('0')).not.to.throw() })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Signature normalisation
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeSignature', () => {
  it('strips the v byte from a 65-byte signature', () => {
    const sig65 = new Uint8Array(65)
    sig65.fill(0xab, 0, 64)
    sig65[64] = 0x1c
    const rs = normalizeSignature(bytesToHex(sig65))
    expect(rs).to.have.length(64)
    expect(rs.every(b => b === 0xab)).to.be.true
  })

  it('rejects non-65-byte signatures (smart-contract wallets)', () => {
    const bad = new Uint8Array(100)
    expect(() => normalizeSignature(bytesToHex(bad))).to.throw(UnsupportedWalletError)
  })

  it('rejects a 64-byte signature (missing v byte)', () => {
    const bad = new Uint8Array(64)
    expect(() => normalizeSignature(bytesToHex(bad))).to.throw(UnsupportedWalletError)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Golden-vector: key derivation regression guard
// ─────────────────────────────────────────────────────────────────────────────

describe('golden-vector — key derivation', () => {
  it('purpose "arkiv" produces the expected signing address', async () => {
    const { address } = await deriveSessionKeys(rs_gold, 'arkiv')
    expect(address).to.equal(GOLD_ADDRESS_ARKIV,
      'REGRESSION: signing address for purpose "arkiv" changed — existing data is now inaccessible')
  })

  it('changing purpose "arkiv" → "foo" gives a different address', async () => {
    const { address: addrFoo } = await deriveSessionKeys(rs_gold, 'foo')
    expect(addrFoo).to.equal(GOLD_ADDRESS_FOO)
    expect(addrFoo).not.to.equal(GOLD_ADDRESS_ARKIV)
  })

  it('signing key and encryption key are independent (different HKDF labels)', async () => {
    const sigKeyBytes = await hkdfExpand(rs_gold, `${HKDF_SIGNING_LABEL}:arkiv`, 32)
    const encKeyBytes = await hkdfExpand(rs_gold, `${HKDF_ENCRYPTION_LABEL}:arkiv`, 32)
    expect(bytesToHex(sigKeyBytes)).not.to.equal(bytesToHex(encKeyBytes),
      'REGRESSION: signing and encryption labels must produce different keys')
  })

  it('passphrase changes derived keys; same passphrase reproduces them', async () => {
    const withPass1 = await deriveSessionKeys(rs_gold, 'arkiv', 'hunter2')
    const withPass2 = await deriveSessionKeys(rs_gold, 'arkiv', 'hunter2')
    const noPass    = await deriveSessionKeys(rs_gold, 'arkiv')
    expect(withPass1.address).to.equal(withPass2.address)
    expect(withPass1.address).not.to.equal(noPass.address)
  })

  it('different r||s input gives different keys', async () => {
    const rs2 = new Uint8Array(64).fill(0x99)
    const { address: addr1 } = await deriveSessionKeys(rs_gold, 'arkiv')
    const { address: addr2 } = await deriveSessionKeys(rs2, 'arkiv')
    expect(addr1).not.to.equal(addr2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Plugin: unlock, lock, isUnlocked, getAddress
// ─────────────────────────────────────────────────────────────────────────────

describe('WalletKeyringPlugin — unlock / lock', () => {
  it('unlock returns the derived address and emits "unlocked"', async () => {
    const kr = new TestKeyring()
    kr.setMockSig(make65(rs_gold))
    const result = await kr.unlock({ purpose: 'arkiv' })
    expect(result.address).to.equal(GOLD_ADDRESS_ARKIV)
    expect(kr.emitted.some(([e, p]) => e === 'unlocked' && p === 'arkiv')).to.be.true
  })

  it('unlock is idempotent (no second popup)', async () => {
    const kr = new TestKeyring()
    kr.setMockSig(make65(rs_gold))
    const r1 = await kr.unlock({ purpose: 'arkiv' })
    const r2 = await kr.unlock({ purpose: 'arkiv' })
    expect(r1.address).to.equal(r2.address)
  })

  it('concurrent unlock calls for same purpose share one popup', async () => {
    const kr = new TestKeyring()
    kr.setMockSig(make65(rs_gold))
    let callCount = 0
    const orig = kr.call.bind(kr)
    ;(kr as any).call = async (name: string, method: string, ...args: unknown[]) => {
      if (name === 'web3Provider' && method === 'sendAsync') callCount++
      return orig(name, method, ...args)
    }
    const [r1, r2, r3] = await Promise.all([
      kr.unlock({ purpose: 'arkiv' }),
      kr.unlock({ purpose: 'arkiv' }),
      kr.unlock({ purpose: 'arkiv' }),
    ])
    expect(r1.address).to.equal(GOLD_ADDRESS_ARKIV)
    expect(r2.address).to.equal(GOLD_ADDRESS_ARKIV)
    expect(r3.address).to.equal(GOLD_ADDRESS_ARKIV)
    expect(callCount).to.equal(1, 'Should call web3Provider.sendAsync only once for concurrent unlocks')
  })

  it('isUnlocked returns false before unlock and true after', async () => {
    const kr = new TestKeyring()
    kr.setMockSig(make65(rs_gold))
    expect(kr.isUnlocked('arkiv')).to.be.false
    await kr.unlock({ purpose: 'arkiv' })
    expect(kr.isUnlocked('arkiv')).to.be.true
  })

  it('getAddress returns the derived address', async () => {
    const kr = new TestKeyring()
    kr.setMockSig(make65(rs_gold))
    await kr.unlock({ purpose: 'arkiv' })
    expect(kr.getAddress('arkiv')).to.equal(GOLD_ADDRESS_ARKIV)
  })

  it('getAddress throws PurposeLockedError when locked', () => {
    const kr = new TestKeyring()
    expect(() => kr.getAddress('arkiv')).to.throw(PurposeLockedError)
  })

  it('lock(purpose) clears that purpose only', async () => {
    const kr = new TestKeyring()
    kr.setMockSig(make65(rs_gold))
    await kr.unlock({ purpose: 'arkiv' })
    await kr.unlock({ purpose: 'foo' })
    kr.lock('arkiv')
    expect(kr.isUnlocked('arkiv')).to.be.false
    expect(kr.isUnlocked('foo')).to.be.true
    expect(kr.emitted.some(([e, p]) => e === 'locked' && p === 'arkiv')).to.be.true
  })

  it('lock() with no argument clears all purposes', async () => {
    const kr = new TestKeyring()
    kr.setMockSig(make65(rs_gold))
    await kr.unlock({ purpose: 'arkiv' })
    await kr.unlock({ purpose: 'foo' })
    kr.lock()
    expect(kr.isUnlocked('arkiv')).to.be.false
    expect(kr.isUnlocked('foo')).to.be.false
  })

  it('unlocking two different purposes gives different addresses', async () => {
    const kr = new TestKeyring()
    kr.setMockSig(make65(rs_gold))
    const r1 = await kr.unlock({ purpose: 'arkiv' })
    const r2 = await kr.unlock({ purpose: 'foo' })
    expect(r1.address).not.to.equal(r2.address)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. Determinism check
// ─────────────────────────────────────────────────────────────────────────────

describe('WalletKeyringPlugin — determinism check', () => {
  it('passes when both signatures are identical', async () => {
    const kr = new TestKeyring()
    const sig = make65(rs_gold)
    kr.setMockSig(sig)
    kr.setSig2(sig)
    const result = await kr.unlock({ purpose: 'arkiv', verifyDeterminism: true })
    expect(result.address).to.equal(GOLD_ADDRESS_ARKIV)
  })

  it('throws NonDeterministicWalletError when second signature differs', async () => {
    const kr = new TestKeyring()
    kr.setMockSig(make65(rs_gold))
    kr.setSig2(make65(new Uint8Array(64).fill(0x99)))  // different second sig
    let threw = false
    try { await kr.unlock({ purpose: 'arkiv', verifyDeterminism: true }) }
    catch (e) {
      expect(e).to.be.instanceOf(NonDeterministicWalletError)
      threw = true
    }
    expect(threw).to.be.true
  })

  it('UnsupportedWalletError if signature is not 65 bytes', async () => {
    const kr = new TestKeyring()
    kr.setMockSig(bytesToHex(new Uint8Array(64)))  // missing v byte
    let threw = false
    try { await kr.unlock({ purpose: 'arkiv' }) }
    catch (e) {
      expect(e).to.be.instanceOf(UnsupportedWalletError)
      threw = true
    }
    expect(threw).to.be.true
  })

  it('WalletNotFoundError when web3Provider.sendAsync throws', async () => {
    const kr = new TestKeyring()
    ;(kr as any).call = async (name: string, method: string) => {
      if (name === 'udappEnv') return MOCK_ACCOUNT
      throw new Error('provider not connected')
    }
    let threw = false
    try { await kr.unlock({ purpose: 'arkiv' }) }
    catch (e) {
      expect(e).to.be.instanceOf(WalletNotFoundError)
      threw = true
    }
    expect(threw).to.be.true
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. signMessage
// ─────────────────────────────────────────────────────────────────────────────

describe('WalletKeyringPlugin — signMessage', () => {
  async function unlockedKeyring(): Promise<TestKeyring> {
    const kr = new TestKeyring()
    kr.setMockSig(make65(rs_gold))
    await kr.unlock({ purpose: 'arkiv' })
    return kr
  }

  it('returns a 65-byte (130 hex chars) 0x-prefixed signature', async () => {
    const kr = await unlockedKeyring()
    const sig = await kr.signMessage('arkiv', 'hello')
    expect(sig).to.match(/^0x[0-9a-f]{130}$/i)
  })

  it('signing the same message twice gives the same signature (low-s)', async () => {
    const kr = await unlockedKeyring()
    const s1 = await kr.signMessage('arkiv', 'hello')
    const s2 = await kr.signMessage('arkiv', 'hello')
    expect(s1).to.equal(s2)
  })

  it('throws PurposeLockedError after lock()', async () => {
    const kr = await unlockedKeyring()
    kr.lock('arkiv')
    await shouldRejectWith(() => kr.signMessage('arkiv', 'hello'), PurposeLockedError)
  })

  it('signature does not contain key material', async () => {
    const kr = await unlockedKeyring()
    const { signingKeyBytes } = (kr as any).sessions.get('arkiv')
    const keyHex = bytesToHex(signingKeyBytes).toLowerCase().slice(2)
    const sig = (await kr.signMessage('arkiv', 'hello')).toLowerCase().slice(2)
    expect(sig).not.to.include(keyHex)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. AES-GCM encrypt / decrypt
// ─────────────────────────────────────────────────────────────────────────────

describe('WalletKeyringPlugin — encrypt / decrypt', () => {
  async function unlockedKeyring(): Promise<TestKeyring> {
    const kr = new TestKeyring()
    kr.setMockSig(make65(rs_gold))
    await kr.unlock({ purpose: 'arkiv' })
    return kr
  }

  it('round-trip without context', async () => {
    const kr = await unlockedKeyring()
    const plaintext = textToHex('hello world')
    const envelope = await kr.encrypt('arkiv', plaintext)
    const decrypted = await kr.decrypt('arkiv', envelope)
    expect(decrypted).to.equal(plaintext)
  })

  it('round-trip with context string', async () => {
    const kr = await unlockedKeyring()
    const plaintext = textToHex('secret data')
    const envelope = await kr.encrypt('arkiv', plaintext, 'my-context')
    const decrypted = await kr.decrypt('arkiv', envelope, 'my-context')
    expect(decrypted).to.equal(plaintext)
  })

  it('decryption fails when context does not match', async () => {
    const kr = await unlockedKeyring()
    const envelope = await kr.encrypt('arkiv', textToHex('data'), 'ctx-A')
    await shouldReject(() => kr.decrypt('arkiv', envelope, 'ctx-B'), /context mismatch/)
  })

  it('decryption fails when context is omitted but was set on encrypt', async () => {
    const kr = await unlockedKeyring()
    const envelope = await kr.encrypt('arkiv', textToHex('data'), 'ctx')
    await shouldReject(() => kr.decrypt('arkiv', envelope), /context mismatch/)
  })

  it('decryption fails when ciphertext is tampered', async () => {
    const kr = await unlockedKeyring()
    const envelope = await kr.encrypt('arkiv', textToHex('data'))
    const tampered: EncryptedEnvelope = {
      ...envelope,
      ciphertext: envelope.ciphertext.slice(0, -2) + 'ff'
    }
    await shouldReject(() => kr.decrypt('arkiv', tampered), /tampered/)
  })

  it('decryption fails for unknown envelope version', async () => {
    const kr = await unlockedKeyring()
    const envelope = await kr.encrypt('arkiv', textToHex('data'))
    const bad = { ...envelope, version: 99 } as any
    await shouldReject(() => kr.decrypt('arkiv', bad), /Unknown envelope version/)
  })

  it('encrypt is non-deterministic (IV randomised each call)', async () => {
    const kr = await unlockedKeyring()
    const plaintext = textToHex('same data')
    const e1 = await kr.encrypt('arkiv', plaintext)
    const e2 = await kr.encrypt('arkiv', plaintext)
    expect(e1.iv).not.to.equal(e2.iv)
    expect(e1.ciphertext).not.to.equal(e2.ciphertext)
  })

  it('throws PurposeLockedError on encrypt after lock', async () => {
    const kr = await unlockedKeyring()
    kr.lock('arkiv')
    await shouldRejectWith(() => kr.encrypt('arkiv', '0x00'), PurposeLockedError)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 9. No key material leaks through the API
// ─────────────────────────────────────────────────────────────────────────────

describe('key material isolation', () => {
  it('unlock() return value does not contain signing key material', async () => {
    const kr = new TestKeyring()
    kr.setMockSig(make65(rs_gold))
    const result = await kr.unlock({ purpose: 'arkiv' })
    // Extract the raw signing key bytes to check against
    const { signingKeyBytes } = (kr as any).sessions.get('arkiv')
    const keyHex = bytesToHex(signingKeyBytes).toLowerCase().slice(2)
    const resultStr = JSON.stringify(result).toLowerCase()
    expect(resultStr).not.to.include(keyHex)
  })

  it('signMessage error message does not include key material', async () => {
    const kr = new TestKeyring()
    // Do NOT unlock — the error message for a locked purpose must not leak the key
    let errMsg = ''
    try { await kr.signMessage('arkiv', 'test') } catch (e) { errMsg = (e as Error).message }
    expect(errMsg).to.include('"arkiv"')
    expect(errMsg).not.to.match(/[0-9a-f]{32}/i)  // no 16+ byte hex blob in error
  })

  it('locking wipes the signing key bytes', async () => {
    const kr = new TestKeyring()
    kr.setMockSig(make65(rs_gold))
    await kr.unlock({ purpose: 'arkiv' })
    const { signingKeyBytes } = (kr as any).sessions.get('arkiv')
    const snapshotBefore = new Uint8Array(signingKeyBytes)
    kr.lock('arkiv')
    // The reference still points to the same array — should be zeroed
    const allZero = snapshotBefore.every(b => b === 0) ||  // array was zeroed via wipeBytes
                    signingKeyBytes.every(b => b === 0)
    expect(allZero).to.be.true
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 10. Message template regression guard
// ─────────────────────────────────────────────────────────────────────────────

describe('buildSignMessage regression guard', () => {
  it('message is deterministic and includes version, purpose, and account', () => {
    const msg = buildSignMessage('arkiv', '0xdeadbeef')
    expect(msg).to.include('v1')
    expect(msg).to.include('arkiv')
    expect(msg).to.include('0xdeadbeef')
    expect(msg).to.include('https://remix.ethereum.org')
  })

  it('different purposes produce different messages', () => {
    const m1 = buildSignMessage('arkiv', '0xdeadbeef')
    const m2 = buildSignMessage('foo',   '0xdeadbeef')
    expect(m1).not.to.equal(m2)
  })

  it('different accounts produce different messages', () => {
    const m1 = buildSignMessage('arkiv', '0x1111111111111111111111111111111111111111')
    const m2 = buildSignMessage('arkiv', '0x2222222222222222222222222222222222222222')
    expect(m1).not.to.equal(m2)
  })
})
