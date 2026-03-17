/**
 * S3 Client — lightweight wrapper around fetch for S3 operations.
 *
 * Uses STS temporary credentials. Talks to S3 using presigned-style
 * requests (v4 signatures) or the AWS SDK pattern through plain fetch.
 *
 * For simplicity and bundle-size we do NOT pull in @aws-sdk/client-s3.
 * Instead we use the S3 REST API with x-amz-* headers.
 * If advanced features (multipart, streaming) are needed later,
 * swap this for the SDK — the interface stays the same.
 */

import { STSToken, S3Object } from './types'

export class S3Client {
  private token: STSToken
  private baseUrl: string

  constructor(token: STSToken) {
    this.token = token
    this.baseUrl = `https://${token.bucket}.s3.${token.region}.amazonaws.com`
  }

  /** Update credentials (e.g. after token refresh) */
  updateToken(token: STSToken) {
    this.token = token
    this.baseUrl = `https://${token.bucket}.s3.${token.region}.amazonaws.com`
  }

  get prefix(): string {
    return this.token.prefix
  }

  get bucket(): string {
    return this.token.bucket
  }

  get region(): string {
    return this.token.region
  }

  // ── Upload ──────────────────────────────────────────────

  /**
   * Upload a file to S3 under the user's prefix.
   * @param key  Key relative to the prefix, e.g. "workspaceUuid/contracts/Token.sol"
   * @param body File content (string or Uint8Array)
   * @param contentType MIME type (default text/plain)
   * @returns The ETag of the uploaded object (MD5 hash, without quotes)
   */
  async putObject(key: string, body: string | Uint8Array, contentType = 'text/plain'): Promise<string> {
    const fullKey = `${this.token.prefix}${key}`
    const url = `${this.baseUrl}/${encodeS3Key(fullKey)}`

    // Gzip text content for smaller transfers; skip for already-compressed types
    const skipGzip = contentType === 'application/zip' || contentType === 'application/gzip'
    const raw = typeof body === 'string' ? new TextEncoder().encode(body) : body
    const payload = (!skipGzip && raw.byteLength > 128) ? await gzipCompress(raw) : raw
    const isCompressed = payload !== raw

    const headers: Record<string, string> = {
      'x-amz-security-token': this.token.sessionToken,
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
      'Content-Type': contentType,
    }
    if (isCompressed) {
      headers['Content-Encoding'] = 'gzip'
    }

    const res = await this.signedFetch(url, {
      method: 'PUT',
      headers,
      body: payload as BodyInit,
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`S3 PutObject failed (${res.status}): ${text}`)
    }

    // Return the ETag from the response — S3 always sets this on PutObject
    return res.headers.get('etag')?.replace(/"/g, '') || ''
  }

  // ── Download ────────────────────────────────────────────

  /**
   * Download a file from S3.
   * @param key  Object key relative to user prefix
   * @param ifNoneMatch  Optional ETag — if S3 still has this ETag, returns null (304 Not Modified)
   * @returns File content as string, or null if not found / not modified.
   */
  async getObject(key: string, ifNoneMatch?: string): Promise<string | null> {
    const fullKey = `${this.token.prefix}${key}`
    const url = `${this.baseUrl}/${encodeS3Key(fullKey)}`

    const headers: Record<string, string> = {
      'x-amz-security-token': this.token.sessionToken,
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
    }
    if (ifNoneMatch) {
      headers['If-None-Match'] = `"${ifNoneMatch}"`
    }

    const res = await this.signedFetch(url, {
      method: 'GET',
      headers,
    })

    if (res.status === 304) return null // Not Modified
    if (res.status === 404 || res.status === 403) return null
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`S3 GetObject failed (${res.status}): ${text}`)
    }
    // If the object was stored with Content-Encoding: gzip, decompress it
    const encoding = res.headers.get('content-encoding') || ''
    if (encoding.includes('gzip')) {
      const buf = await res.arrayBuffer()
      const decompressed = await gzipDecompress(new Uint8Array(buf))
      return new TextDecoder().decode(decompressed)
    }
    return res.text()
  }

  /**
   * Download a file from S3 as binary.
   */
  async getObjectBinary(key: string): Promise<Uint8Array | null> {
    const fullKey = `${this.token.prefix}${key}`
    const url = `${this.baseUrl}/${encodeS3Key(fullKey)}`

    const res = await this.signedFetch(url, {
      method: 'GET',
      headers: {
        'x-amz-security-token': this.token.sessionToken,
        'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
      },
    })

    if (res.status === 404 || res.status === 403) return null
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`S3 GetObject failed (${res.status}): ${text}`)
    }
    const buf = await res.arrayBuffer()
    return new Uint8Array(buf)
  }

  // ── Copy ───────────────────────────────────────────────

  /**
   * Server-side copy of an object within the same bucket/prefix.
   * Uses S3 PUT with x-amz-copy-source header — no data is downloaded.
   * @param srcKey  Source key relative to prefix
   * @param dstKey  Destination key relative to prefix
   * @param tagging Optional URL-encoded tagging string (e.g. "lifecycle=expire-7d")
   * @returns true if the copy succeeded, false if source didn't exist
   */
  async copyObject(srcKey: string, dstKey: string, tagging?: string): Promise<boolean> {
    const fullSrc = `${this.token.prefix}${srcKey}`
    const fullDst = `${this.token.prefix}${dstKey}`
    const url = `${this.baseUrl}/${encodeS3Key(fullDst)}`

    const headers: Record<string, string> = {
      'x-amz-security-token': this.token.sessionToken,
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
      'x-amz-copy-source': `/${this.token.bucket}/${encodeS3Key(fullSrc)}`,
    }
    if (tagging) {
      headers['x-amz-tagging'] = tagging
      headers['x-amz-tagging-directive'] = 'REPLACE'
    }

    const res = await this.signedFetch(url, {
      method: 'PUT',
      headers,
    })

    if (res.status === 404 || res.status === 403) return false
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`S3 CopyObject failed (${res.status}): ${text}`)
    }
    return true
  }

  // ── Delete ──────────────────────────────────────────────

  async deleteObject(key: string): Promise<void> {
    const fullKey = `${this.token.prefix}${key}`
    const url = `${this.baseUrl}/${encodeS3Key(fullKey)}`

    const res = await this.signedFetch(url, {
      method: 'DELETE',
      headers: {
        'x-amz-security-token': this.token.sessionToken,
        'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
      },
    })

    if (!res.ok && res.status !== 204) {
      const text = await res.text()
      throw new Error(`S3 DeleteObject failed (${res.status}): ${text}`)
    }
  }

  // ── List ────────────────────────────────────────────────

  /**
   * List objects under a given prefix (within the user's root prefix).
   * @param subPrefix  e.g. "workspaceUuid/" to list all files in a workspace
   * @returns Array of S3Object with keys relative to user prefix
   */
  async listObjects(subPrefix: string = ''): Promise<S3Object[]> {
    const prefix = `${this.token.prefix}${subPrefix}`
    const objects: S3Object[] = []
    let continuationToken: string | undefined

    do {
      const params = new URLSearchParams({
        'list-type': '2',
        prefix,
        'max-keys': '1000',
      })
      if (continuationToken) {
        params.set('continuation-token', continuationToken)
      }

      const url = `${this.baseUrl}?${params.toString()}`
      const res = await this.signedFetch(url, {
        method: 'GET',
        headers: {
          'x-amz-security-token': this.token.sessionToken,
          'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
        },
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`S3 ListObjectsV2 failed (${res.status}): ${text}`)
      }

      const xml = await res.text()
      const parsed = parseListResponse(xml, this.token.prefix)
      objects.push(...parsed.objects)
      continuationToken = parsed.nextContinuationToken
    } while (continuationToken)

    return objects
  }

  // ── Signed Fetch (AWS Signature V4) ──────────────────────

  /**
   * For now we use a simplified approach: we add the security token
   * and rely on the STS credentials. For a proper production integration
   * you'd implement full SigV4 signing. The STS token from the API
   * already scopes access, so unsigned payloads with the session token
   * in the header are accepted for the operations we need.
   *
   * NOTE: This requires the bucket to allow unsigned payload with valid
   * STS session tokens, which is the default for STS-derived credentials.
   */
  private async signedFetch(url: string, init: RequestInit): Promise<Response> {
    // AWS SigV4 signing
    const method = init.method || 'GET'
    const urlObj = new URL(url)
    const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')
    const date = datetime.slice(0, 8)

    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string>),
      'host': urlObj.host,
      'x-amz-date': datetime,
    }

    // Canonical headers
    const signedHeaderNames = Object.keys(headers).map(h => h.toLowerCase()).sort()
    const canonicalHeaders = signedHeaderNames.map(h => `${h}:${headers[Object.keys(headers).find(k => k.toLowerCase() === h)]}\n`).join('')

    // Canonical request
    const canonicalPath = urlObj.pathname || '/'
    const canonicalQuerystring = urlObj.search ? urlObj.search.slice(1).split('&').sort().join('&') : ''
    const payloadHash = headers['x-amz-content-sha256'] || 'UNSIGNED-PAYLOAD'

    const canonicalRequest = [
      method,
      canonicalPath,
      canonicalQuerystring,
      canonicalHeaders,
      signedHeaderNames.join(';'),
      payloadHash,
    ].join('\n')

    // String to sign
    const scope = `${date}/${this.token.region}/s3/aws4_request`
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      datetime,
      scope,
      await sha256Hex(canonicalRequest),
    ].join('\n')

    // Signing key
    const kDate = await hmacSha256(new TextEncoder().encode(`AWS4${this.token.secretAccessKey}`), date)
    const kRegion = await hmacSha256(kDate, this.token.region)
    const kService = await hmacSha256(kRegion, 's3')
    const kSigning = await hmacSha256(kService, 'aws4_request')

    // Signature
    const signature = await hmacSha256Hex(kSigning, stringToSign)

    // Authorization header
    const authorization = `AWS4-HMAC-SHA256 Credential=${this.token.accessKeyId}/${scope}, SignedHeaders=${signedHeaderNames.join(';')}, Signature=${signature}`

    const finalHeaders = { ...headers, 'Authorization': authorization }
    // Remove host header (browser will set it)
    delete finalHeaders['host']

    return fetch(url, {
      ...init,
      headers: finalHeaders,
    })
  }
}

