import { remixAILogger } from '../../helpers/logger'
import { ICompletions, IGeneration, IParams, AIRequestType, JsonStreamParser } from "../../types/types";
import { GenerationParams, CompletionParams, InsertionParams } from "../../types/models";
import { buildChatPrompt } from "../../prompts/promptBuilder";
import EventEmitter from "events";
import { ChatHistory } from "../../prompts/chat";
import axios from 'axios';
import { endpointUrls } from "@remix-endpoints-helper"
// Shared with the agent path so both classify failures identically.
import { classifyApiError, getErrorMessage } from "../deepagent/ApiErrorHandler"
import { withRetryingFetch } from "../deepagent/retryTransport"

const defaultErrorMessage = `Unable to get a response from AI server`

/** Inline completion — a short suggestion, never a whole function body. */
const COMPLETION_MAX_TOKENS = 30
/** Mid-file insertion — a few lines. */
const INSERTION_MAX_TOKENS = 100

/**
 * Provider name the `/ai/completion` proxy expects.
 *
 * This endpoint is NOT the OpenRouter-fronted chat route — it is the older
 * static proxy that pins Codestral server-side, and it still speaks the
 * pre-transport vendor-brand vocabulary. It only recognises `mistralai` /
 * `openai` / `anthropic`; `openrouter` is rejected with
 * `PROVIDER_NOT_SPECIFIED`, which is how inline completion broke when the
 * chat models were collapsed onto the openrouter transport.
 *
 * A `model` is deliberately not sent: the proxy ignores it and serves its
 * own Codestral regardless.
 */
const COMPLETION_PROVIDER = 'mistralai'

/**
 * The proxy requires a `stop` array. Without the key it falls through to a
 * legacy branch that answers 404, so guarantee one even when the caller
 * (anything other than the editor's inline provider) did not set it.
 */
const DEFAULT_COMPLETION_STOP = ['\n\n', '```']

/**
 * Build an Error whose shape matches what `parseAIErrorEnvelope` expects on
 * the upstream side (`e.response.data.error.{code,message,status,...}`).
 * Used for non-2xx responses from the streaming endpoint, where `fetch`
 * does not throw on its own.
 */
async function buildAIErrorFromResponse(response: Response): Promise<Error> {
  let body: any = null
  try {
    const text = await response.text()
    try { body = JSON.parse(text) } catch { body = text }
  } catch { /* unreadable body */ }
  const inner = body && typeof body === 'object' ? body.error : null
  const message =
    (inner && typeof inner.message === 'string' && inner.message) ||
    (typeof body === 'string' && body) ||
    `AI request failed with HTTP ${response.status}`
  const err: any = new Error(message)
  err.status = response.status
  err.response = { status: response.status, data: body }
  return err
}

export class RemoteInferencer implements ICompletions, IGeneration {
  api_url: string
  completion_url: string
  max_history = 7
  event: EventEmitter
  test_env=false
  test_url="http://solcodertest.org"
  /**
   * One controller per in-flight request. A single shared controller meant the
   * last request to start owned cancellation for all of them: a chat cancel
   * could abort an inline completion instead, and a chat stream that started
   * before a completion became impossible to cancel at all.
   */
  protected inFlightControllers: Set<AbortController> = new Set()

  constructor(apiUrl?:string, completionUrl?:string) {
    this.api_url = apiUrl!==undefined ? apiUrl: this.test_env? this.test_url : endpointUrls.solcoder
    this.completion_url = completionUrl!==undefined ? completionUrl : this.test_env? this.test_url : endpointUrls.completion
    this.event = new EventEmitter()
  }

  /**
   * Prompt byte ceiling. This was a per-brand table in which every brand
   * mapped to the same 70000, and the brands ('mistralai', 'anthropic',
   * 'openai') no longer exist — so it was a lookup that could only ever
   * return its own default.
   */
  protected getProviderByteLimit(_provider?: string): number {
    return 70000;
  }

