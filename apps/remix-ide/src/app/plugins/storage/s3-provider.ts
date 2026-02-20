/**
 * S3 Storage Provider
 * Implements IStorageProvider using presigned URLs for S3-compatible storage
 */

import {
  ApiClient,
  StorageApiService,
  StorageConfig,
  StorageFile,
  StorageFilesResponse,
  StorageListOptions
} from '@remix-api'
import {
  IStorageProvider,
  getMimeType,
  parsePath,
  joinPath
} from './types'

export class S3StorageProvider implements IStorageProvider {
  readonly name = 's3'

  private storageApi: StorageApiService
  private config: StorageConfig | null = null

  constructor(
    private apiClient: ApiClient,
    private getToken: () => Promise<string | null>
  ) {
    this.storageApi = new StorageApiService(apiClient)
  }

  /**
   * Ensure the API client has a valid token
   */
  private async ensureToken(): Promise<void> {
    const token = await this.getToken()
    if (token) {
      this.apiClient.setToken(token)
    }
  }

  /**
   * Get the underlying storage API service
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

      // Cache config
      if (this.config) {
        return this.config
      }

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

  async upload(path: string, content: string | Uint8Array, contentType?: string, metadata?: Record<string, string>): Promise<string> {
    await this.ensureToken()

    const { folder, filename } = parsePath(path)
    const mimeType = contentType || getMimeType(filename)

    // Convert content to appropriate format
    let body: Blob | string
    let size: number

    if (typeof content === 'string') {
      body = content
      size = new Blob([content]).size
    } else {
      // Create a new ArrayBuffer copy for Blob compatibility
      const buffer = new ArrayBuffer(content.length)
      new Uint8Array(buffer).set(content)
      body = new Blob([buffer])
      size = content.length
    }

    // 1. Get presigned upload URL
    console.log(`[S3StorageProvider] Getting presigned URL for: ${path}`)
    const presignResponse = await this.storageApi.getUploadUrl({
      filename,
      folder: folder || undefined,
      contentType: mimeType,
      fileSize: size,
      metadata
    })

    if (!presignResponse.ok || !presignResponse.data) {
      throw new Error(presignResponse.error || 'Failed to get presigned upload URL')
    }

    const { url, headers, key } = presignResponse.data

    // 2. Upload directly to S3
    console.log(`[S3StorageProvider] Uploading to S3: ${key}`)
    console.log(`[S3StorageProvider] Presigned URL:`, url)
    console.log(`[S3StorageProvider] Headers from server:`, headers)

    // Build the request headers - only include Content-Type, let S3 handle the rest via query params
    const requestHeaders: Record<string, string> = {
      'Content-Type': mimeType
    }

    // Add any headers from the presigned response (but filter out problematic ones)
    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        // Skip headers that might cause CORS issues
        const lowerKey = key.toLowerCase()
        if (!['host', 'content-length'].includes(lowerKey)) {
          requestHeaders[key] = value
        }
      }
    }

    console.log(`[S3StorageProvider] Final request headers:`, requestHeaders)

    const uploadResponse = await fetch(url, {
      method: 'PUT',
      headers: requestHeaders,
      body
    })

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text().catch(() => 'Unknown error')
      throw new Error(`S3 upload failed: ${uploadResponse.status} - ${errorText}`)
    }

    // Get ETag from response headers (S3 returns it after successful upload)
    const etag = uploadResponse.headers.get('ETag')?.replace(/"/g, '') || null

    console.log(`[S3StorageProvider] Upload successful: ${key}, ETag: ${etag}`)
    return key
  }

  /**
   * Upload with ETag return - same as upload but returns { key, etag }
   */
  async uploadWithEtag(path: string, content: string | Uint8Array, contentType?: string, metadata?: Record<string, string>): Promise<{ key: string; etag: string | null }> {
    await this.ensureToken()

    const { folder, filename } = parsePath(path)
    const mimeType = contentType || getMimeType(filename)

    // Convert content to appropriate format
    let body: Blob | string
    let size: number

    if (typeof content === 'string') {
      body = content
      size = new Blob([content]).size
    } else {
      // Create a new ArrayBuffer copy for Blob compatibility
      const buffer = new ArrayBuffer(content.length)
      new Uint8Array(buffer).set(content)
      body = new Blob([buffer])
      size = content.length
    }

    // 1. Get presigned upload URL
    const presignResponse = await this.storageApi.getUploadUrl({
      filename,
      folder: folder || undefined,
      contentType: mimeType,
      fileSize: size,
      metadata
    })

    if (!presignResponse.ok || !presignResponse.data) {
      throw new Error(presignResponse.error || 'Failed to get presigned upload URL')
    }

    const { url, headers, key } = presignResponse.data

    // Build the request headers
    const requestHeaders: Record<string, string> = {
      'Content-Type': mimeType
    }

    if (headers) {
      for (const [hkey, value] of Object.entries(headers)) {
        const lowerKey = hkey.toLowerCase()
        if (!['host', 'content-length'].includes(lowerKey)) {
          requestHeaders[hkey] = value
        }
      }
    }

    const uploadResponse = await fetch(url, {
      method: 'PUT',
      headers: requestHeaders,
      body
    })

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text().catch(() => 'Unknown error')
      throw new Error(`S3 upload failed: ${uploadResponse.status} - ${errorText}`)
    }

