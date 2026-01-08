/**
 * Wallet Crypto Utilities
 * Client-side encryption/decryption for secure wallet storage
 * 
 * Security Model:
 * - Keys are generated and encrypted entirely client-side
 * - Server only stores encrypted blobs (can't decrypt)
 * - Password-based key derivation using PBKDF2
 * - AES-256-GCM for encryption
 */

import { Mnemonic, HDNodeWallet, randomBytes, hexlify, getBytes } from 'ethers'
import { WalletError, WalletErrorCodes } from '@remix-api'

// Constants
const PBKDF2_ITERATIONS = 100000
const AES_KEY_LENGTH = 256
const SALT_LENGTH = 32
const IV_LENGTH = 12

/**
 * Result of wallet generation
 */
export interface GeneratedWallet {
  address: string
  privateKey: Uint8Array
  mnemonic: string
}

/**
 * Encrypted wallet data ready to be stored
 */
export interface EncryptedWalletData {
  address: string
  encryptedKey: string
  encryptedSeed: string
  salt: string
  iterations: number
}

/**
 * Generate a new wallet with mnemonic and derived keys
 */
export async function generateWallet(): Promise<GeneratedWallet> {
  // Generate 12-word mnemonic (128 bits of entropy)
  const mnemonic = Mnemonic.fromEntropy(randomBytes(16))
  
  // Create HD wallet and derive the first account
  // Path: m/44'/60'/0'/0/0 (standard Ethereum derivation path)
  const hdWallet = HDNodeWallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/0")
  
  const privateKey = getBytes(hdWallet.privateKey)
  const address = hdWallet.address
  
  return {
    address,
    privateKey,
    mnemonic: mnemonic.phrase
  }
}

/**
 * Recover wallet from mnemonic phrase
 */
export async function recoverWalletFromMnemonic(mnemonicPhrase: string): Promise<GeneratedWallet> {
  // Validate and create mnemonic
  let mnemonic: Mnemonic
  try {
    mnemonic = Mnemonic.fromPhrase(mnemonicPhrase.trim())
  } catch (error) {
    throw new WalletError('Invalid mnemonic phrase', WalletErrorCodes.INVALID_MNEMONIC)
  }
  
  // Create HD wallet and derive the first account
  const hdWallet = HDNodeWallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/0")
  
  const privateKey = getBytes(hdWallet.privateKey)
  const address = hdWallet.address
  
  return {
    address,
    privateKey,
    mnemonic: mnemonic.phrase
  }
}

/**
 * Derive an AES encryption key from password using PBKDF2
 */
async function deriveEncryptionKey(
  password: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  
  // Derive AES key
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypt data using AES-256-GCM
 * Returns base64 encoded string containing IV + ciphertext
 */
async function encrypt(
  key: CryptoKey,
  data: Uint8Array
): Promise<string> {
  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  
  // Encrypt
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data.buffer as ArrayBuffer
  )
  
  // Combine IV and ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), iv.length)
  
  // Return as base64
  return btoa(String.fromCharCode(...combined))
}

/**
 * Decrypt data that was encrypted with AES-256-GCM
 */
async function decrypt(
  key: CryptoKey,
  encryptedData: string
): Promise<Uint8Array> {
  // Decode base64
  const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0))
  
  // Extract IV and ciphertext
  const iv = combined.slice(0, IV_LENGTH)
  const ciphertext = combined.slice(IV_LENGTH)
  
  // Decrypt
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext.buffer as ArrayBuffer
    )
    return new Uint8Array(decrypted)
  } catch (error) {
    throw new WalletError('Invalid password or corrupted data', WalletErrorCodes.DECRYPTION_FAILED)
  }
}

/**
 * Encrypt a wallet's private key and seed phrase for secure storage
 */
export async function encryptWallet(
  wallet: GeneratedWallet,
  password: string
): Promise<EncryptedWalletData> {
  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  
  // Derive encryption key
  const encryptionKey = await deriveEncryptionKey(password, salt, PBKDF2_ITERATIONS)
  
  // Encrypt private key
  const encryptedKey = await encrypt(encryptionKey, wallet.privateKey)
  
  // Encrypt seed phrase
  const seedBytes = new TextEncoder().encode(wallet.mnemonic)
  const encryptedSeed = await encrypt(encryptionKey, seedBytes)
  
  return {
    address: wallet.address,
    encryptedKey,
    encryptedSeed,
    salt: btoa(String.fromCharCode(...salt)),
    iterations: PBKDF2_ITERATIONS
  }
}

/**
 * Decrypt a private key from encrypted storage
 */
export async function decryptPrivateKey(
  encryptedKey: string,
  salt: string,
  iterations: number,
  password: string
): Promise<Uint8Array> {
  // Decode salt
  const saltBytes = Uint8Array.from(atob(salt), c => c.charCodeAt(0))
  
  // Derive encryption key
  const encryptionKey = await deriveEncryptionKey(password, saltBytes, iterations)
  
  // Decrypt private key
  return decrypt(encryptionKey, encryptedKey)
}

/**
 * Decrypt a seed phrase from encrypted storage
 */
export async function decryptSeedPhrase(
  encryptedSeed: string,
  salt: string,
  iterations: number,
  password: string
): Promise<string> {
  // Decode salt
  const saltBytes = Uint8Array.from(atob(salt), c => c.charCodeAt(0))
  
  // Derive encryption key
  const encryptionKey = await deriveEncryptionKey(password, saltBytes, iterations)
  
  // Decrypt seed phrase
  const decrypted = await decrypt(encryptionKey, encryptedSeed)
  
  return new TextDecoder().decode(decrypted)
}

/**
 * Validate password strength
 * Returns null if valid, or error message if invalid
 */
export function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return 'Password must be at least 8 characters long'
  }
  
  // Check for at least one number
  if (!/\d/.test(password)) {
    return 'Password must contain at least one number'
  }
  
  // Check for at least one letter
  if (!/[a-zA-Z]/.test(password)) {
    return 'Password must contain at least one letter'
  }
  
  return null
}

/**
 * Securely clear sensitive data from memory
 * Note: This is best-effort as JavaScript doesn't guarantee immediate memory clearing
 */
export function clearSensitiveData(data: Uint8Array | null): void {
  if (data) {
    data.fill(0)
  }
}
