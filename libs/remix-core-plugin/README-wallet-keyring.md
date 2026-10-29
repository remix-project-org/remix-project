# WalletKeyringPlugin

A native Remix plugin that derives purpose-scoped secp256k1 signing keys and
AES-GCM-256 encryption keys from a single deterministic `personal_sign` wallet
signature. **Keys never leave this plugin.** No key material is ever returned
by any API method, emitted in any event, or written to any storage.

## Quick start

Any plugin can request access to the keyring through the standard Remix
permission system. The first call from a new plugin triggers a user-visible
permission dialog.

```typescript
// 1. Unlock — prompts MetaMask once, derives keys for "my-purpose"
const { address } = await this.call('walletKeyring', 'unlock', { purpose: 'my-purpose' })

// 2. Sign a message (EIP-191)
const sig = await this.call('walletKeyring', 'signMessage', 'my-purpose', 'Hello!')

// 3. Encrypt / decrypt
const envelope = await this.call('walletKeyring', 'encrypt', 'my-purpose', '0xdeadbeef', 'optional-context')
const plain    = await this.call('walletKeyring', 'decrypt', 'my-purpose', envelope,     'optional-context')

// 4. Lock when done
this.call('walletKeyring', 'lock', 'my-purpose')
```

## Purpose string

A purpose string scopes a key to a specific use-case. Each distinct purpose
gets its own independent signing key and encryption key, derived from a
separate wallet popup (so the user knows exactly what they are authorising).

**Validation rule:** `/^[a-z0-9][a-z0-9._-]{0,63}$/`

Examples: `"arkiv"`, `"my-app"`, `"storage.v2"`

## API reference

All methods are accessible via `this.call('walletKeyring', methodName, ...args)`.
Sensitive methods (unlock, signMessage, signTypedData, signTransaction, encrypt,
decrypt) show a session-only permission dialog; the user's choice is not
persisted across page reloads.

### `unlock(params) → { address }`

| Field | Type | Description |
|---|---|---|
| `purpose` | `string` | The purpose string to derive keys for |
| `passphrase?` | `string` | Optional passphrase; adds a scrypt stretch step |
| `verifyDeterminism?` | `boolean` | If true, signs twice to verify the wallet is deterministic |

Returns the derived Ethereum address. Concurrent calls for the same purpose
share a single wallet popup.

### `isUnlocked(purpose) → boolean`

Returns `true` if keys for this purpose are currently in memory.

### `getAddress(purpose) → string`

Returns the derived Ethereum address. Throws `PurposeLockedError` if locked.

### `lock(purpose?) → void`

Wipes the key material for `purpose`. Omit `purpose` to lock everything.
Emits `"locked"` for each purpose that was cleared.

### `signMessage(purpose, message) → 0x-hex`

Signs `message` with an EIP-191 personal-sign envelope. Returns a 0x-prefixed
65-byte hex signature (r ‖ s ‖ v).

**Wire format:** `message` is a plain UTF-8 string.

### `signTypedData(purpose, typedData) → 0x-hex`

Signs EIP-712 typed data. Returns a 0x-prefixed 65-byte hex signature.

**Wire format:** `typedData` is a JSON-serialisable object:
```typescript
{
  domain: Record<string, unknown>
  types:  Record<string, Array<{ name: string; type: string }>>
  message: Record<string, unknown>   // bigint values as decimal strings
  primaryType: string
}
```

### `signTransaction(purpose, tx) → 0x-hex`

Signs and serialises a transaction. Returns 0x-prefixed RLP-encoded signed tx.

**Wire format:** bigint fields are decimal strings:
```typescript
{
  to?: string
  from?: string
  value?: string              // decimal, e.g. "1000000000000000000"
  data?: string               // 0x-prefixed hex
  gasLimit?: string           // decimal
  maxFeePerGas?: string       // decimal (EIP-1559)
  maxPriorityFeePerGas?: string // decimal (EIP-1559)
  gasPrice?: string           // decimal (legacy)
  nonce?: number
  chainId?: number
}
```

### `encrypt(purpose, data, context?) → EncryptedEnvelope`

Encrypts `data` with AES-GCM-256. The optional `context` string is bound as
additional authenticated data (AAD) and must be provided verbatim to decrypt.

