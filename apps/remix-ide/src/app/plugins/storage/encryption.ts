/**
 * Client-Side Encryption Module for Cloud Storage
 *
 * Provides zero-knowledge encryption using Web Crypto API.
 * The encryption key is derived from a user passphrase and NEVER leaves the browser.
 *
 * Algorithm: AES-256-GCM with PBKDF2 key derivation
 * - PBKDF2: 100,000 iterations with SHA-256
 * - AES-GCM: 256-bit key, 96-bit IV, 128-bit auth tag
 */

const PBKDF2_ITERATIONS = 100000
const SALT_LENGTH = 16 // 128 bits
const IV_LENGTH = 12 // 96 bits (recommended for GCM)
const SESSION_STORAGE_KEY = 'remix-cloud-encryption-key'
const ENCRYPTION_ENABLED_KEY = 'remix-cloud-encryption-enabled'

/**
 * Encrypted data format stored in S3
 */
export interface EncryptedPayload {
  /** Version for future format changes */
  version: 1
  /** Base64-encoded salt used for key derivation */
  salt: string
  /** Base64-encoded IV used for encryption */
  iv: string
  /** Base64-encoded ciphertext (includes GCM auth tag) */
  ciphertext: string
}

/**
 * Generate a random passphrase that users can save
 * Format: 6 words from a simple wordlist, easy to write down
 */
export function generatePassphrase(): string {
  const words = [
    'alpha', 'brave', 'coral', 'delta', 'eagle', 'frost', 'grace', 'honor',
    'ivory', 'jewel', 'karma', 'lunar', 'maple', 'noble', 'ocean', 'pearl',
    'quiet', 'river', 'solar', 'tiger', 'ultra', 'vivid', 'water', 'xenon',
    'yacht', 'zebra', 'amber', 'blaze', 'crest', 'dream', 'ember', 'flora',
    'globe', 'haven', 'india', 'joker', 'knight', 'lotus', 'metro', 'nexus',
    'orbit', 'prism', 'quest', 'realm', 'storm', 'torch', 'unity', 'vapor',
    'wave', 'xray', 'yield', 'zephyr', 'azure', 'brook', 'cloud', 'dusk',
    'epoch', 'flame', 'grain', 'haze', 'iris', 'jade', 'kite', 'light'
  ]

  const randomWords: string[] = []
  const array = new Uint32Array(6)
  crypto.getRandomValues(array)

  for (let i = 0; i < 6; i++) {
    randomWords.push(words[array[i] % words.length])
  }

  return randomWords.join('-')
}

/**
 * Generate a random salt for key derivation
 */
function generateSalt(): Uint8Array {
  const salt = new Uint8Array(SALT_LENGTH)
  crypto.getRandomValues(salt)
  return salt
}

/**
 * Generate a random IV for encryption
 */
function generateIV(): Uint8Array {
  const iv = new Uint8Array(IV_LENGTH)
  crypto.getRandomValues(iv)
  return iv
}

/**
 * Convert Uint8Array to base64 string
 */
function toBase64(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
}

/**
 * Convert base64 string to Uint8Array
 */
function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Derive an AES-256 key from a passphrase using PBKDF2
 */
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  // Import passphrase as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  // Derive AES-GCM key
  // Use ArrayBuffer slice to ensure proper buffer type
  const saltBuffer = new Uint8Array(salt).buffer as ArrayBuffer
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false, // not extractable
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypt data using AES-256-GCM
 *
 * @param data - Data to encrypt (Uint8Array)
 * @param passphrase - User's encryption passphrase
 * @returns Encrypted payload with salt, IV, and ciphertext
 */
export async function encrypt(data: Uint8Array, passphrase: string): Promise<EncryptedPayload> {
  const salt = generateSalt()
  const iv = generateIV()

  const key = await deriveKey(passphrase, salt)

  // Convert to ArrayBuffer for Web Crypto API
  const ivBuffer = new Uint8Array(iv).buffer as ArrayBuffer
  const dataBuffer = new Uint8Array(data).buffer as ArrayBuffer

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBuffer },
    key,
    dataBuffer
  )

  return {
    version: 1,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext))
  }
}

