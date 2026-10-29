/**
 * WalletKeyringPlugin
 *
 * Derives purpose-scoped secp256k1 signing keys and AES-GCM-256 encryption
 * keys from a single deterministic `personal_sign` wallet signature.
 * Keys live in memory only; they are never returned via the plugin API or
 * persisted anywhere.
 *
 * SECURITY MODEL
 * - The plugin is native (in-process). The Remix permission system ensures
 *   other plugins must be granted access before they can call sign/encrypt.
 * - All sensitive methods (unlock, signMessage, signTypedData, signTransaction,
 *   encrypt, decrypt) are listed in remixAppManager.sensitiveCalls so the
 *   permission dialog defaults to session-only (not remembered).
 * - Private key bytes are stored as Uint8Array and zeroed on lock.
 * - The AES-GCM key is non-extractable. It never leaves WebCrypto.
 * - The secp256k1 private key is used only inside this module; it is never
 *   returned to any caller or serialised to any external representation.
 * - Errors never include signature or key material.
 */

import { Plugin } from '@remixproject/engine'
import { secp256k1 } from '@noble/curves/secp256k1'
import { keccak_256 } from '@noble/hashes/sha3'
import { scrypt } from '@noble/hashes/scrypt'
import { TypedDataEncoder, Wallet as EthersWallet } from 'ethers'

// ─────────────────────────────────────────────────────────────────────────────
// ⚠  IMMUTABLE PROTOCOL CONSTANTS
//
// Changing DERIVATION_VERSION, buildSignMessage, HKDF_SIGNING_LABEL, or
// HKDF_ENCRYPTION_LABEL will produce different keys for the same wallet +
// purpose, permanently orphaning any data signed or encrypted with the old
// keys. Only change these as a coordinated breaking-change migration with a
// version bump and a clear upgrade path.
// ─────────────────────────────────────────────────────────────────────────────

const DERIVATION_VERSION = 1

export function buildSignMessage(purpose: string, account: string): string {
  return (
    `Remix IDE - derived key (v${DERIVATION_VERSION})\n` +
    `Purpose: ${purpose}\n` +
    `Account: ${account}\n\n` +
    `This signature derives a purpose-specific cryptographic key.\n` +
    `It does NOT authorize any transaction or spend any gas.\n` +
    `Only sign on https://app.remix.live official Remix IDE or a trusted instance.`
  )
}

export const HKDF_SIGNING_LABEL    = 'remix-keyring-v1-signing'
export const HKDF_ENCRYPTION_LABEL = 'remix-keyring-v1-encryption'

// ─────────────────────────────────────────────────────────────────────────────
// Scrypt parameters for optional passphrase stretching.
// Changing these changes the derived keys (not a protocol break, but existing
// encrypted data becomes inaccessible if the consumer stored the old keys).
// ─────────────────────────────────────────────────────────────────────────────

const SCRYPT_N = 1 << 15   // 32 768 — interactive strength
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_DK_LEN = 64

// ─────────────────────────────────────────────────────────────────────────────
// Purpose validation
// ─────────────────────────────────────────────────────────────────────────────

const PURPOSE_REGEX = /^[a-z0-9][a-z0-9._-]{0,63}$/

export function validatePurpose(purpose: string): void {
  if (!PURPOSE_REGEX.test(purpose)) throw new InvalidPurposeError(purpose)
}

// ─────────────────────────────────────────────────────────────────────────────
// Error types  (codes are stable — callers may switch on them)
// ─────────────────────────────────────────────────────────────────────────────

export class WalletNotFoundError extends Error {
  readonly code = 'WALLET_NOT_FOUND' as const
  constructor() {
    super('No wallet provider available. Switch Deploy & Run to an injected provider (e.g. MetaMask).')
    this.name = 'WalletNotFoundError'
  }
}

export class UnsupportedWalletError extends Error {
  readonly code = 'UNSUPPORTED_WALLET' as const
  constructor() {
    super('Wallet returned a non-standard signature. Smart-contract wallets (ERC-4337) are not supported for key derivation.')
    this.name = 'UnsupportedWalletError'
  }
}

export class NonDeterministicWalletError extends Error {
  readonly code = 'NON_DETERMINISTIC_WALLET' as const
  constructor() {
    super('Wallet produced two different signatures for the same message. Key derivation requires a deterministic (HD) wallet.')
    this.name = 'NonDeterministicWalletError'
  }
}

