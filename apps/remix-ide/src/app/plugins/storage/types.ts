/**
 * Storage Plugin Types and Interfaces
 * Provides abstraction for different storage providers (S3, IPFS, etc.)
 */

import {
  StorageConfig,
  StorageFile,
  StorageFilesResponse,
  StorageListOptions
} from '@remix-api'

// ==================== Storage Provider Interface ====================

/**
 * Abstract interface for storage providers
 * Implement this interface to add new storage backends
 */
export interface IStorageProvider {
  /**
   * Provider name/identifier
   */
  readonly name: string

  /**
   * Check if the storage provider is healthy/available
   */
  isHealthy(): Promise<boolean>

  /**
   * Get storage configuration (limits, allowed types)
   */
  getConfig(): Promise<StorageConfig | null>

  /**
   * Upload a file to storage
   * @param path - Full path including folder (e.g., 'contracts/MyContract.sol')
   * @param content - File content as string or Uint8Array
   * @param contentType - MIME type of the file
   * @param metadata - Optional metadata to store with the file
   * @returns The storage key/path of the uploaded file
   */
  upload(path: string, content: string | Uint8Array, contentType: string, metadata?: Record<string, string>): Promise<string>

  /**
   * Upload a file and return both key and ETag for conflict detection
   * @param path - Full path including folder
   * @param content - File content
   * @param contentType - MIME type
   * @param metadata - Optional metadata
   * @returns Object with key and etag
   */
  uploadWithEtag?(path: string, content: string | Uint8Array, contentType: string, metadata?: Record<string, string>): Promise<{ key: string; etag: string | null }>

  /**
   * Download a file from storage
   * @param path - Full path including folder
   * @returns File content as string
   */
  download(path: string): Promise<string>

  /**
   * Download a file as binary
   * @param path - Full path including folder
   * @returns File content as Uint8Array
   */
  downloadBinary(path: string): Promise<Uint8Array>

  /**
   * Delete a file from storage
   * @param path - Full path including folder
   */
  delete(path: string): Promise<void>

  /**
   * List files in storage
   * @param options - Listing options (folder, pagination)
   */
  list(options?: StorageListOptions): Promise<StorageFilesResponse>

  /**
   * Get metadata for a specific file
   * @param path - Full path including folder
   */
  getMetadata(path: string): Promise<StorageFile | null>

  /**
   * Check if a file exists
   * @param path - Full path including folder
   */
  exists(path: string): Promise<boolean>
}

// ==================== Upload Options ====================

export interface UploadOptions {
  /**
   * Folder/directory to upload to
   */
  folder?: string

  /**
   * MIME type of the file (auto-detected if not provided)
   */
  contentType?: string

  /**
   * Progress callback for large files
   */
  onProgress?: (progress: UploadProgress) => void
}

export interface UploadProgress {
  loaded: number
  total: number
  percentage: number
}

// ==================== Download Options ====================

export interface DownloadOptions {
  /**
   * Return content as binary instead of string
   */
  binary?: boolean

  /**
   * Progress callback for large files
   */
  onProgress?: (progress: DownloadProgress) => void
}

export interface DownloadProgress {
  loaded: number
  total: number
  percentage: number
}

// ==================== Storage Events ====================

export interface StorageEvents {
  fileUploaded: { path: string; size: number }
  fileDeleted: { path: string }
  fileDownloaded: { path: string }
  uploadProgress: UploadProgress & { path: string }
  downloadProgress: DownloadProgress & { path: string }
  error: { operation: string; path: string; error: Error }
  configLoaded: StorageConfig
}

// ==================== Utility Functions ====================

/**
 * Get MIME type from file extension
 */
export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''

  const mimeTypes: Record<string, string> = {
    // Solidity & Smart Contracts
    'sol': 'text/x-solidity',
    'vy': 'text/x-vyper',
    'yul': 'text/x-yul',

    // Web
    'js': 'application/javascript',
    'ts': 'application/typescript',
    'jsx': 'text/jsx',
    'tsx': 'text/tsx',
    'json': 'application/json',
    'html': 'text/html',
    'css': 'text/css',

    // Text
    'txt': 'text/plain',
    'md': 'text/markdown',
    'yaml': 'text/yaml',
    'yml': 'text/yaml',
    'toml': 'application/toml',

    // Data
    'csv': 'text/csv',
    'xml': 'application/xml',

    // Binary
    'bin': 'application/octet-stream',
    'wasm': 'application/wasm',
  }

  return mimeTypes[ext] || 'application/octet-stream'
}

/**
 * Parse a full path into folder and filename
 */
export function parsePath(fullPath: string): { folder: string; filename: string } {
  const parts = fullPath.split('/')
  const filename = parts.pop() || ''
  const folder = parts.join('/')

  return { folder, filename }
}

/**
 * Join folder and filename into a full path
 */
export function joinPath(folder: string | undefined, filename: string): string {
  if (!folder || folder === '') {
    return filename
  }

  // Remove trailing slash from folder and leading slash from filename
  const cleanFolder = folder.replace(/\/$/, '')
  const cleanFilename = filename.replace(/^\//, '')

  return `${cleanFolder}/${cleanFilename}`
}
