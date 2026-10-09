export type QuickDappWorkspaceOperation = 'generate' | 'update' | 'publish'

export interface QuickDappWorkspaceLock {
  workspaceName: string
  slug?: string
  operationId?: string
  operation: QuickDappWorkspaceOperation
  reason?: string
  startedAt: number
  expiresAt: number
}

const QUICKDAPP_WORKSPACE_LOCK_TTL_MS = 30 * 60 * 1000
const QUICKDAPP_WORKSPACE_LOCK_KEY = '__remixQuickDappWorkspaceLock__'

interface QuickDappWorkspaceLockStore {
  lock?: QuickDappWorkspaceLock
  listeners?: Set<(lock: QuickDappWorkspaceLock) => void>
  lifetimes?: WeakMap<QuickDappWorkspaceLock, { holders: number; cleared: boolean; clearRequested: boolean; onIdle: Array<() => void> }>
}

function getStore(): QuickDappWorkspaceLockStore {
  const globalTarget = globalThis as typeof globalThis & {
    [QUICKDAPP_WORKSPACE_LOCK_KEY]?: QuickDappWorkspaceLockStore
  }

  if (!globalTarget[QUICKDAPP_WORKSPACE_LOCK_KEY]) {
    globalTarget[QUICKDAPP_WORKSPACE_LOCK_KEY] = {}
  }

  return globalTarget[QUICKDAPP_WORKSPACE_LOCK_KEY]
}

function pruneExpiredLock() {
  const store = getStore()
  if (store.lock && store.lock.expiresAt <= Date.now() && !getLifetime(store.lock).holders) {
    delete store.lock
  }
}

function getLifetime(lock: QuickDappWorkspaceLock) {
  const store = getStore()
  const lifetimes = store.lifetimes ||= new WeakMap()
  let lifetime = lifetimes.get(lock)
  if (!lifetime) {
    lifetime = { holders: 0, cleared: false, clearRequested: false, onIdle: []}
    lifetimes.set(lock, lifetime)
  }
  return lifetime
}

export function onQuickDappWorkspaceLockCreated(listener: (lock: QuickDappWorkspaceLock) => void): () => void {
  const listeners = getStore().listeners ||= new Set()
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** A timed-out caller cannot release a lock while its tool is still writing. */
export function retainQuickDappWorkspaceLock(lock: QuickDappWorkspaceLock): () => void {
  const lifetime = getLifetime(lock)
  if (lifetime.holders) throw new Error('QuickDapp is still saving files. Wait for it to finish before starting another operation.')
  lifetime.holders++
  let released = false
  return () => {
    if (released) return
    released = true
    if (--lifetime.holders) return
    if (lifetime.clearRequested) releaseLock(lock)
    lifetime.onIdle.splice(0).forEach(finish => finish())
  }
}

function releaseLock(lock: QuickDappWorkspaceLock) {
  const lifetime = getLifetime(lock)
  if (lifetime.holders) {
    lifetime.clearRequested = true
    return
  }
  lifetime.cleared = true
  if (getStore().lock === lock) delete getStore().lock
}

/** Finish only this operation, after its outstanding tool has settled. */
export function finishQuickDappWorkspaceLock(lock: QuickDappWorkspaceLock, onInterrupted: () => void): void {
  const lifetime = getLifetime(lock)
  const finish = () => {
    const current = getStore().lock
    if (lifetime.cleared || (current && current !== lock)) return
    releaseLock(lock)
    onInterrupted()
  }
  if (lifetime.holders) lifetime.onIdle.push(finish)
  else finish()
}

export function setQuickDappWorkspaceLock(input: {
  workspaceName: string
  slug?: string
  operationId?: string
  operation: QuickDappWorkspaceOperation
  reason?: string
  ttlMs?: number
}): QuickDappWorkspaceLock {
  const current = getStore().lock
  if (current && getLifetime(current).holders) {
    throw new Error('QuickDapp is still saving files. Wait for it to finish before starting another operation.')
  }
  const startedAt = Date.now()
  const lock: QuickDappWorkspaceLock = {
    workspaceName: input.workspaceName,
    slug: input.slug,
    operationId: input.operationId,
    operation: input.operation,
    reason: input.reason,
    startedAt,
    expiresAt: startedAt + (input.ttlMs || QUICKDAPP_WORKSPACE_LOCK_TTL_MS)
  }

  // A superseded operation must never clean up its replacement later.
  if (current) getLifetime(current).cleared = true
  getStore().lock = lock
  getStore().listeners?.forEach(listener => listener(lock))
  return lock
}

export function trySetQuickDappWorkspaceLock(input: {
  workspaceName: string
  slug?: string
  operationId?: string
  operation: QuickDappWorkspaceOperation
  reason?: string
  ttlMs?: number
}): QuickDappWorkspaceLock | undefined {
  if (getQuickDappWorkspaceLock()) return undefined
  return setQuickDappWorkspaceLock(input)
}

export function getQuickDappWorkspaceLock(): QuickDappWorkspaceLock | undefined {
  pruneExpiredLock()
  return getStore().lock
}

export function clearQuickDappWorkspaceLock(workspaceName?: string, operationId?: string): void {
  const store = getStore()
  if (!store.lock) return
  if (workspaceName && store.lock.workspaceName !== workspaceName) return
  if (store.lock.operationId && !operationId) return
  if (operationId && store.lock.operationId !== operationId) return
  releaseLock(store.lock)
}

export function clearAllQuickDappWorkspaceLocks(): void {
  const lock = getStore().lock
  if (lock) releaseLock(lock)
}

export function isQuickDappWorkspaceSwitchBlocked(nextWorkspaceName: string): boolean {
  const lock = getQuickDappWorkspaceLock()
  return !!lock && nextWorkspaceName !== lock.workspaceName
}

export function getQuickDappWorkspaceLockMessage(lock: QuickDappWorkspaceLock, nextWorkspaceName?: string): string {
  const action = lock.operation === 'update' ? 'updating' : lock.operation === 'publish' ? 'publishing' : 'generating'
  const attempted = nextWorkspaceName ? ` Attempted workspace: "${nextWorkspaceName}".` : ''
  return `QuickDapp is ${action} files in "${lock.workspaceName}". Workspace switching is blocked until it finishes.${attempted}`
}

export function getQuickDappWorkspaceMutationLockMessage(lock: QuickDappWorkspaceLock, actionName: string, workspaceName?: string): string {
  const action = lock.operation === 'update' ? 'updating' : lock.operation === 'publish' ? 'publishing' : 'generating'
  const target = workspaceName ? ` Target workspace: "${workspaceName}".` : ''
  return `QuickDapp is ${action} files in "${lock.workspaceName}". ${actionName} is blocked until it finishes.${target}`
}
