export type RemixAILogMethod = (...args: any[]) => void

export interface RemixAILogger {
  debug: RemixAILogMethod
  log: RemixAILogMethod
  info: RemixAILogMethod
  warn: RemixAILogMethod
  error: RemixAILogMethod
  group: RemixAILogMethod
  groupCollapsed: RemixAILogMethod
  groupEnd: RemixAILogMethod
}

const DEBUG_STORAGE_KEYS = ['remix-ai-debug', 'remixAI.debug', 'AI_DEBUG']
const DEBUG_ENV_KEYS = ['REMIX_AI_DEBUG', 'NX_REMIX_AI_DEBUG', 'AI_DEBUG']

let configuredLoggingEnabled = false

function isTruthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  if (typeof value !== 'string') return false

  return ['1', 'true', 'yes', 'on', 'debug'].includes(value.toLowerCase())
}

function readStorageDebugFlag(): boolean {
  try {
    const storage = typeof globalThis !== 'undefined'
      ? ((globalThis as any).localStorage || (globalThis as any).window?.localStorage)
      : undefined

    if (!storage) return false

    return DEBUG_STORAGE_KEYS.some((key) => isTruthy(storage.getItem(key)))
  } catch {
    return false
  }
}

function readGlobalDebugFlag(): boolean {
  try {
    if (typeof globalThis === 'undefined') return false

    const globalDebug = (globalThis as any).__REMIX_AI_DEBUG__
    if (isTruthy(globalDebug)) return true

    const processEnv = (globalThis as any).process?.env
    if (!processEnv) return false

    return DEBUG_ENV_KEYS.some((key) => isTruthy(processEnv[key]))
  } catch {
    return false
  }
}

export function setRemixAILoggingEnabled(enabled: boolean): void {
  configuredLoggingEnabled = enabled
}

export function isRemixAILoggingEnabled(): boolean {
  return configuredLoggingEnabled || readStorageDebugFlag() || readGlobalDebugFlag()
}

function callConsole(method: keyof Console, args: any[]): void {
  if (!isRemixAILoggingEnabled()) return

  try {
    const consoleRef = typeof globalThis !== 'undefined' ? (globalThis as any).console : undefined
    const consoleMethod = consoleRef?.[method] || consoleRef?.log
    if (typeof consoleMethod === 'function') {
      consoleMethod.apply(consoleRef, args)
    }
  } catch {
    // Logging must never affect AI flows.
  }
}

export const remixAILogger: RemixAILogger = {
  debug: (...args: any[]) => callConsole('debug', args),
  log: (...args: any[]) => callConsole('log', args),
  info: (...args: any[]) => callConsole('info', args),
  warn: (...args: any[]) => callConsole('warn', args),
  error: (...args: any[]) => callConsole('error', args),
  group: (...args: any[]) => callConsole('group', args),
  groupCollapsed: (...args: any[]) => callConsole('groupCollapsed', args),
  groupEnd: (...args: any[]) => callConsole('groupEnd', args)
}