**Wire format:** `data` is 0x-prefixed hex. Returns:
```typescript
{
  version: 1
  ciphertext: string  // 0x-prefixed hex
  iv: string          // 0x-prefixed hex, 12 bytes, random per call
  aad: string         // 0x-prefixed hex of the UTF-8 context (or 0x for empty)
}
```

### `decrypt(purpose, envelope, context?) → 0x-hex`

Decrypts an `EncryptedEnvelope`. Throws if `context` does not match the AAD
stored in the envelope, or if the ciphertext is tampered (AES-GCM auth tag
failure). Returns 0x-prefixed hex of the plaintext.

### Events

| Event | Payload | Emitted when |
|---|---|---|
| `unlocked` | `purpose: string` | `unlock()` succeeds |
| `locked` | `purpose: string` | `lock()` clears a purpose |

## Building a viem custom account (consumer pattern)

The plugin never returns key material, so consumers build a viem `toAccount`
object that proxies signing calls through the plugin:

```typescript
import { toAccount } from 'viem/accounts'

const purpose = 'my-app'
const address = await this.call('walletKeyring', 'getAddress', purpose)

const account = toAccount({
  address,
  async signMessage({ message }) {
    const msg = typeof message === 'string' ? message : Buffer.from(message.raw).toString('utf8')
    return this.call('walletKeyring', 'signMessage', purpose, msg)
  },
  async signTransaction(tx) {
    // Convert bigint fields to decimal strings for the wire format
    return this.call('walletKeyring', 'signTransaction', purpose, {
      ...tx,
      value:                tx.value?.toString(),
      gasLimit:             tx.gas?.toString(),
      maxFeePerGas:         tx.maxFeePerGas?.toString(),
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas?.toString(),
    })
  },
  async signTypedData({ domain, types, message, primaryType }) {
    return this.call('walletKeyring', 'signTypedData', purpose, { domain, types, message, primaryType })
  },
})
```

The key never leaves the `walletKeyring` plugin. The consumer only holds the
derived address and routes signing requests through the plugin API.

## Security model

### Key derivation

```
1. personal_sign(message, account)          → 65-byte wallet signature
2. strip v byte                             → r ‖ s (64 bytes, IKM)
3. [optional] scrypt(passphrase, IKM)       → 64-byte stretched IKM
4. HKDF-SHA-256(IKM, label="…-signing:purpose",    salt=0×32) → 32 bytes
5. HKDF-SHA-256(IKM, label="…-encryption:purpose", salt=0×32) → 32 bytes
6. signing key   → secp256k1 private key → Ethereum address
7. encryption key → AES-GCM-256 (non-extractable)
```

### Why `personal_sign` and not `eth_sign`

`personal_sign` adds a human-readable prefix to the message before signing,
so users see a clear warning in MetaMask. `eth_sign` signs arbitrary digests
and is widely deprecated.

### Auto-lock triggers

The keyring locks a purpose automatically when:
- The wallet's selected account changes (`accountsChanged` event)
- The plugin is deactivated

The user can also call `lock()` explicitly.

### Network independence

Key derivation uses `personal_sign` only, which does not depend on the
selected chain or the Deploy & Run environment. The same keys are produced
regardless of whether the user is on Mainnet, Sepolia, or a local VM — as
long as the same MetaMask account is used.

---

## ⚠ Protocol constants — must never change

The following values are part of the on-chain/off-chain data contract. Changing
any of them produces different keys for every existing user, permanently
orphaning their encrypted data and invalidating their signed artefacts.

| Constant | Value |
|---|---|
| `DERIVATION_VERSION` | `1` |
| `HKDF_SIGNING_LABEL` | `remix-keyring-v1-signing` |
| `HKDF_ENCRYPTION_LABEL` | `remix-keyring-v1-encryption` |
| Message template | `Remix IDE - derived key (v1)\nPurpose: …\nAccount: …\n…` |

If a breaking change ever becomes necessary, bump the version, update both
labels and the message template together, and provide a migration path.

The test file (`wallet-keyring.spec.ts`) contains golden-vector tests that
will fail immediately if any of these are accidentally changed.
