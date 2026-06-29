/**
 * AIError envelope parser.
 *
 * Source of truth: services/ai/docs/ERROR_CODES.md (upstream `remix-api` repo).
 *
 *   {
 *     "error": {
 *       "code": "RATE_LIMITED",
 *       "message": "Rate limit exceeded. Try again later.",
 *       "status": 429,
 *       "retryAfter": 30,
 *       "resetAt": "2026-05-07T12:34:56.000Z",
 *       "details": { "feature": "ai:solcoder" }
 *     }
 *   }
 *
 * For SSE endpoints (solcoder streaming, dapp/figma generators), errors
 * raised AFTER the response stream has started are emitted as a single
 * frame: `data: {"type":"error","error":{...}}`.
 *
 * The machine never sees raw HTTP responses — the wrapping plugin runs
 * one of these parsers and dispatches `ERROR_RECEIVED` with the result.
 */

import type { AIError } from './assistant-machine'

const FALLBACK_CODE = 'INTERNAL_ERROR'

/** Parse a JSON error body returned by an AI endpoint. */
export function parseAIErrorEnvelope(body: unknown, httpStatus: number): AIError {
  if (body && typeof body === 'object' && 'error' in body) {
    const raw = (body as { error: unknown }).error
    if (raw && typeof raw === 'object') {
      return normalize(raw as Partial<AIError>, httpStatus)
    }
  }
  // Some upstream errors come back as a bare string or unstructured object —
  // we still need a normalized shape so the machine doesn't have to special-case.
  return {
    code: FALLBACK_CODE,
    message: typeof body === 'string' ? body : 'Unexpected response from AI service',
    status: httpStatus
  }
}

/**
 * Parse a single SSE frame body. Returns null if the frame isn't an error
 * (so the caller can keep streaming) or an AIError if it is.
 */
export function parseAISSEErrorFrame(frameJson: unknown): AIError | null {
  if (!frameJson || typeof frameJson !== 'object') return null
  const f = frameJson as { type?: string; error?: unknown }
  if (f.type !== 'error' || !f.error || typeof f.error !== 'object') return null
  return normalize(f.error as Partial<AIError>, 500)
}

function normalize(raw: Partial<AIError>, fallbackStatus: number): AIError {
  return {
    code: typeof raw.code === 'string' && raw.code.length > 0 ? raw.code : FALLBACK_CODE,
    message: typeof raw.message === 'string' ? raw.message : 'AI service error',
    status: typeof raw.status === 'number' ? raw.status : fallbackStatus,
    retryAfter: typeof raw.retryAfter === 'number' ? raw.retryAfter : undefined,
    resetAt: typeof raw.resetAt === 'string' ? raw.resetAt : null,
    limit: typeof raw.limit === 'number' ? raw.limit : undefined,
    window: typeof raw.window === 'string' ? raw.window : undefined,
    details: raw.details && typeof raw.details === 'object' ? raw.details : undefined
  }
}

/**
 * Catch-all wrapper for fetch failures (network down, CORS, JSON.parse) —
 * keeps the error shape uniform so the machine sees AIError every time.
 *
 * Also recognises the `<status> <jsonBody>` format that langchain (and a
 * few other HTTP clients) use to stringify non-2xx responses into the
 * Error message. We unwrap that so callers don't surface raw JSON in chat.
 */
export function aiErrorFromException(e: unknown): AIError {
  const anyErr = e as any
  const status: number =
    (typeof anyErr?.status === 'number' && anyErr.status) ||
    (typeof anyErr?.response?.status === 'number' && anyErr.response.status) ||
    (typeof anyErr?.statusCode === 'number' && anyErr.statusCode) ||
    0

  // 1. Structured shape stamped by buildAIErrorFromResponse / withAssistantGate
  //    or already-parsed body on common HTTP-client error objects.
  const structuredCandidates: any[] = [
    anyErr?.aiError,
    anyErr?.response?.data,
    anyErr?.data,
    anyErr?.body,
    anyErr?.error
  ].filter(v => v && typeof v === 'object')
  for (const cand of structuredCandidates) {
    if (typeof cand.code === 'string' && typeof cand.message === 'string') {
      return normalize(cand as Partial<AIError>, status || (typeof cand.status === 'number' ? cand.status : 0))
    }
    if (cand.error && typeof cand.error === 'object' && typeof (cand.error as any).code === 'string') {
      return parseAIErrorEnvelope(cand, status || (typeof (cand.error as any).status === 'number' ? (cand.error as any).status : 0))
    }
  }

  const rawMessage = e instanceof Error ? e.message : String(e ?? '')
  const messageCandidates: string[] = [
    rawMessage,
    typeof anyErr?.error_description === 'string' ? anyErr.error_description : '',
    typeof anyErr?.responseText === 'string' ? anyErr.responseText : ''
  ].filter(Boolean)

  for (const text of messageCandidates) {
    // 2. Look for the FIRST balanced `{...}` substring that JSON-parses
    //    into an envelope. Handles every wrapping style we've seen:
    //      "403 {body}"
    //      "BadRequestError: 403 status code (no body) {body}"
    //      "Error from upstream: {body}"
    //      "{body}" (bare)
    const trimmed = text.trim()
    const start = trimmed.indexOf('{')
    if (start < 0) continue
    // Try progressively shorter slices from the end so we find the
    // largest balanced object. Cheap because messages are < a few KB.
    for (let end = trimmed.length; end > start + 1; end--) {
      if (trimmed[end - 1] !== '}') continue
      const slice = trimmed.slice(start, end)
      try {
        const body = JSON.parse(slice)
        // Status: prefer the one embedded in the message ("403 ...") if present.
        const statusMatch = /(\d{3})/.exec(trimmed.slice(0, start))
        const embeddedStatus = statusMatch ? parseInt(statusMatch[1], 10) : 0
        const parsed = parseAIErrorEnvelope(body, status || embeddedStatus)
        if (parsed.code !== FALLBACK_CODE) return parsed
        // If the body wasn't an envelope but we DID parse JSON, prefer
        // its `message` over the noisy raw string.
        if (typeof (body as any)?.message === 'string') {
          return {
            code: FALLBACK_CODE,
            message: (body as any).message,
            status: status || embeddedStatus
          }
        }
        break
      } catch { /* keep shrinking */ }
    }
  }

  return {
    code: FALLBACK_CODE,
    message: rawMessage || 'AI service error',
    status
  }
}
