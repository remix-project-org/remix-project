/**
 * S3 Storage Provider
 * Uses STS temporary credentials + AWS SDK for direct S3 access.
 * Upload, download, delete, list, and metadata go straight to S3.
 * Health and config still go through the storage API.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand
} from '@aws-sdk/client-s3'
import {
  ApiClient,
  StorageApiService,
  StorageConfig,
  StorageFile,
  StorageFilesResponse,
  StorageListOptions,
  STSToken
} from '@remix-api'
import {
  IStorageProvider,
  getMimeType,
  parsePath,
  joinPath
} from './types'

/**
 * Minimum time (ms) before expiration to trigger a token refresh.
 */
const STS_REFRESH_MARGIN_MS = 60_000

export class S3StorageProvider implements IStorageProvider {
  readonly name = 's3'

  private storageApi: StorageApiService
  private config: StorageConfig | null = null

  /** Cached STS token — refreshed automatically */
  private stsToken: STSToken | null = null
  /** Cached S3Client — recreated when STS token refreshes */
  private s3: S3Client | null = null

  constructor(
    private apiClient: ApiClient,
    private getToken: () => Promise<string | null>
  ) {
    this.storageApi = new StorageApiService(apiClient)
  }

  // ===================== Token management =====================

  /**
   * Ensure the API client has a valid JWT (for /sts/token, /health, /config)
   */
  private async ensureToken(): Promise<void> {
    const token = await this.getToken()
    if (token) {
      this.apiClient.setToken(token)
    }
  }

  /**
   * Return a valid STS token, refreshing if necessary.
   * Also (re)creates the S3Client when the token changes.
   */
  private async ensureStsToken(): Promise<STSToken> {
    if (this.stsToken && !this.isStsTokenExpiring()) {
      return this.stsToken
    }

    await this.ensureToken()
    console.log('[S3StorageProvider] Requesting new STS token…')
    const response = await this.storageApi.getStsToken()

    if (!response.ok || !response.data) {
      throw new Error(response.error || 'Failed to obtain STS token')
    }

    this.stsToken = response.data

    // (Re)create the S3 client with fresh credentials
    this.s3 = new S3Client({
      region: this.stsToken.region,
      credentials: {
        accessKeyId: this.stsToken.accessKeyId,
        secretAccessKey: this.stsToken.secretAccessKey,
        sessionToken: this.stsToken.sessionToken,
      },
    })

    console.log(
      `[S3StorageProvider] STS token acquired — bucket=${this.stsToken.bucket}, ` +
      `prefix=${this.stsToken.prefix}, expires=${this.stsToken.expiration}`
    )

    return this.stsToken
  }

  /**
   * Returns true when the current STS token is about to expire
   * (or has already expired).
   */
  private isStsTokenExpiring(): boolean {
    if (!this.stsToken) return true
    return new Date(this.stsToken.expiration).getTime() < Date.now() + STS_REFRESH_MARGIN_MS
  }

  /**
   * Build the full S3 object key from a caller-supplied relative path.
   * E.g. "backups/ws.zip" → "users/42/backups/ws.zip"
   */
  private s3Key(token: STSToken, relativePath: string): string {
    // Strip leading slash if present
    const clean = relativePath.replace(/^\/+/, '')
    return `${token.prefix}${clean}`
  }

  // ===================== Public helpers =====================

