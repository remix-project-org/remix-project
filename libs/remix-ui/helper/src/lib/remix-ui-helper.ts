import { bytesToHex, toChecksumAddress } from '@ethereumjs/util'
import { ProcessLoadingParams } from '../types/remix-helper'

export const extractNameFromKey = (key: string): string => {
  if (!key) return
  const keyPath = key.split('/')

  return keyPath[keyPath.length - 1]
}

export const extractParentFromKey = (key: string):string => {
  if (!key) return
  const keyPath = key.split('/')

  keyPath.pop()

  return keyPath.join('/')
}

export const checkSpecialChars = (name: string) => {
  return name.match(/[:*?"<>\\'|]/) != null
}

export const checkSlash = (name: string) => {
  return name.match(/\//) != null
}

export const createNonClashingNameAsync = async (name: string, fileManager, prefix = '') => {
  if (!name) name = 'Undefined'
  let _counter
  let ext = 'sol'
  const reg = /(.*)\.([^.]+)/g
  const split = reg.exec(name)
  if (split) {
    name = split[1]
    ext = split[2]
  }
  let exist = true

  do {
    const isDuplicate = await fileManager.exists(name + (_counter || '') + prefix + '.' + ext)

    if (isDuplicate) _counter = (_counter || 0) + 1
    else exist = false
  } while (exist)
  const counter = _counter || ''

  return name + counter + prefix + '.' + ext
}

export const createNonClashingTitle = async (name: string, fileManager) => {
  if (!name) name = 'Undefined'
  let _counter
  let exist = true

  do {
    const isDuplicate = await fileManager.exists(name + (_counter || ''))

    if (isDuplicate) _counter = (_counter || 0) + 1
    else exist = false
  } while (exist)
  const counter = _counter || ''

  return name + counter
}

export const joinPath = (...paths) => {
  paths = paths.filter((value) => value !== '').map((path) => path.replace(/^\/|\/$/g, '')) // remove first and last slash)
  if (paths.length === 1) return paths[0]
  return paths.join('/')
}

export const getPathIcon = (path: string) => {
  return path.endsWith('.txt')
    ? 'far fa-file-alt' : path.endsWith('.md')
      ? 'fab fa-markdown' : path.endsWith('.sol')
        ? 'fa-kit fa-solidity-mono' : path.endsWith('.js')
          ? 'fab fa-js' : path.endsWith('.json')
            ? 'small fas fa-brackets-curly' : path.endsWith('.vy')
              ? 'small fa-kit fa-vyper2' : path.endsWith('.lex')
                ? 'fa-kit fa-lexon' : path.endsWith('ts')
                  ? 'small fa-kit fa-ts-logo' : path.endsWith('.tsc')
                    ? 'fad fa-brackets-curly' : path.endsWith('.cairo')
                      ? 'small fa-kit fa-cairo' : path.endsWith('.circom')
                        ? 'fa-kit fa-circom' : path.endsWith('.nr')
                          ? 'fa-kit fa-noir' : path.endsWith('.toml')
                            ? 'fad fa-cog': 'far fa-file'
}

export const isNumeric = (value) => {
  return /^\+?(0|[1-9]\d*)$/.test(value)
}

export const shortenAddress = (address, etherBalance?, currency = 'ETH') => {
  const len = address.length

  return address.slice(0, 5) + '...' + address.slice(len - 5, len) + (etherBalance ? ' (' + etherBalance.toString() + ' ' + currency + ')' : '')
}

export const addressToString = (address) => {
  if (!address) return null
  if (typeof address !== 'string') {
    address = bytesToHex(address)
  }
  if (address.indexOf('0x') === -1) {
    address = '0x' + address
  }
  return toChecksumAddress(address)
}

export const is0XPrefixed = (value) => {
  return value.substr(0, 2) === '0x'
}

export const isHexadecimal = (value) => {
  return /^[0-9a-fA-F]+$/.test(value) && (value.length % 2 === 0)
}

export const isValidHash = (hash) => { // 0x prefixed, hexadecimal, 64digit
  const hexValue = hash.slice(2, hash.length)
  return is0XPrefixed(hash) && /^[0-9a-fA-F]{64}$/.test(hexValue)
}

export const shortenHexData = (data) => {
  if (!data) return ''
  if (data.length < 5) return data
  const len = data.length
  return data.slice(0, 5) + '...' + data.slice(len - 5, len)
}

export const addSlash = (file: string) => {
  if (!file.startsWith('/'))file = '/' + file
  return file
}

export const shortenProxyAddress = (address: string) => {
  const len = address.length

  return address.slice(0, 5) + '...' + address.slice(len - 5, len)
}

export const shortenDate = (dateString: string) => {
  const date = new Date(dateString)

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ', ' + date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export const getTimeAgo = (timestamp: number): string => {
  if (!timestamp) return 'recently'

  const now = Date.now()
  const diffInMs = now - timestamp
  const diffInSeconds = Math.floor(diffInMs / 1000)
  const diffInMinutes = Math.floor(diffInSeconds / 60)
  const diffInHours = Math.floor(diffInMinutes / 60)
  const diffInDays = Math.floor(diffInHours / 24)
  const diffInWeeks = Math.floor(diffInDays / 7)
  const diffInMonths = Math.floor(diffInDays / 30)
  const diffInYears = Math.floor(diffInDays / 365)

  if (diffInYears > 0) return diffInYears === 1 ? '1 year ago' : `${diffInYears} years ago`

  if (diffInMonths > 0) return diffInMonths === 1 ? '1 month ago' : `${diffInMonths} months ago`

  if (diffInWeeks > 0) return diffInWeeks === 1 ? '1 week ago' : `${diffInWeeks} weeks ago`

  if (diffInDays > 0) return diffInDays === 1 ? '1 day ago' : `${diffInDays} days ago`

  if (diffInHours > 0) return diffInHours === 1 ? '1 hour ago' : `${diffInHours} hours ago`

  if (diffInMinutes > 0) return diffInMinutes === 1 ? '1 minute ago' : `${diffInMinutes} minutes ago`

  if (diffInSeconds > 0) return diffInSeconds === 1 ? '1 second ago' : `${diffInSeconds} seconds ago`

  return 'just now'
}

/**
 * Processes the import of external content (files, contracts, etc.) from various sources
 * such as IPFS, HTTPS URLs, or GitHub repositories into the Remix workspace.
 *
 * This function handles the complete import workflow including:
 * - Tracking analytics events for the import action
 * - Automatically adding IPFS protocol prefix if missing
 * - Resolving and fetching content from external sources
 * - Validating that files don't already exist in the workspace
 * - Adding imported files to the workspace file system
 * - Providing loading state updates and error handling
 * - Automatically selecting the file panel after successful import
 *
 * @param {ProcessLoadingParams} params - Configuration object for the import process
 * @param {string} params.type - The type/source of the import (e.g., 'ipfs', 'IPFS', 'https', 'HTTPS').
 *                               Used for tracking analytics and determining file path structure.
 * @param {string} params.importUrl - The full URL to import from. Can include protocol prefix (e.g., 'ipfs://...' or 'https://...').
 *                                    For IPFS imports, if the prefix is missing, it will be automatically prepended.
 * @param {any} params.contentImport - The contentImport plugin instance that handles URL resolution and content fetching.
 *                                     Must have an `import(url, loadingCb, cb)` method.
 * @param {any} params.workspaceProvider - The workspace file system provider instance from fileManager.
 *                                         Must have `exists(filePath)` and `addExternal(filePath, content, url)` methods.
 * @param {any} params.plugin - The main Remix plugin instance used for calling other plugins (e.g., menuicons).
 *                              Must have a `call(pluginName, method, ...args)` method.
 * @param {Function} [params.onLoading] - Optional callback function invoked during the import process with loading messages.
 *                                        Receives a string parameter containing the current loading status message.
 * @param {Function} [params.onSuccess] - Optional callback function invoked when the import completes successfully.
 *                                        Called after the file has been added to the workspace and the file panel is selected.
 * @param {Function} [params.onError] - Optional callback function invoked when an error occurs during import.
 *                                      Receives either a string error message or an Error object.
 *                                      Errors can occur from: network failures, file already exists, or workspace operations.
 * @param {Function} [params.trackEvent] - Optional callback function for tracking analytics events.
 *                                         Receives a MatomoEvent object. If not provided, tracking is skipped.
 *
 * @returns {Promise<void>} A Promise that resolves when the import process completes successfully,
 *                          or rejects if an error occurs during the import. The promise resolves/rejects
 *                          after all callbacks (onSuccess/onError) have been invoked.
 *
 * @example
 * // Import from IPFS
 * await processLoading({
 *   type: 'ipfs',
 *   importUrl: 'QmHash...', // Prefix will be added automatically
 *   contentImport: global.plugin.contentImport,
 *   workspaceProvider: global.plugin.fileManager.getProvider('workspace'),
 *   plugin: global.plugin,
 *   onLoading: (msg) => console.log('Loading:', msg),
 *   onSuccess: () => console.log('Import successful!'),
 *   onError: (error) => console.error('Import failed:', error),
 *   trackEvent: trackMatomoEvent
 * })
 *
 * @example
 * // Import from HTTPS
 * await processLoading({
 *   type: 'https',
 *   importUrl: 'https://example.com/contract.sol',
 *   contentImport: plugin.contentImport,
 *   workspaceProvider: workspaceProvider,
 *   plugin: plugin,
 *   onError: (error) => showToast(error)
 * })
 *
 * @throws {Error} Rejects the returned Promise with an error if:
 *                 - The content cannot be resolved or fetched from the URL
 *                 - The file already exists in the workspace
 *                 - Workspace operations fail
 */
export const processLoading = ({ type, importUrl, contentImport, workspaceProvider, plugin, onLoading, onSuccess, onError, trackEvent }: ProcessLoadingParams) => {
  trackEvent({
    category: 'hometab',
    action: 'filesSection',
    name: 'importFrom' + type,
    isClick: true
  })

  // Handle IPFS prefix logic
  let finalUrl = importUrl
  const startsWith = importUrl.substring(0, 4)
  if ((type === 'ipfs' || type === 'IPFS') && startsWith !== 'ipfs' && startsWith !== 'IPFS') {
    finalUrl = 'ipfs://' + importUrl
  }

  // Loading callback
  const loadingCb = (loadingMsg: string) => {
    onLoading(loadingMsg)
  }

  // Completion callback
  const cb = async (error, content, cleanUrl, type, url) => {
    if (error) {
      onError(error.message || error)
      return
    }

    try {
      const filePath = type + '/' + cleanUrl
      if (await workspaceProvider.exists(filePath)) {
        onError('File already exists in workspace')
        return
      }

      workspaceProvider.addExternal(filePath, content, url)

      // Select file panel if plugin is available
      if (plugin && plugin.call) {
        await plugin.call('menuicons', 'select', 'filePanel')
      }

      onSuccess()
    } catch (e) {
      onError(e.message || e)
    }
  }

  // Execute import
  return new Promise<void>((resolve, reject) => {
    contentImport.import(finalUrl, loadingCb, (error: any, ...args: [any, string, string, string]) => {
      cb(error, ...args)
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