    // Get ETag from response headers
    const etag = uploadResponse.headers.get('ETag')?.replace(/"/g, '') || null

    console.log(`[S3StorageProvider] Upload successful: ${key}, ETag: ${etag}`)
    return { key, etag }
  }

  async download(path: string): Promise<string> {
    await this.ensureToken()

    const { folder, filename } = parsePath(path)

    // 1. Get presigned download URL
    console.log(`[S3StorageProvider] Getting download URL for: ${path}`)
    const presignResponse = await this.storageApi.getDownloadUrl({
      filename,
      folder: folder || undefined
    })

    if (!presignResponse.ok || !presignResponse.data) {
      throw new Error(presignResponse.error || 'Failed to get presigned download URL')
    }

    // 2. Download from S3
    const downloadResponse = await fetch(presignResponse.data.url)

    if (!downloadResponse.ok) {
      throw new Error(`S3 download failed: ${downloadResponse.status}`)
    }

    return await downloadResponse.text()
  }

  async downloadBinary(path: string): Promise<Uint8Array> {
    await this.ensureToken()

    const { folder, filename } = parsePath(path)

    // 1. Get presigned download URL
    const presignResponse = await this.storageApi.getDownloadUrl({
      filename,
      folder: folder || undefined
    })

    if (!presignResponse.ok || !presignResponse.data) {
      throw new Error(presignResponse.error || 'Failed to get presigned download URL')
    }

    // 2. Download from S3
    const downloadResponse = await fetch(presignResponse.data.url)

    if (!downloadResponse.ok) {
      throw new Error(`S3 download failed: ${downloadResponse.status}`)
    }

    const buffer = await downloadResponse.arrayBuffer()
    return new Uint8Array(buffer)
  }

  async delete(path: string): Promise<void> {
    await this.ensureToken()

    const response = await this.storageApi.deleteFile(path)

    if (!response.ok) {
      throw new Error(response.error || 'Failed to delete file')
    }
  }

  async list(options?: StorageListOptions): Promise<StorageFilesResponse> {
    await this.ensureToken()

    const response = await this.storageApi.listFiles(options)

    if (!response.ok || !response.data) {
      throw new Error(response.error || 'Failed to list files')
    }

    return response.data
  }

  async getMetadata(path: string): Promise<StorageFile | null> {
    await this.ensureToken()

    const response = await this.storageApi.getFileMetadata(path)

    if (!response.ok) {
      if (response.status === 404) {
        return null
      }
      throw new Error(response.error || 'Failed to get file metadata')
    }

    return response.data || null
  }

  async exists(path: string): Promise<boolean> {
    const metadata = await this.getMetadata(path)
    return metadata !== null
  }
}