  protected sanitizePromptByteSize(prompt: string, provider?: string): string {
    const maxBytes = this.getProviderByteLimit(provider);

    const encoder = new TextEncoder();
    const promptBytes = encoder.encode(prompt); // rough estimation, real size might be 10% more

    if (promptBytes.length <= maxBytes) {
      return prompt;
    }

    let trimmedPrompt = prompt;
    let currentBytes = promptBytes.length;

    while (currentBytes > maxBytes && trimmedPrompt.length > 0) {
      // Remove characters from the beginning (1% at a time for efficiency)
      const charsToRemove = Math.max(1, Math.floor(trimmedPrompt.length * 0.01));
      trimmedPrompt = trimmedPrompt.substring(charsToRemove);
      currentBytes = encoder.encode(trimmedPrompt).length;
    }

    remixAILogger.warn(`[RemoteInferencer] Prompt exceeded ${maxBytes} bytes for provider '${provider || 'default'}'. Trimmed from ${promptBytes.length} to ${currentBytes} bytes.`);
    return trimmedPrompt;
  }

  protected buildPromptWithChatHistory(prompt: string, chatHistory: Array<{ role: string; content: string }>, provider?: string): string {
    if (!Array.isArray(chatHistory) || chatHistory.length === 0) {
      return this.sanitizePromptByteSize(prompt, provider);
    }

    const encoder = new TextEncoder();
    const maxBytes = this.getProviderByteLimit(provider);
    const historyPrefix = "Use the previous conversation as context for the current request.\n\nPrevious conversation:\n";
    const currentPromptPrefix = "\n\nCurrent user request:\n";
    const formattedHistory = chatHistory.map((message) => {
      const speaker = message.role === 'assistant' ? 'Assistant' : 'User';
      return `${speaker}: ${message.content}`;
    });

    let startIndex = 0;
    while (startIndex <= formattedHistory.length) {
      const historySection = formattedHistory.slice(startIndex).join('\n\n');
      const candidatePrompt = `${historyPrefix}${historySection}${currentPromptPrefix}${prompt}`;
      if (encoder.encode(candidatePrompt).length <= maxBytes) {
        if (startIndex > 0) {
          remixAILogger.warn(
            `[RemoteInferencer] Embedded history exceeded ${maxBytes} bytes for provider '${provider || 'default'}'. ` +
            `Trimmed ${startIndex} oldest message entries before sending.`
          );
        }
        return candidatePrompt;
      }

      startIndex += Math.min(2, formattedHistory.length - startIndex || 1);
    }

    return this.sanitizePromptByteSize(prompt, provider);
  }

  /**
   * Emit the same classified `onApiError` the agent path emits.
   *
   * The completion / chat path used to throw raw errors with no
   * classification at all, so a 429 here and a 429 in the agent produced two
   * different behaviours in the UI. One classifier, one event shape.
   */
  protected emitClassifiedError(error: any, rType?: AIRequestType): void {
    // Inline completions fire on every keystroke and time out at 3s by
    // design; classifying those into a user-facing error would be pure noise.
    if (rType === AIRequestType.COMPLETION) return
    try {
      const { type, retryable, retryAfter } = classifyApiError(error)
      this.event.emit('onApiError', {
        type,
        message: getErrorMessage(type, error, retryAfter),
        retryable,
        retryAfter,
        originalError: error?.message,
        timestamp: Date.now()
      })
    } catch { /* classification must never mask the original failure */ }
  }

  async _makeRequest(payload, rType:AIRequestType){
    this.event.emit("onInference")
    const requestURL = rType === AIRequestType.COMPLETION ? this.completion_url : this.api_url
    const historyPrompt = payload.originalPrompt || payload.prompt
    delete payload.originalPrompt

    // Sanitize prompt in payload if it exists
    if (payload.prompt) {
      payload.prompt = this.sanitizePromptByteSize(payload.prompt, payload.provider);
    }

    try {
      const token = typeof window !== 'undefined' ? window.localStorage?.getItem('remix_access_token') : undefined
      const authHeader = token ? { 'Authorization': `Bearer ${token}` } : {}
      // `AIRequestType.COMPLETION` is 0, so testing the enum itself made this
      // ternary always take the else branch and the completion timeout never
      // applied — inline completions fire on every keystroke and were piling up
      // against the browser's per-host connection limit.
      const options = rType === AIRequestType.COMPLETION
        ? { headers: { 'Content-Type': 'application/json', ...authHeader }, timeout: 3000 }
        : { headers: { 'Content-Type': 'application/json', ...authHeader } }
      const result = await axios.post(requestURL, payload, options)
      switch (rType) {
      case AIRequestType.COMPLETION:
        if (result.status === 200)
          return result.data.generatedText
        else {
          return defaultErrorMessage
        }
      case AIRequestType.GENERAL:
        if (result.status === 200) {
          if (result.data?.error) return result.data?.error
          const resultText = result.data.generatedText
          ChatHistory.pushHistory(historyPrompt, resultText)
          return resultText
        } else {
          return defaultErrorMessage
        }
      }

    } catch (e) {
      ChatHistory.clearHistory()
      this.emitClassifiedError(e, rType)
      remixAILogger.error('Error making request to Inference server:', e.message)
      // Always propagate so withAssistantGate can parse the AIError
      // envelope and report it to assistantState (cooldown banner,
      // plan-manager hand-off, notice strip). Completion callers (the
      // editor's inline-completion provider) already swallow errors
      // silently — they only ever cared about the resolved string.
      throw e
    }
    finally {
      this.event.emit("onInferenceDone")
    }
  }

