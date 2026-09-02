/**
 * Identity of the agent run currently in flight.
 *
 * Model instances are cached across threads (see ModelFactory), so anything
 * per-run has to be read at request time rather than baked into the
 * constructor — the same reason the Langfuse handler is re-pointed on every
 * run instead of being rebuilt.
 */
let currentSessionId: string | undefined

export function setCurrentSessionId(sessionId: string | undefined): void {
  currentSessionId = sessionId
}

export function getCurrentSessionId(): string | undefined {
  return currentSessionId
}
