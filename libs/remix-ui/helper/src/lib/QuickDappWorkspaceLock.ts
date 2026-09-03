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
  if (store.lock && store.lock.expiresAt <= Date.now()) {
    delete store.lock
  }
}

export function setQuickDappWorkspaceLock(input: {
  workspaceName: string
  slug?: string
  operationId?: string
  operation: QuickDappWorkspaceOperation
  reason?: string
  ttlMs?: number
}): QuickDappWorkspaceLock {
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

  getStore().lock = lock
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
  delete store.lock
}

export function clearAllQuickDappWorkspaceLocks(): void {
  delete getStore().lock
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