  cancelRequest(): void {
    for (const controller of this.inFlightControllers) {
      controller.abort()
    }
    this.inFlightControllers.clear()
  }

  async _streamInferenceRequest(payload, rType:AIRequestType){
    let resultText = ""
    let controller: AbortController | null = null
    const historyPrompt = payload.originalPrompt || payload.prompt
    delete payload.originalPrompt

    // Sanitize prompt in payload if it exists
    if (payload.prompt) {
      payload.prompt = this.sanitizePromptByteSize(payload.prompt, payload.provider);
    }

    try {
      this.event.emit('onInference')
      controller = new AbortController()
      this.inFlightControllers.add(controller)
      const requestURL = rType === AIRequestType.COMPLETION ? this.completion_url : this.api_url
      const token = typeof window !== 'undefined' ? window.localStorage?.getItem('remix_access_token') : undefined
      const authHeader = token ? { 'Authorization': `Bearer ${token}` } : {}
      const streamingFetch = withRetryingFetch(
        (input, init) => fetch(input as any, init),
        rType === AIRequestType.COMPLETION ? 'completion' : 'chat'
      )
      const response = await streamingFetch(requestURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      // fetch() does not throw on 4xx/5xx — surface those as structured
      // errors so the assistant-state gate can react (cooldown, upgrade…).
      if (!response.ok) {
        throw await buildAIErrorFromResponse(response)
      }

      if (payload.return_stream_response) {
        return response
      }
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      const parser = new JsonStreamParser();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        try {
          const chunk = parser.safeJsonParse<{ generatedText: string; isGenerating: boolean }>(decoder.decode(value, { stream: true }));
          for (const parsedData of chunk) {
            if (parsedData.isGenerating) {
              this.event.emit('onStreamResult', parsedData.generatedText);
              resultText = resultText + parsedData.generatedText
            } else {
              // stream generation is complete
              resultText = resultText + parsedData.generatedText
              ChatHistory.pushHistory(historyPrompt, resultText)
              return parsedData.generatedText
            }
          }
        } catch (error) {
          remixAILogger.error('Error parsing JSON:', error);
          ChatHistory.clearHistory()
        }
      }

      return resultText
    } catch (error) {
      ChatHistory.clearHistory()
      this.emitClassifiedError(error, rType)
      remixAILogger.error('Error making stream request to Inference server:', error.message);
      // Propagate so withAssistantGate / chat UI can react. Aborts (user
      // cancelled) are still recognised by name === 'AbortError' downstream.
      throw error
    }
    finally {
      if (controller) this.inFlightControllers.delete(controller)
      this.event.emit('onInferenceDone')
    }
  }

  /**
   * Put the completion payload into the shape `/ai/completion` accepts:
   * its own provider vocabulary, no `model`, and a `stop` array always
   * present. See COMPLETION_PROVIDER — the chat selection's provider and
   * model must never reach this endpoint.
   */
  protected completionRouting(options:IParams): IParams {
    const { model, ...rest } = options as any
    return {
      ...rest,
      provider: COMPLETION_PROVIDER,
      stop: Array.isArray(options.stop) && options.stop.length > 0 ? options.stop : DEFAULT_COMPLETION_STOP
    }
  }