export class PurposeLockedError extends Error {
  readonly code = 'PURPOSE_LOCKED' as const
  constructor(purpose: string) {
    super(`Purpose "${purpose}" is locked. Call unlock() first.`)
    this.name = 'PurposeLockedError'
  }
}

export class InvalidPurposeError extends Error {
  readonly code = 'INVALID_PURPOSE' as const
  constructor(purpose: string) {
    super(`Invalid purpose "${purpose}". Must match /^[a-z0-9][a-z0-9._-]{0,63}$/.`)
    this.name = 'InvalidPurposeError'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API wire types
// ─────────────────────────────────────────────────────────────────────────────

export interface UnlockParams {
  purpose: string
  passphrase?: string
  verifyDeterminism?: boolean
}

export interface EncryptedEnvelope {
  version: 1
  ciphertext: string   // 0x-prefixed hex
  iv: string           // 0x-prefixed hex (12 bytes)
  aad: string          // 0x-prefixed hex (context bytes, may be 0x for empty)
}

/**
 * Transaction wire format.
 * bigint fields (value, gasLimit, gas prices) are decimal strings so JSON
 * serialisation is lossless. chainId and nonce are plain numbers.
 */
export interface TxRequest {
  to?: string
  from?: string
  value?: string              // decimal string, e.g. "1000000000000000000"
  data?: string               // 0x-prefixed hex
  gasLimit?: string           // decimal string
  maxFeePerGas?: string       // decimal string (EIP-1559)
  maxPriorityFeePerGas?: string // decimal string (EIP-1559)
  gasPrice?: string           // decimal string (legacy)
  nonce?: number
  chainId?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal session type
// ─────────────────────────────────────────────────────────────────────────────

interface Session {
  readonly address: string          // EIP-55 checksummed, derived from the signing key
  readonly signingKeyBytes: Uint8Array // secp256k1 private key — zeroed on lock
  readonly encryptionKey: CryptoKey   // AES-GCM-256, non-extractable
  readonly signerAccount: string    // MetaMask account that produced the seed signature
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure / crypto helpers  (exported so tests can use them directly)
// ─────────────────────────────────────────────────────────────────────────────

export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex
  if (h.length % 2 !== 0) throw new Error('Odd-length hex string')
  const out = new Uint8Array(h.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16)
  return out
}

export function bytesToHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export function textToHex(text: string): string {
  return bytesToHex(new TextEncoder().encode(text))
}

function wipeBytes(buf: Uint8Array): void {
  try { buf.fill(0) } catch { /* best-effort */ }
}

/** Strip the recovery byte; rejects anything that isn't exactly 65 bytes. */
export function normalizeSignature(sigHex: string): Uint8Array {
  const sig = hexToBytes(sigHex)
  if (sig.length !== 65) throw new UnsupportedWalletError()
  return sig.slice(0, 64)
}

export function toChecksumAddress(addr: string): string {
  const lower = addr.startsWith('0x') ? addr.slice(2).toLowerCase() : addr.toLowerCase()
  const hash = keccak_256(new TextEncoder().encode(lower))
  let result = '0x'
  for (let i = 0; i < lower.length; i++) {
    result += ((hash[Math.floor(i / 2)] >> (i % 2 === 0 ? 4 : 0)) & 0x0f) >= 8
      ? lower[i].toUpperCase()
      : lower[i]
  }
  return result
}

export function privateKeyToAddress(privKey: Uint8Array): string {
  const pubKey = secp256k1.getPublicKey(privKey, false)  // 65-byte uncompressed
  const pubHash = keccak_256(pubKey.slice(1))             // hash of 64-byte x||y
  return toChecksumAddress('0x' + Buffer.from(pubHash.slice(12)).toString('hex'))
}

/** HKDF-SHA-256 with a 32-byte zero salt, returning `lengthBytes` raw bytes. */
export async function hkdfExpand(
  ikm: Uint8Array,
  info: string,
  lengthBytes: number
): Promise<Uint8Array> {
  const baseKey = await globalThis.crypto.subtle.importKey(
    'raw', ikm, { name: 'HKDF' }, false, ['deriveBits']
  )
  const derived = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: new TextEncoder().encode(info)
    },
    baseKey,
    lengthBytes * 8
  )
  return new Uint8Array(derived)
}

async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    'raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  )
}

/**
 * Core key derivation. Given 64 bytes of r||s (from a personal_sign response)
 * and a validated purpose, returns the signing key bytes, the AES-GCM
 * encryption key, and the derived Ethereum address.
 *
 * ⚠ Exported for testing. Do not call from outside the plugin in production.
 */
