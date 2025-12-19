import { ICompletions, IGeneration, IParams, AIRequestType, JsonStreamParser } from "../../types/types";
import { GenerationParams, CompletionParams, InsertionParams } from "../../types/models";
import { buildChatPrompt } from "../../prompts/promptBuilder";
import EventEmitter from "events";
import { ChatHistory } from "../../prompts/chat";
import axios from 'axios';
import { endpointUrls } from "@remix-endpoints-helper"

const defaultErrorMessage = `Unable to get a response from AI server`
export class RemoteInferencer implements ICompletions, IGeneration {
  api_url: string
  completion_url: string
  max_history = 7
  event: EventEmitter
  test_env=false
  test_url="http://solcodertest.org"

  constructor(apiUrl?:string, completionUrl?:string) {
    this.api_url = apiUrl!==undefined ? apiUrl: this.test_env? this.test_url : endpointUrls.solcoder
    this.completion_url = completionUrl!==undefined ? completionUrl : this.test_env? this.test_url : endpointUrls.completion
    this.event = new EventEmitter()
  }

  protected sanitizePromptByteSize(prompt: string, provider?: string): string {
    // Provider-specific max byte limits
    const providerLimits: Record<string, number> = {
      'mistralai': 70000,
      'anthropic': 70000,
      'openai': 70000
    };

    // Get max bytes based on provider, default to 70KB
    const maxBytes = provider ? (providerLimits[provider.toLowerCase()] || 70000) : 70000;

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

    console.warn(`[RemoteInferencer] Prompt exceeded ${maxBytes} bytes for provider '${provider || 'default'}'. Trimmed from ${promptBytes.length} to ${currentBytes} bytes.`);
    return trimmedPrompt;
  }

  async _makeRequest(payload, rType:AIRequestType){
    this.event.emit("onInference")
    const requestURL = rType === AIRequestType.COMPLETION ? this.completion_url : this.api_url

    // Sanitize prompt in payload if it exists
    if (payload.prompt) {
      payload.prompt = this.sanitizePromptByteSize(payload.prompt, payload.provider);
    }

    try {
      const options = AIRequestType.COMPLETION ? { headers: { 'Content-Type': 'application/json', }, timeout: 3000 } : { headers: { 'Content-Type': 'application/json', } }
      const result = await axios.post(requestURL, payload, options)

      switch (rType) {
      case AIRequestType.COMPLETION:
        if (result.statusText === "OK")
          return result.data.generatedText
        else {
          return defaultErrorMessage
        }
      case AIRequestType.GENERAL:
        if (result.statusText === "OK") {
          if (result.data?.error) return result.data?.error
          const resultText = result.data.generatedText
          return resultText
        } else {
          return defaultErrorMessage
        }
      }

    } catch (e) {
      ChatHistory.clearHistory()
      console.error('Error making request to Inference server:', e.message)
      return ""
    }
    finally {
      this.event.emit("onInferenceDone")
    }
  }

  async _streamInferenceRequest(payload, rType:AIRequestType){
    let resultText = ""

    // Sanitize prompt in payload if it exists
    if (payload.prompt) {
      payload.prompt = this.sanitizePromptByteSize(payload.prompt, payload.provider);
    }

    try {
      this.event.emit('onInference')
      const requestURL = rType === AIRequestType.COMPLETION ? this.completion_url : this.api_url
      const response = await fetch(requestURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

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
          console.log("value" + decoder.decode(value))
          const chunk = parser.safeJsonParse<{ generatedText: string; isGenerating: boolean }>(decoder.decode(value, { stream: true }));
          for (const parsedData of chunk) {
            if (parsedData.isGenerating) {
              this.event.emit('onStreamResult', parsedData.generatedText);
              resultText = resultText + parsedData.generatedText
            } else {
              // stream generation is complete
              resultText = resultText + parsedData.generatedText
              ChatHistory.pushHistory(payload.prompt, resultText)
              return parsedData.generatedText
            }
          }
        } catch (error) {
          console.error('Error parsing JSON:', error);
          ChatHistory.clearHistory()
        }
      }

      return resultText
    } catch (error) {
      ChatHistory.clearHistory()
      console.error('Error making stream request to Inference server:', error.message);
    }
    finally {
      this.event.emit('onInferenceDone')
    }
  }

  async code_completion(prompt, promptAfter, ctxFiles, fileName, options:IParams=CompletionParams): Promise<any> {
    options.max_tokens = 30
    const payload = { prompt, 'context':promptAfter, "endpoint":"code_completion",
      'ctxFiles':ctxFiles, 'currentFileName':fileName, ...options }
    return this._makeRequest(payload, AIRequestType.COMPLETION)
  }

  async code_insertion(msg_pfx, msg_sfx, ctxFiles, fileName, options:IParams=InsertionParams): Promise<any> {
    options.max_tokens = 100
    const payload = { "endpoint":"code_insertion", msg_pfx, msg_sfx, 'ctxFiles':ctxFiles,
      'currentFileName':fileName, ...options, prompt: '' }
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
    options.chatHistory = buildChatPrompt()
    const payload = { 'prompt': prompt, "endpoint":"answer", ...options }
    if (options.stream_result) return this._streamInferenceRequest(payload, AIRequestType.GENERAL)
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