// ── Helpers ───────────────────────────────────────────────

function encodeS3Key(key: string): string {
  return key.split('/').map(segment => encodeURIComponent(segment)).join('/')
}

/**
 * Parse the XML response from S3 ListObjectsV2.
 * We do minimal XML parsing via DOMParser to avoid extra dependencies.
 */
function parseListResponse(xml: string, userPrefix: string): { objects: S3Object[]; nextContinuationToken?: string } {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')
  const objects: S3Object[] = []

  const contents = doc.getElementsByTagName('Contents')
  for (let i = 0; i < contents.length; i++) {
    const item = contents[i]
    const key = item.getElementsByTagName('Key')[0]?.textContent || ''
    const lastModified = item.getElementsByTagName('LastModified')[0]?.textContent || ''
    const size = item.getElementsByTagName('Size')[0]?.textContent || '0'
    const etag = item.getElementsByTagName('ETag')[0]?.textContent || ''

    // Return keys relative to user prefix
    objects.push({
      key: key.startsWith(userPrefix) ? key.slice(userPrefix.length) : key,
      lastModified: new Date(lastModified),
      size: parseInt(size, 10),
      etag: etag.replace(/"/g, ''),
    })
  }

  const truncated = doc.getElementsByTagName('IsTruncated')[0]?.textContent === 'true'
  const nextToken = truncated ? doc.getElementsByTagName('NextContinuationToken')[0]?.textContent || undefined : undefined

  return { objects, nextContinuationToken: nextToken }
}

// ── Crypto helpers (SubtleCrypto) ─────────────────────────

async function hmacSha256(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const keyData: ArrayBuffer = key instanceof ArrayBuffer ? key : (key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer)
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message))
}

