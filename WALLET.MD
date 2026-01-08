# Wallet Storage System

Non-custodial wallet storage for Remix IDE users who don't have MetaMask or other wallet extensions.

## Security Model

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT SIDE                             │
├─────────────────────────────────────────────────────────────────┤
│  1. Generate seed phrase (BIP-39, 12 words)                     │
│  2. Derive private key (BIP-32/44, m/44'/60'/0'/0/0)            │
│  3. User enters password                                        │
│  4. Derive encryption key: PBKDF2(password, salt, 100000)       │
│  5. Encrypt private key: AES-256-GCM(key, privateKey)           │
│  6. Encrypt seed phrase: AES-256-GCM(key, seed)                 │
│  7. Send encrypted blobs to server (we never see plaintext)     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         SERVER SIDE                             │
├─────────────────────────────────────────────────────────────────┤
│  1. Receive client-encrypted blob                               │
│  2. Derive per-group key: HMAC-SHA256(SERVER_SECRET, groupId)   │
│  3. Add server encryption: AES-256-GCM(groupKey, blob)          │
│  4. Store double-encrypted blob in S3                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         S3 STORAGE                              │
├─────────────────────────────────────────────────────────────────┤
│  1. AWS SSE-KMS adds third encryption layer                     │
│  2. Path: wallets/{groupId}/{address}/key.enc                   │
│  3. Path: wallets/{groupId}/{address}/seed.enc (optional)       │
│  4. Versioning enabled for recovery                             │
└─────────────────────────────────────────────────────────────────┘
```

## Why This is Secure

| Attack Vector | Protected By |
|---------------|--------------|
| Server breach | Client-side encryption (we can't decrypt) |
| S3 credential leak | Server-side encryption layer |
| Physical disk theft | AWS SSE-KMS |
| Password brute-force | 100,000 PBKDF2 iterations |
| Replay attacks | Random IV per encryption |

## API Endpoints

All endpoints except `/wallet/health` require JWT authentication.

### List Wallets
```
GET /wallet
Authorization: Bearer <jwt>

Response:
{
  "wallets": [
    {
      "id": 1,
      "address": "0xabc123...",
      "name": "My Wallet",
      "isPrimary": true,
      "hasSeedBackup": true,
      "createdAt": "2026-01-05T12:00:00Z",
      "lastUsedAt": "2026-01-05T14:30:00Z"
    }
  ]
}
```

### Create Wallet
```
POST /wallet
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "address": "0xabc123...",
  "encryptedKey": "base64-encoded-client-encrypted-key",
  "encryptedSeed": "base64-encoded-client-encrypted-seed",  // optional
  "salt": "base64-encoded-salt",
  "iterations": 100000,
  "name": "My Wallet"  // optional
}

Response: 201 Created
{
  "id": 1,
  "address": "0xabc123...",
  "name": "My Wallet",
  "isPrimary": true,
  "hasSeedBackup": true,
  "createdAt": "2026-01-05T12:00:00Z",
  "lastUsedAt": null
}
```

### Get Wallet for Unlocking
```
GET /wallet/:address
Authorization: Bearer <jwt>

Response:
{
  "encryptedKey": "base64-client-encrypted-key",
  "salt": "base64-salt",
  "iterations": 100000,
  "address": "0xabc123..."
}
```

### Export Seed Phrase
```
GET /wallet/:address/seed
Authorization: Bearer <jwt>

Response:
{
  "encryptedSeed": "base64-client-encrypted-seed",
  "salt": "base64-salt",
  "iterations": 100000
}

Error (no backup): 404
{
  "error": "NO_SEED_BACKUP",
  "message": "No seed phrase backup available for this wallet"
}
```

### Rename Wallet
```
PUT /wallet/:address
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "name": "Trading Wallet"
}

Response:
{ "success": true }
```

### Set Primary Wallet
```
PUT /wallet/:address/primary
Authorization: Bearer <jwt>

Response:
{ "success": true }
```

### Delete Wallet
```
DELETE /wallet/:address
Authorization: Bearer <jwt>

Response:
{ "success": true }
```

## Client-Side Implementation (Browser)

```typescript
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

```

## Environment Variables

```env
# S3 bucket for wallet storage
WALLET_S3_BUCKET=remix-wallets

# Server-side encryption key (generate with: openssl rand -hex 32)
WALLET_ENCRYPTION_KEY=your-64-character-hex-key

# AWS credentials (reuses existing S3 config)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=...
```

## Database Schema

```sql
CREATE TABLE wallets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    address VARCHAR(42) NOT NULL,
    salt VARCHAR(64) NOT NULL,
    iterations INT NOT NULL DEFAULT 100000,
    key_s3_path VARCHAR(255) NOT NULL,
    seed_s3_path VARCHAR(255) DEFAULT NULL,
    name VARCHAR(100) DEFAULT 'My Wallet',
    is_primary TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP NULL,
    UNIQUE KEY idx_address (address),
    INDEX idx_group_id (group_id),
    FOREIGN KEY (group_id) REFERENCES account_groups(id) ON DELETE CASCADE
);

