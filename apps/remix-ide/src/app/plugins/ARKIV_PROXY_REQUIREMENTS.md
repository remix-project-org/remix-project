# Arkiv Proxy Server Requirements for Chunked File Support

## Overview

The Arkiv proxy server needs to implement two new endpoints to support chunked file uploads and downloads for files larger than 128 KiB. These endpoints should handle all blockchain operations server-side, including wallet signing and transaction management.

## Required Dependencies

The proxy server should use:
- `@arkiv-network/sdk@^1.0.1` - Official Arkiv SDK
- `arkiv-chunking@^1.1.4` - Chunking library for large files

## Endpoint 1: Upload Chunked File

### Endpoint
```
POST /upload-chunked-file
```

### Request Body
```typescript
{
  payload: string,          // Hex-encoded file content (0x...)
  filename: string,         // Original filename (1-255 UTF-8 bytes)
  contentType: string,      // MIME type (e.g., "text/x-solidity")
  attributes?: {            // Optional entity attributes
    app: { type: 'str', value: string },
    name: { type: 'str', value: string },
    path: { type: 'str', value: string },
    // ... other attributes
  },
  expires: ExpiresInput     // Expiration config (see below)
}
```

### ExpiresInput Type
```typescript
type ExpiresInput =
  | { seconds: number }
  | { minutes: number }
  | { hours: number }
  | { days: number }
  | { weeks: number }
  | { months: number }
  | { blocks: number }
  | { atBlock: string }     // decimal bigint string
  | 'permanent'
```

### Response Body
```typescript
{
  manifestKey: string,      // Entity key for the manifest
  txHash: string,          // Transaction hash of the finalization
  chunkCount: number,      // Number of chunks created
  sha256?: string,         // SHA-256 hash of the file (hex)
  expiresAt?: string       // ISO 8601 expiration timestamp
}
```

### Implementation Details

1. **Decode payload**: Convert hex string to Uint8Array
   ```typescript
   const fileBytes = hexToBytes(payload)
   ```

2. **Use arkiv-chunking**:
   ```typescript
   import { uploadFile } from 'arkiv-chunking'
   import { createPublicClient, createWalletClient } from '@arkiv-network/sdk'
   import { rabdi } from '@arkiv-network/sdk/chains'

   const chain = rabdi({ accessKey: SERVER_ARKIV_ACCESS_KEY })

   const publicClient = createPublicClient({
     chain,
     transport: http(),
   })

   const walletClient = createWalletClient({
     chain,
     transport: http(),
     account: privateKeyToAccount(SERVER_PRIVATE_KEY), // Server's signing key
   })

   // Convert ExpiresInput to blocks
   const expirationBlocks = convertToBlocks(expires)

   const result = await uploadFile({
     publicClient,
     walletClient,
     bytes: fileBytes,
     filename,
     contentType,
     expirationBlocks,
   })
   ```

3. **Handle attributes**: The proxy should encode the attributes and attach them to the manifest entity after upload completes.

4. **Error handling**: Return appropriate HTTP status codes:
   - 400: Invalid payload or parameters
   - 413: File too large (>32 MiB limit)
   - 500: Blockchain transaction failed

### Constraints

- Maximum file size: 32 MiB (33,554,432 bytes)
- Maximum chunks: 4,096
- Chunk size: 100,000 bytes (default from arkiv-chunking)
- Filename: 1-255 UTF-8 bytes

## Endpoint 2: Download Chunked File

### Endpoint
```
POST /download-chunked-file
```

### Request Body
```typescript
{
  manifestKey: string,      // Entity key for the manifest
  expectedSha256?: string   // Optional SHA-256 for verification (hex)
}
```

### Response Body
```typescript
{
  payload: string,          // Hex-encoded file content (0x...)
  contentType?: string,     // MIME type from manifest
  filename?: string,        // Original filename from manifest
  sha256?: string          // SHA-256 hash of the file (hex)
}
```

### Implementation Details

1. **Use arkiv-chunking**:
   ```typescript
   import { downloadFile } from 'arkiv-chunking'

   const result = await downloadFile({
     publicClient,
     manifestKey,
     expectedSha256,  // Optional validation
   })
   ```

2. **Encode to hex**:
   ```typescript
   const payloadHex = bytesToHex(result.bytes)
   ```

3. **Return metadata**: Include contentType and filename from the download result.

4. **Error handling**: Return appropriate HTTP status codes:
   - 400: Invalid manifestKey format
   - 404: Manifest or chunks not found
   - 410: Chunks have expired
   - 422: SHA-256 verification failed
   - 500: Download failed

