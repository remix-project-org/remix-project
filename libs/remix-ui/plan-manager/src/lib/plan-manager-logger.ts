type ConsoleMethod = 'debug' | 'log' | 'info' | 'warn' | 'error' | 'group' | 'groupCollapsed' | 'groupEnd'

let loggingEnabled: boolean | null = null

const enabledValues = new Set(['1', 'true', 'yes', 'debug'])
const debugStorageKeys = ['plan-manager-debug', 'remix-plan-manager-debug', 'PLAN_MANAGER_DEBUG']
const debugGlobalKeys = ['__REMIX_PLAN_MANAGER_DEBUG__', 'PLAN_MANAGER_DEBUG']

export function setPlanManagerLoggingEnabled(enabled: boolean): void {
  loggingEnabled = enabled
}

export function isPlanManagerLoggingEnabled(): boolean {
  if (loggingEnabled !== null) return loggingEnabled

  try {
    for (const key of debugStorageKeys) {
      const value = globalThis.localStorage?.getItem(key)
      if (value && enabledValues.has(value.toLowerCase())) return true
    }
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }

  for (const key of debugGlobalKeys) {
    const value = (globalThis as any)[key]
    if (value === true) return true
    if (typeof value === 'string' && enabledValues.has(value.toLowerCase())) return true
  }

  return false
}

function write(method: ConsoleMethod, args: any[]): void {
  if (!isPlanManagerLoggingEnabled()) return
  const consoleRef = globalThis.console
  const target = consoleRef?.[method] || consoleRef?.log
  if (typeof target === 'function') target.apply(consoleRef, args)
}

export const planManagerLogger = {
  debug: (...args: any[]) => write('debug', args),
  log: (...args: any[]) => write('log', args),
  info: (...args: any[]) => write('info', args),
  warn: (...args: any[]) => write('warn', args),
  error: (...args: any[]) => write('error', args),
  group: (...args: any[]) => write('group', args),
  groupCollapsed: (...args: any[]) => write('groupCollapsed', args),
  groupEnd: (...args: any[]) => write('groupEnd', args)
}