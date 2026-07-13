interface QuickDappDocsContext {
  workspaceName: string
}

let activeContext: QuickDappDocsContext | undefined

export function setQuickDappDocsContext(workspaceName: string): void {
  activeContext = { workspaceName }
}

export function getQuickDappDocsContext(): QuickDappDocsContext | undefined {
  return activeContext
}

export function clearQuickDappDocsContext(): void {
  activeContext = undefined
}