CREATE TABLE wallet_activity (
    id INT AUTO_INCREMENT PRIMARY KEY,
    wallet_id INT NOT NULL,
    user_id INT DEFAULT NULL,
    action VARCHAR(50) NOT NULL,
    ip_address VARCHAR(45) DEFAULT NULL,
    user_agent TEXT DEFAULT NULL,
    metadata JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_wallet_id (wallet_id),
    FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
);
```

## Recovery Considerations

Since we use client-side encryption, **lost password = lost funds**.

### Recovery Options (Future Enhancement)

1. **Download Backup** - Encrypted JSON file user can store locally
2. **Social Recovery** - Shamir secret sharing with trusted contacts
3. **Email Recovery** - Split recovery key between server and email

For now, users must:
1. Remember their password
2. Optionally export and save their seed phrase

## Unlocking a Wallet (Client-Side)

```typescript
async function unlockWallet(address: string, password: string): Promise<Uint8Array> {
  // 1. Fetch encrypted key from server
  const response = await fetch(`/wallet/${address}`, {
    headers: { 'Authorization': `Bearer ${jwt}` }
  });
  const { encryptedKey, salt, iterations } = await response.json();
  
  // 2. Decode the encrypted blob
  const combined = Uint8Array.from(atob(encryptedKey), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  
  // 3. Derive the same encryption key from password
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  const encryptionKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: Uint8Array.from(atob(salt), c => c.charCodeAt(0)),
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  // 4. Decrypt the private key
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    encryptionKey,
    ciphertext
  );
  
  return new Uint8Array(decrypted); // 32-byte private key
}
```

## Signing Transactions (Client-Side)

```typescript
import { Wallet } from 'ethers';

async function signTransaction(
  privateKey: Uint8Array,
  transaction: {
    to: string;
    value: string;
    data?: string;
    gasLimit?: string;
    gasPrice?: string;
  }
): Promise<string> {
  // Create ethers wallet from private key
  const wallet = new Wallet(privateKey);
  
  // Sign the transaction
  const signedTx = await wallet.signTransaction(transaction);
  
  return signedTx; // Send this to an RPC node
}
```

## Exporting Seed Phrase (Client-Side)

```typescript
async function exportSeedPhrase(address: string, password: string): Promise<string> {
  // 1. Fetch encrypted seed from server
  const response = await fetch(`/wallet/${address}/seed`, {
    headers: { 'Authorization': `Bearer ${jwt}` }
  });
  
  if (!response.ok) {
    throw new Error('No seed backup available');
  }
  
  const { encryptedSeed, salt, iterations } = await response.json();
  
  // 2. Decode and decrypt (same as unlockWallet)
  const combined = Uint8Array.from(atob(encryptedSeed), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  const encryptionKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: Uint8Array.from(atob(salt), c => c.charCodeAt(0)),
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    encryptionKey,
    ciphertext
  );
  
  return new TextDecoder().decode(decrypted); // "apple banana cherry..."
}
```

## Complete User Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                     1. WALLET CREATION                            │
├──────────────────────────────────────────────────────────────────┤
│  User clicks "Create Wallet"                                     │
│       │                                                          │
│       ▼                                                          │
│  Show: "Choose a password for your wallet"                       │
│       │                                                          │
│       ▼                                                          │
│  Generate seed + key in browser                                  │
│       │                                                          │
│       ▼                                                          │
│  Encrypt with password, send to server                           │
│       │                                                          │
│       ▼                                                          │
│  Show: "Your wallet 0xAbc... is ready!"                          │
│       │                                                          │
│       ▼                                                          │
│  Optional: "Save your recovery phrase" (show 12 words)           │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                     2. WALLET UNLOCK                              │
├──────────────────────────────────────────────────────────────────┤
│  User returns, clicks on wallet                                  │
│       │                                                          │
│       ▼                                                          │
│  Show: "Enter your wallet password"                              │
│       │                                                          │
│       ▼                                                          │
│  Fetch encrypted key from server                                 │
│       │                                                          │
│       ▼                                                          │
│  Decrypt in browser with password                                │
│       │                                                          │
│       ▼                                                          │
│  Private key now in memory (until page closes)                   │
│       │                                                          │
│       ▼                                                          │
│  User can sign transactions                                      │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                     3. DEPLOY CONTRACT                            │
├──────────────────────────────────────────────────────────────────┤
│  User clicks "Deploy" on compiled contract                       │
│       │                                                          │
│       ▼                                                          │
│  Build transaction: { to: null, data: bytecode }                 │
│       │                                                          │
│       ▼                                                          │
│  Sign with in-memory private key                                 │
│       │                                                          │
│       ▼                                                          │
│  Send signed tx to RPC node (Infura/Alchemy)                     │
│       │                                                          │
│       ▼                                                          │
│  Wait for receipt, show deployed address                         │
└──────────────────────────────────────────────────────────────────┘
```

## Required NPM Packages

```json
{
  "dependencies": {
    "ethers": "^6.9.0"
  }
}
```

> **Note:** ethers v6 includes built-in BIP-39 mnemonic generation and BIP-32/44 HD wallet derivation, so no additional packages are needed.

## Security Reminders for Frontend

1. **Never log private keys** - not even in development
2. **Clear memory** - set privateKey to null when locking
3. **Use secure contexts** - HTTPS only
4. **Validate addresses** - check checksum before sending
5. **Show warnings** - "This is the only time you'll see your seed phrase"
6. **Password strength** - enforce minimum requirements