export async function deriveSessionKeys(
  rs64: Uint8Array,
  purpose: string,
  passphrase?: string
): Promise<{ address: string; signingKeyBytes: Uint8Array; encryptionKey: CryptoKey }> {
  let ikm: Uint8Array

  if (passphrase) {
    const passBytes = new TextEncoder().encode(passphrase)
    ikm = scrypt(passBytes, rs64, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, dkLen: SCRYPT_DK_LEN })
  } else {
    ikm = rs64
  }

  // Separate HKDF expansions for signing and encryption so the two keys are
  // cryptographically independent even though they share the same IKM.
  const sigInfo = `${HKDF_SIGNING_LABEL}:${purpose}`
  let signingKeyBytes = await hkdfExpand(ikm, sigInfo, 32)

  // Retry loop for the astronomically rare case of an invalid secp256k1 scalar.
  let retries = 0
  while (!secp256k1.utils.isValidPrivateKey(signingKeyBytes)) {
    if (++retries > 16) throw new Error('Failed to derive a valid secp256k1 key after 16 retries.')
    const prev = signingKeyBytes
    signingKeyBytes = await hkdfExpand(prev, `${sigInfo}:retry${retries}`, 32)
    wipeBytes(prev)
  }

  const encKeyBytes = await hkdfExpand(ikm, `${HKDF_ENCRYPTION_LABEL}:${purpose}`, 32)
  const encryptionKey = await importAesKey(encKeyBytes)
  wipeBytes(encKeyBytes)

  if (passphrase) wipeBytes(ikm)

  return { address: privateKeyToAddress(signingKeyBytes), signingKeyBytes, encryptionKey }
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin profile
// ─────────────────────────────────────────────────────────────────────────────

