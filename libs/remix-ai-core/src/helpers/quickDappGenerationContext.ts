export interface QuickDappGenerationContext {
  workspaceName: string
  isInlineMode: boolean
  sourceRoot: string
  contractAddress?: string
  operation: 'generate' | 'update'
  startedAt: number
  expiresAt: number
}

const QUICKDAPP_CONTEXT_TTL_MS = 30 * 60 * 1000
const activeContexts = new Map<string, QuickDappGenerationContext>()

function pruneExpiredQuickDappContexts() {
  const currentTime = Date.now()
  for (const [workspaceName, context] of activeContexts.entries()) {
    if (context.expiresAt <= currentTime) {
      activeContexts.delete(workspaceName)
    }
  }
}

export function markQuickDappGenerationContext(context: Omit<QuickDappGenerationContext, 'startedAt' | 'expiresAt'>) {
  pruneExpiredQuickDappContexts()
  const startedAt = Date.now()
  activeContexts.set(context.workspaceName, {
    ...context,
    startedAt,
    expiresAt: startedAt + QUICKDAPP_CONTEXT_TTL_MS
  })
}

export function getQuickDappGenerationContext(workspaceName: string): QuickDappGenerationContext | undefined {
  pruneExpiredQuickDappContexts()
  return activeContexts.get(workspaceName)
}

export function getActiveQuickDappGenerationContexts(): QuickDappGenerationContext[] {
  pruneExpiredQuickDappContexts()
  return Array.from(activeContexts.values()).sort((a, b) => b.startedAt - a.startedAt)
}

export function getActiveQuickDappGenerationContext(): QuickDappGenerationContext | undefined {
  return getActiveQuickDappGenerationContexts()[0]
}

export function clearQuickDappGenerationContext(workspaceName: string) {
  activeContexts.delete(workspaceName)
}

export function clearAllQuickDappGenerationContexts() {
  activeContexts.clear()
}