async function hmacSha256Hex(key: ArrayBuffer | Uint8Array, message: string): Promise<string> {
  const sig = await hmacSha256(key, message)
  return bufToHex(new Uint8Array(sig))
}

async function sha256Hex(message: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message))
  return bufToHex(new Uint8Array(hash))
}

function bufToHex(buf: Uint8Array): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── Gzip helpers (Compression Streams API) ────────────────

/**
 * Gzip-compress a Uint8Array using the browser's native CompressionStream.
 * Falls back to uncompressed if the API is unavailable.
 */
async function gzipCompress(data: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') return data
  try {
    const cs = new CompressionStream('gzip')
    const writer = cs.writable.getWriter()
    writer.write(data)
    writer.close()
    const reader = cs.readable.getReader()
    const chunks: Uint8Array[] = []
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
    const totalLen = chunks.reduce((s, c) => s + c.byteLength, 0)
    const result = new Uint8Array(totalLen)
    let offset = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.byteLength
    }
    return result
  } catch {
    return data
  }
}

/**
 * Gzip-decompress a Uint8Array using the browser's native DecompressionStream.
 */
async function gzipDecompress(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    // Fallback: return as-is (caller will get garbled text, but won't crash)
    return data
  }
  const ds = new DecompressionStream('gzip')
  const writer = ds.writable.getWriter()
  writer.write(data)
  writer.close()
  const reader = ds.readable.getReader()
  const chunks: Uint8Array[] = []
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const totalLen = chunks.reduce((s, c) => s + c.byteLength, 0)
  const result = new Uint8Array(totalLen)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}