const profile = {
  name: 'walletKeyring',
  displayName: 'Wallet Keyring',
  description: 'Manages wallet-derived keys for signing and encryption — keys never leave this plugin',
  methods: [
    'unlock', 'isUnlocked', 'getAddress', 'lock',
    'signMessage', 'signTypedData', 'signTransaction',
    'encrypt', 'decrypt'
  ],
  events: ['unlocked', 'locked'],
  version: '1.0.0'
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin class
// ─────────────────────────────────────────────────────────────────────────────

export class WalletKeyringPlugin extends Plugin {
  private sessions = new Map<string, Session>()
  /** One Promise per in-flight unlock so concurrent callers share one popup. */
  private unlockInFlight = new Map<string, Promise<{ address: string }>>()
  /** Cached determinism check result per wallet address (not secret). */
  private determinismCache = new Map<string, boolean>()
  private injectedProviderPlugins: string[] = []

  constructor() {
    super(profile)
  }

  onActivation(): void {
    this.on('manager' as any, 'pluginActivated', (plugin: { name: string }) => {
      if (plugin.name.startsWith('injected') || plugin.name === 'walletconnect') {
        this._watchProvider(plugin.name)
      }
    })
  }

  onDeactivation(): void {
    this._lockAll()
    for (const name of this.injectedProviderPlugins) {
      try { this.off(name as any, 'accountsChanged') } catch { /* best-effort */ }
    }
    this.injectedProviderPlugins = []
  }

  private _watchProvider(name: string): void {
    if (this.injectedProviderPlugins.includes(name)) return
    this.injectedProviderPlugins.push(name)
    this.on(name as any, 'accountsChanged', (accounts: string[]) => {
      this._onAccountsChanged(accounts)
    })
  }

  private _onAccountsChanged(accounts: string[]): void {
    const newAccount = (accounts[0] ?? '').toLowerCase()
    for (const [purpose, session] of this.sessions) {
      if (session.signerAccount.toLowerCase() !== newAccount) {
        this._lockPurpose(purpose)
      }
    }
  }

  private _lockPurpose(purpose: string): void {
    const session = this.sessions.get(purpose)
    if (!session) return
    wipeBytes(session.signingKeyBytes)
    this.sessions.delete(purpose)
    this.emit('locked', purpose)
  }

  private _lockAll(): void {
    for (const purpose of [...this.sessions.keys()]) this._lockPurpose(purpose)
  }

  private _requireSession(purpose: string): Session {
    const session = this.sessions.get(purpose)
    if (!session) throw new PurposeLockedError(purpose)
    return session
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Prompt the wallet for a deterministic signature and derive keys for
   * `purpose`. Returns the derived signing address so the caller can verify
   * which key was derived without the key leaving the plugin.
   *
   * Concurrent calls for the same purpose share a single wallet popup.
   * Calling unlock on an already-unlocked purpose is a no-op.
   */
  async unlock(params: UnlockParams): Promise<{ address: string }> {
    const { purpose, passphrase, verifyDeterminism = false } = params
    validatePurpose(purpose)

    if (this.sessions.has(purpose)) return { address: this.sessions.get(purpose)!.address }

    if (this.unlockInFlight.has(purpose)) return this.unlockInFlight.get(purpose)!

    const p = this._doUnlock(purpose, passphrase, verifyDeterminism)
    this.unlockInFlight.set(purpose, p)
    try {
      return await p
    } finally {
      this.unlockInFlight.delete(purpose)
    }
  }

  private async _doUnlock(
    purpose: string,
    passphrase: string | undefined,
    verifyDeterminism: boolean
  ): Promise<{ address: string }> {
    const signerAccount: string = await (this as any).call('udappEnv', 'getSelectedAccount')
    if (!signerAccount) throw new WalletNotFoundError()

    const messageHex = textToHex(buildSignMessage(purpose, signerAccount))

    let rawResult: any
    try {
      rawResult = await (this as any).call('web3Provider', 'sendAsync', {
        jsonrpc: '2.0', id: 1,
        method: 'personal_sign',
        params: [messageHex, signerAccount]
      })
    } catch {
      throw new WalletNotFoundError()
    }

    // web3Provider.sendAsync may return { result: '0x...' } or the sig string directly
    const sig1Hex: string = rawResult?.result ?? rawResult
    if (typeof sig1Hex !== 'string' || !sig1Hex.startsWith('0x')) throw new WalletNotFoundError()

    const rs1 = normalizeSignature(sig1Hex)  // throws UnsupportedWalletError if not 65 bytes

    // Determinism check — one popup, result cached per wallet address
    if (verifyDeterminism && !this.determinismCache.has(signerAccount)) {
      let rawResult2: any
      try {
        rawResult2 = await (this as any).call('web3Provider', 'sendAsync', {
          jsonrpc: '2.0', id: 2,
          method: 'personal_sign',
          params: [messageHex, signerAccount]
        })
      } catch {
        throw new WalletNotFoundError()
      }
      const sig2Hex: string = rawResult2?.result ?? rawResult2
      const rs2 = normalizeSignature(sig2Hex)
      const isDeterministic = rs1.every((b, i) => b === rs2[i])
      wipeBytes(rs2)
      if (!isDeterministic) throw new NonDeterministicWalletError()
      this.determinismCache.set(signerAccount, true)
    }

    const { address, signingKeyBytes, encryptionKey } = await deriveSessionKeys(rs1, purpose, passphrase)
    wipeBytes(rs1)

    this.sessions.set(purpose, { address, signingKeyBytes, encryptionKey, signerAccount })
    this.emit('unlocked', purpose)

    return { address }
  }

  isUnlocked(purpose: string): boolean {
    validatePurpose(purpose)
    return this.sessions.has(purpose)
  }

  getAddress(purpose: string): string {
    validatePurpose(purpose)
    return this._requireSession(purpose).address
  }

  lock(purpose?: string): void {
    if (purpose !== undefined) {
      validatePurpose(purpose)
      this._lockPurpose(purpose)
    } else {
      this._lockAll()
    }
  }

  /**
   * Sign `message` with an EIP-191 personal-sign envelope.
   * Returns 0x-prefixed hex (65 bytes: r ‖ s ‖ v).
   * Wire in: message is a plain UTF-8 string.
   */
  async signMessage(purpose: string, message: string): Promise<string> {
    validatePurpose(purpose)
    const { signingKeyBytes } = this._requireSession(purpose)
    const msgBytes = new TextEncoder().encode(message)
    const prefix = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${msgBytes.length}`)
    const combined = new Uint8Array(prefix.length + msgBytes.length)
    combined.set(prefix)
    combined.set(msgBytes, prefix.length)
    const digest = keccak_256(combined)
    const sig = secp256k1.sign(digest, signingKeyBytes, { lowS: true })
    return '0x' + sig.r.toString(16).padStart(64, '0') +
                  sig.s.toString(16).padStart(64, '0') +
                  (sig.recovery + 27).toString(16).padStart(2, '0')
  }

  /**
   * Sign EIP-712 typed data.
   * Wire: typedData is a plain JSON-serialisable object; bigint values in
   * the message must be passed as decimal strings.
   * Returns 0x-prefixed hex signature (65 bytes).
   */
  async signTypedData(
    purpose: string,
    typedData: {
      domain: Record<string, unknown>
      types: Record<string, Array<{ name: string; type: string }>>
      message: Record<string, unknown>
      primaryType: string
    }
  ): Promise<string> {
    validatePurpose(purpose)
    const { signingKeyBytes } = this._requireSession(purpose)
    const hash = TypedDataEncoder.hash(typedData.domain, typedData.types, typedData.message)
    const digest = hexToBytes(hash)
    const sig = secp256k1.sign(digest, signingKeyBytes, { lowS: true })
    return '0x' + sig.r.toString(16).padStart(64, '0') +
                  sig.s.toString(16).padStart(64, '0') +
                  (sig.recovery + 27).toString(16).padStart(2, '0')
  }

  /**
   * Sign and serialise a transaction.
   * Wire: bigint fields (value, gasLimit, gas prices) are decimal strings.
   * Returns 0x-prefixed hex of the signed RLP-encoded transaction.
   */
  async signTransaction(purpose: string, tx: TxRequest): Promise<string> {
    validatePurpose(purpose)
    const { signingKeyBytes } = this._requireSession(purpose)
    const wallet = new EthersWallet(bytesToHex(signingKeyBytes))
    const prepared: Record<string, unknown> = {
      ...(tx.to       !== undefined && { to:       tx.to }),
      ...(tx.from     !== undefined && { from:     tx.from }),
      ...(tx.data     !== undefined && { data:     tx.data }),
      ...(tx.nonce    !== undefined && { nonce:    tx.nonce }),
      ...(tx.chainId  !== undefined && { chainId:  tx.chainId }),
      ...(tx.value                !== undefined && { value:                BigInt(tx.value) }),
      ...(tx.gasLimit             !== undefined && { gasLimit:             BigInt(tx.gasLimit) }),
      ...(tx.maxFeePerGas         !== undefined && { maxFeePerGas:         BigInt(tx.maxFeePerGas) }),
      ...(tx.maxPriorityFeePerGas !== undefined && { maxPriorityFeePerGas: BigInt(tx.maxPriorityFeePerGas) }),
      ...(tx.gasPrice             !== undefined && { gasPrice:             BigInt(tx.gasPrice) }),
    }
    return wallet.signTransaction(prepared)
  }

  /**
   * Encrypt `data` (0x-prefixed hex) with the AES-GCM-256 key for `purpose`.
   * `context` (optional UTF-8 string) is bound as additional authenticated
   * data and must be provided verbatim when decrypting.
   */
  async encrypt(purpose: string, data: string, context?: string): Promise<EncryptedEnvelope> {
    validatePurpose(purpose)
    const { encryptionKey } = this._requireSession(purpose)
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
    const aadBytes = context ? new TextEncoder().encode(context) : new Uint8Array(0)
    const ciphertext = await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aadBytes },
      encryptionKey,
      hexToBytes(data)
    )
    return {
      version: 1,
      ciphertext: bytesToHex(new Uint8Array(ciphertext)),
      iv: bytesToHex(iv),
      aad: bytesToHex(aadBytes)
    }
  }

  /**
   * Decrypt an EncryptedEnvelope. `context` must match what was passed to
   * `encrypt()`. A mismatch or any ciphertext tampering causes decryption to
   * throw (AES-GCM authentication tag failure).
   * Returns 0x-prefixed hex of the plaintext.
   */
  async decrypt(purpose: string, envelope: EncryptedEnvelope, context?: string): Promise<string> {
    validatePurpose(purpose)
    const { encryptionKey } = this._requireSession(purpose)
    if (envelope.version !== 1) throw new Error(`Unknown envelope version: ${envelope.version}`)

    const storedAad = hexToBytes(envelope.aad)
    const providedAad = context ? new TextEncoder().encode(context) : new Uint8Array(0)
    if (storedAad.length !== providedAad.length || !storedAad.every((b, i) => b === providedAad[i])) {
      throw new Error('AES-GCM decryption failed: context mismatch')
    }

    let plaintext: ArrayBuffer
    try {
      plaintext = await globalThis.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: hexToBytes(envelope.iv), additionalData: storedAad },
        encryptionKey,
        hexToBytes(envelope.ciphertext)
      )
    } catch {
      throw new Error('AES-GCM decryption failed: ciphertext may be tampered')
    }
    return bytesToHex(new Uint8Array(plaintext))
  }
}
