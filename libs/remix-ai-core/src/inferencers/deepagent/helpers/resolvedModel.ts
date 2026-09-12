/**
 * Which model actually served a request.
 *
 * With `openrouter/auto` the router picks the model per request and only says
 * so in the raw response (`{"model": "..."}` on every SSE frame).
 * `@langchain/openrouter` drops that field while streaming — its delta
 * converter copies only `model_provider` onto `response_metadata` — so the
 * transport is the last place it can be read. The transport reports it here
 * and the inferencer relays it to the UI.
 */

type ResolvedModelListener = (model: string) => void

let listener: ResolvedModelListener | null = null

export function setResolvedModelListener(next: ResolvedModelListener | null): void {
  listener = next
}

export function reportResolvedModel(model: string | undefined | null): void {
  if (!model || !listener) return
  listener(model)
}