  /**
   * Get the underlying storage API service (still used by the plugin for
   * endpoints that don't have an S3 equivalent, e.g. /workspaces)
   */
  getStorageApi(): StorageApiService {
    return this.storageApi
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.ensureToken()
      const response = await this.storageApi.health()
      return response.ok && response.data?.ok === true
    } catch (error) {
      console.error('[S3StorageProvider] Health check failed:', error)
      return false
    }
  }

  async getConfig(): Promise<StorageConfig | null> {
    try {
      await this.ensureToken()

      if (this.config) return this.config

      const response = await this.storageApi.getConfig()
      if (response.ok && response.data) {
        this.config = response.data
        return this.config
      }

      console.error('[S3StorageProvider] Failed to get config:', response.error)
      return null
    } catch (error) {
      console.error('[S3StorageProvider] getConfig error:', error)
      return null
    }
  }

  // ===================== Upload =====================

  async upload(
    path: string,
    content: string | Uint8Array,
    contentType?: string,
    metadata?: Record<string, string>
  ): Promise<string> {
    const token = await this.ensureStsToken()
    const { filename } = parsePath(path)
    const mimeType = contentType || getMimeType(filename)
    const key = this.s3Key(token, path)

    const body = typeof content === 'string'
      ? new TextEncoder().encode(content)
      : content

    console.log(`[S3StorageProvider] Uploading via STS: ${key}`)

    const result = await this.s3!.send(new PutObjectCommand({
      Bucket: token.bucket,
      Key: key,
      Body: body,
      ContentType: mimeType,
      Metadata: metadata,
    }))

    const etag = result.ETag?.replace(/"/g, '') ?? null
    console.log(`[S3StorageProvider] Upload successful: ${key}, ETag: ${etag}`)
    // Return the relative path (without user prefix) for consistency
    // with download/list/delete which all accept relative paths
    return path
  }

  async uploadWithEtag(
    path: string,
    content: string | Uint8Array,
    contentType?: string,
    metadata?: Record<string, string>
  ): Promise<{ key: string; etag: string | null }> {
    const token = await this.ensureStsToken()
    const { filename } = parsePath(path)
    const mimeType = contentType || getMimeType(filename)
    const key = this.s3Key(token, path)

    const body = typeof content === 'string'
      ? new TextEncoder().encode(content)
      : content

    const result = await this.s3!.send(new PutObjectCommand({
      Bucket: token.bucket,
      Key: key,
      Body: body,
      ContentType: mimeType,
      Metadata: metadata,
    }))

    const etag = result.ETag?.replace(/"/g, '') ?? null
    console.log(`[S3StorageProvider] Upload successful: ${key}, ETag: ${etag}`)
    // Return relative path (without user prefix) for consistency
    return { key: path, etag }
  }

  // ===================== Download =====================

  async download(path: string): Promise<string> {
    const token = await this.ensureStsToken()
    const key = this.s3Key(token, path)

    console.log(`[S3StorageProvider] Downloading via STS: ${key}`)

    const result = await this.s3!.send(new GetObjectCommand({
      Bucket: token.bucket,
      Key: key,
    }))

    if (!result.Body) {
      throw new Error(`S3 download returned empty body for key: ${key}`)
    }

    return await result.Body.transformToString('utf-8')
  }

  async downloadBinary(path: string): Promise<Uint8Array> {
    const token = await this.ensureStsToken()
    const key = this.s3Key(token, path)

    console.log(`[S3StorageProvider] Downloading binary via STS: ${key}`)

    const result = await this.s3!.send(new GetObjectCommand({
      Bucket: token.bucket,
      Key: key,
    }))

    if (!result.Body) {
      throw new Error(`S3 download returned empty body for key: ${key}`)
    }

    return new Uint8Array(await result.Body.transformToByteArray())
  }

  // ===================== Delete =====================

  async delete(path: string): Promise<void> {
    const token = await this.ensureStsToken()
    const key = this.s3Key(token, path)

    console.log(`[S3StorageProvider] Deleting via STS: ${key}`)

    await this.s3!.send(new DeleteObjectCommand({
      Bucket: token.bucket,
      Key: key,
    }))
  }

  // ===================== List =====================

  async list(options?: StorageListOptions): Promise<StorageFilesResponse> {
    const token = await this.ensureStsToken()

    // Build prefix: user prefix + optional folder filter
    let prefix = token.prefix
    if (options?.folder) {
      const folder = options.folder.replace(/^\/+/, '')
      prefix = `${token.prefix}${folder}`
      // ensure it ends with /
      if (!prefix.endsWith('/')) prefix += '/'
    }

    const result = await this.s3!.send(new ListObjectsV2Command({
      Bucket: token.bucket,
      Prefix: prefix,
      MaxKeys: options?.limit,
      ContinuationToken: options?.cursor || undefined,
    }))

    const files: StorageFile[] = (result.Contents || []).map((obj) => {
      // Remove the user prefix to get the relative key
      const relativeKey = obj.Key?.replace(token.prefix, '') || ''
      const { folder, filename } = parsePath(relativeKey)

      return {
        filename,
        folder: folder || '',
        key: relativeKey,
        contentType: getMimeType(filename),
        size: obj.Size ?? 0,
        uploadedAt: obj.LastModified?.toISOString() || '',
        lastModified: obj.LastModified?.toISOString() || '',
        etag: obj.ETag?.replace(/"/g, ''),
      }
    })

    const totalSize = files.reduce((sum, f) => sum + f.size, 0)

    return {
      files,
      totalSize,
      totalCount: result.KeyCount ?? files.length,
      nextCursor: result.NextContinuationToken,
    }
  }

  // ===================== Metadata / Exists =====================

  async getMetadata(path: string): Promise<StorageFile | null> {
    const token = await this.ensureStsToken()
    const key = this.s3Key(token, path)

    try {
      const result = await this.s3!.send(new HeadObjectCommand({
        Bucket: token.bucket,
        Key: key,
      }))

      const relativeKey = path.replace(/^\/+/, '')
      const { folder, filename } = parsePath(relativeKey)

      return {
        filename,
        folder: folder || '',
        key: relativeKey,
        contentType: result.ContentType || getMimeType(filename),
        size: result.ContentLength ?? 0,
        uploadedAt: result.LastModified?.toISOString() || '',
        lastModified: result.LastModified?.toISOString() || '',
        etag: result.ETag?.replace(/"/g, ''),
        metadata: result.Metadata,
      }
    } catch (err: any) {
      // HeadObject throws an error with name 'NotFound' (or status 404) when the object doesn't exist
      if (err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404) {
        return null
      }
      throw err
    }
  }

  async exists(path: string): Promise<boolean> {
    const metadata = await this.getMetadata(path)
    return metadata !== null
  }
}