/**
 * Decrypt data using AES-256-GCM
 *
 * @param payload - Encrypted payload from encrypt()
 * @param passphrase - User's encryption passphrase
 * @returns Decrypted data as Uint8Array
 * @throws Error if decryption fails (wrong passphrase or corrupted data)
 */
export async function decrypt(payload: EncryptedPayload, passphrase: string): Promise<Uint8Array> {
  if (payload.version !== 1) {
    throw new Error(`Unsupported encryption version: ${payload.version}`)
  }

  const salt = fromBase64(payload.salt)
  const iv = fromBase64(payload.iv)
  const ciphertext = fromBase64(payload.ciphertext)

  const key = await deriveKey(passphrase, salt)

  // Convert to ArrayBuffer for Web Crypto API
  const ivBuffer = new Uint8Array(iv).buffer as ArrayBuffer
  const ciphertextBuffer = new Uint8Array(ciphertext).buffer as ArrayBuffer

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBuffer },
      key,
      ciphertextBuffer
    )

    return new Uint8Array(decrypted)
  } catch (e) {
    throw new Error('Decryption failed. Wrong passphrase or corrupted data.')
  }
}

/**
 * Encrypt data and serialize to a single Uint8Array for storage
 * Format: [version(1)][salt(16)][iv(12)][ciphertext(...)]
 */
export async function encryptToBytes(data: Uint8Array, passphrase: string): Promise<Uint8Array> {
  const payload = await encrypt(data, passphrase)

  const salt = fromBase64(payload.salt)
  const iv = fromBase64(payload.iv)
  const ciphertext = fromBase64(payload.ciphertext)

  // Combine into single buffer: version + salt + iv + ciphertext
  const result = new Uint8Array(1 + SALT_LENGTH + IV_LENGTH + ciphertext.length)
  result[0] = payload.version
  result.set(salt, 1)
  result.set(iv, 1 + SALT_LENGTH)
  result.set(ciphertext, 1 + SALT_LENGTH + IV_LENGTH)

  return result
}

/**
 * Decrypt data from serialized Uint8Array format
 */
export async function decryptFromBytes(encryptedData: Uint8Array, passphrase: string): Promise<Uint8Array> {
  const version = encryptedData[0]
  if (version !== 1) {
    throw new Error(`Unsupported encryption version: ${version}`)
  }

  const salt = encryptedData.slice(1, 1 + SALT_LENGTH)
  const iv = encryptedData.slice(1 + SALT_LENGTH, 1 + SALT_LENGTH + IV_LENGTH)
  const ciphertext = encryptedData.slice(1 + SALT_LENGTH + IV_LENGTH)

  const payload: EncryptedPayload = {
    version: 1,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext)
  }

  return decrypt(payload, passphrase)
}

// ==================== Session Storage Helpers ====================

/**
 * Store the passphrase in sessionStorage (survives page refresh, cleared on tab close)
 * Note: We store the passphrase, not the derived key, so we can re-derive with different salts
 */
export function storePassphraseInSession(passphrase: string): void {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, passphrase)
  } catch (e) {
    console.warn('[Encryption] Could not store passphrase in sessionStorage:', e)
  }
}

/**
 * Get the stored passphrase from sessionStorage
 */
export function getPassphraseFromSession(): string | null {
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY)
  } catch (e) {
    return null
  }
}

/**
 * Clear the stored passphrase from sessionStorage
 */
export function clearPassphraseFromSession(): void {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
  } catch (e) {
    // Ignore
  }
}

/**
 * Check if encryption is enabled for this user
 */
export function isEncryptionEnabled(): boolean {
  try {
    return localStorage.getItem(ENCRYPTION_ENABLED_KEY) === 'true'
  } catch (e) {
    return false
  }
}

/**
 * Set whether encryption is enabled
 */
export function setEncryptionEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem(ENCRYPTION_ENABLED_KEY, 'true')
    } else {
      localStorage.removeItem(ENCRYPTION_ENABLED_KEY)
    }
  } catch (e) {
    console.warn('[Encryption] Could not save encryption setting:', e)
  }
}

/**
 * Check if we have a passphrase available (either in session or needs to be entered)
 */
export function hasPassphraseAvailable(): boolean {
  return getPassphraseFromSession() !== null
}