## Security Considerations

### Server-Side Wallet

The proxy server must:
- **Store server-side private key securely** (environment variable, secrets manager, HSM)
- **Never expose the private key** to clients
- **Use a dedicated wallet** for Arkiv operations (separate from user wallets)
- **Implement rate limiting** to prevent abuse
- **Monitor gas costs** and implement spending limits

### Authentication

The proxy should:
- Require authentication for uploads (user sessions)
- Track usage per user for quota management
- Optionally validate that the user is authorized to upload

### Data Privacy

**Important**: All data stored on Arkiv is **public**. The proxy should:
- Warn users before upload that data is public
- Never upload sensitive data, credentials, or private keys
- Sanitize filenames and attributes

## Gas Management

Chunked uploads require **N+2 transactions**:
1. Manifest creation
2. N chunk uploads
3. Finalization

Recommended gas allocation:
- Minimum: 1,000,000 + (400,000 × number of chunks)
- Suggested: 2× measured maximum

The proxy should:
- Estimate gas before starting upload
- Use explicit nonce management for sequential transactions
- Handle transaction failures gracefully
- Implement retry logic per the arkiv-write-safety policy

## Example Conversion Functions

### Hex Encoding/Decoding
```typescript
function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex
  if (h.length % 2 !== 0) throw new Error('Invalid hex string length')
  const arr = new Uint8Array(h.length / 2)
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16)
  }
  return arr
}

function bytesToHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
```

### Expiration to Blocks
```typescript
function convertToBlocks(expires: ExpiresInput): number {
  const SECONDS_PER_BLOCK = 2

  if (expires === 'permanent') {
    return 7_883_970 // Near max lifetime on Rabdi
  }

  if ('blocks' in expires) return expires.blocks
  if ('atBlock' in expires) throw new Error('atBlock not supported by proxy')

  let seconds = 0
  if ('seconds' in expires) seconds = expires.seconds
  else if ('minutes' in expires) seconds = expires.minutes * 60
  else if ('hours' in expires) seconds = expires.hours * 3600
  else if ('days' in expires) seconds = expires.days * 86400
  else if ('weeks' in expires) seconds = expires.weeks * 604800
  else if ('months' in expires) seconds = expires.months * 2592000

  return Math.floor(seconds / SECONDS_PER_BLOCK)
}
```

## Testing

Test cases for the proxy:

1. **Small file** (<128 KiB): Should still work via `/create-entity`
2. **Large file** (>128 KiB, <32 MiB): Should use chunking
3. **Multiple chunks**: Upload file that creates 10+ chunks
4. **Download**: Retrieve and verify SHA-256 matches
5. **Expiration**: Test different expiration formats
6. **Attributes**: Verify custom attributes are preserved
7. **Errors**:
   - File too large (>32 MiB)
   - Invalid hex payload
   - Missing manifestKey
   - Network failures

## Deployment Checklist

- [ ] Deploy `/upload-chunked-file` endpoint
- [ ] Deploy `/download-chunked-file` endpoint
- [ ] Configure server wallet with Rabdi testnet
- [ ] Fund server wallet with test tokens
- [ ] Set `ARKIV_ACCESS_KEY` environment variable
- [ ] Set `ARKIV_PRIVATE_KEY` environment variable (secure!)
- [ ] Enable rate limiting (e.g., 10 uploads per user per hour)
- [ ] Set up monitoring for transaction failures
- [ ] Test on Rabdi testnet before mainnet
- [ ] Update frontend to use new chunking methods

## Frontend Integration

The frontend plugins already call these endpoints via `arkivBasic`:

```typescript
// Upload
const result = await this.call('arkivBasic', 'uploadChunkedFile', {
  payload: bytesToHex(fileBytes),
  filename: 'example.sol',
  contentType: 'text/x-solidity',
  attributes: { app: { type: 'str', value: 'remix' } },
  expires: { days: 30 },
})

// Download
const result = await this.call('arkivBasic', 'downloadChunkedFile', {
  manifestKey: 'entity_key_here',
})
const content = new TextDecoder().decode(hexToBytes(result.payload))
```

## References

- [Arkiv SDK 1.0.1](https://unpkg.com/@arkiv-network/sdk@1.0.1/)
- [arkiv-chunking 1.1.4](https://unpkg.com/arkiv-chunking@1.1.4/)
- [Arkiv Network Documentation](https://docs.arkiv.network/)
- [Rabdi Explorer](https://rabdi.explorer.arkiv.network/)