  async code_completion(prompt, promptAfter, ctxFiles, fileName, options:IParams=CompletionParams): Promise<any> {
    // `CompletionParams` is a shared module-level singleton and is the default
    // argument here — assigning to `options.max_tokens` mutated it for every
    // other caller. Spread first.
    const payload = { prompt, 'context':promptAfter, "endpoint":"code_completion",
      'ctxFiles':ctxFiles, 'currentFileName':fileName, ...this.completionRouting(options), max_tokens: COMPLETION_MAX_TOKENS }
    return this._makeRequest(payload, AIRequestType.COMPLETION)
  }

  async code_insertion(msg_pfx, msg_sfx, ctxFiles, fileName, options:IParams=InsertionParams): Promise<any> {
    const payload = { "endpoint":"code_insertion", msg_pfx, msg_sfx, 'ctxFiles':ctxFiles,
      'currentFileName':fileName, ...this.completionRouting(options), prompt: '', max_tokens: INSERTION_MAX_TOKENS }
    return this._makeRequest(payload, AIRequestType.COMPLETION)
  }

  async code_generation(prompt, options:IParams=GenerationParams): Promise<any> {
    const payload = { prompt, "endpoint":"code_completion", ...options }
    if (options.stream_result) return this._streamInferenceRequest(payload, AIRequestType.COMPLETION)
    else return this._makeRequest(payload, AIRequestType.COMPLETION)
  }

  async basic_prompt(prompt, options:IParams=GenerationParams): Promise<any> {
    options.chatHistory = []
    const payload = { 'prompt': prompt, "endpoint":"answer", ...options }
    if (options.stream_result) return this._streamInferenceRequest(payload, AIRequestType.GENERAL)
    else return this._makeRequest(payload, AIRequestType.GENERAL)
  }

  async answer(prompt, options:IParams=GenerationParams): Promise<any> {
    const payloadOptions = { ...options }
    let promptWithHistory = prompt

    if (!payloadOptions.toolsMessages) {
      const chatHistory = buildChatPrompt()
      promptWithHistory = this.buildPromptWithChatHistory(prompt, chatHistory, payloadOptions.provider)
    }

    delete payloadOptions.chatHistory

    const payload = { 'prompt': promptWithHistory, originalPrompt: prompt, "endpoint":"answer", ...payloadOptions }
    if (payloadOptions.stream_result) return this._streamInferenceRequest(payload, AIRequestType.GENERAL)
    else return this._makeRequest(payload, AIRequestType.GENERAL)
  }

  async code_explaining(prompt, context:string="", options:IParams=GenerationParams): Promise<any> {
    const payload = { prompt, "endpoint":"code_explaining", context, ...options }
    if (options.stream_result) return this._streamInferenceRequest(payload, AIRequestType.GENERAL)
    else return this._makeRequest(payload, AIRequestType.GENERAL)
  }

  async error_explaining(prompt, options:IParams=GenerationParams): Promise<any> {
    const payload = { prompt, "endpoint":"error_explaining", ...options }
    if (options.stream_result) return this._streamInferenceRequest(payload, AIRequestType.GENERAL)
    else return this._makeRequest(payload, AIRequestType.GENERAL)
  }

  async vulnerability_check(prompt, options:IParams=GenerationParams): Promise<any> {
    const payload = { prompt, "endpoint":"vulnerability_check", ...options }
    if (options.stream_result) return this._streamInferenceRequest(payload, AIRequestType.GENERAL)
    else return this._makeRequest(payload, AIRequestType.GENERAL)
  }

  async generate(userPrompt, options:IParams=GenerationParams): Promise<any> {
    const payload = { prompt: userPrompt, "endpoint":"generate", ...options }
    if (options.stream_result) return this._streamInferenceRequest(payload, AIRequestType.GENERAL)
    else return this._makeRequest(payload, AIRequestType.GENERAL)
  }

  async generateWorkspace(userPrompt, options:IParams=GenerationParams): Promise<any> {
    const payload = { prompt: userPrompt, "endpoint":"workspace", ...options }
    if (options.stream_result) return this._streamInferenceRequest(payload, AIRequestType.GENERAL)
    else return this._makeRequest(payload, AIRequestType.GENERAL)
  }
}
