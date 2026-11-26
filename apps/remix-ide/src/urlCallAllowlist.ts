// Allowlist of plugin//method pairs that may be invoked via the ?call= / ?calls= URL parameters.
// Every other combination is silently dropped.
// Add entries here only for read-only or UI-navigation actions that carry no meaningful risk.
export const URL_CALL_ALLOWLIST: Record<string, ReadonlyArray<string>> = {
  fileManager: ['open'],
  terminal: ['log'],
  menuicons: ['select'],
  tabs: ['focus'],
  LearnEth: ['startTutorial'],
  notification: ['toast'],
}

export function isUrlCallAllowed(plugin: string, method: string): boolean {
  const allowed = URL_CALL_ALLOWLIST[plugin]
  return Array.isArray(allowed) && allowed.includes(method)
}
