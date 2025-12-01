import { AIRequestType, ICompletions, IGeneration, IParams } from "../../types/types";
import { CompletionParams, GenerationParams } from "../../types/models";
import { discoverOllamaHost, listModels } from "./ollama";
import { HandleOllamaResponse } from "../../helpers/streamHandler";
import { sanitizeCompletionText } from "../../helpers/textSanitizer";
import { FIMModelManager } from "./fimModelConfig";
import { buildChatPrompt } from "../../prompts/promptBuilder";
import {
  CONTRACT_PROMPT,
  WORKSPACE_PROMPT,
  CHAT_PROMPT,
  CODE_COMPLETION_PROMPT,
  CODE_INSERTION_PROMPT,
  CODE_GENERATION_PROMPT,
  CODE_EXPLANATION_PROMPT,
  ERROR_EXPLANATION_PROMPT,
  SECURITY_ANALYSIS_PROMPT
} from "./systemPrompts";
import axios from "axios";
import { RemoteInferencer } from "../remote/remoteInference";

// Helper function to track events using MatomoManager instance
function trackMatomoEvent(category: string, action: string, name?: string) {
  try {
    if (typeof window !== 'undefined' && (window as any)._matomoManagerInstance) {
      (window as any)._matomoManagerInstance.trackEvent(category, action, name)
    }
  } catch (error) {
    // Silent fail for tracking
  }
}
const defaultErrorMessage = `Unable to get a response from Ollama server`;

export class OllamaInferencer extends RemoteInferencer implements ICompletions, IGeneration {
  private ollama_host: string | null = null;
  model_name: string = "llama2:13b"; // Default model
  private isInitialized: boolean = false;
  private modelSupportsInsert: boolean | null = null;
  private currentSuffix: string = "";
  private fimManager: FIMModelManager;

  constructor(modelName?: string) {
    super();
    this.model_name = modelName || this.model_name;
    this.fimManager = FIMModelManager.getInstance();
    this.initialize();
  }

  private async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.ollama_host = await discoverOllamaHost();
    if (!this.ollama_host) {
      trackMatomoEvent('ai', 'remixAI', 'ollama_initialize_failed:no_host_available');
      throw new Error('Ollama is not available on any of the default ports');
    }

    trackMatomoEvent('ai', 'remixAI', `ollama_host_discovered:${this.ollama_host}`);
    // Default to generate endpoint, will be overridden per request type
    this.api_url = `${this.ollama_host}/api/generate`;
    this.isInitialized = true;

    try {
      const availableModels = await listModels();
      trackMatomoEvent('ai', 'remixAI', `ollama_models_found:${availableModels.length}`);

      if (availableModels.length > 0 && !availableModels.includes(this.model_name)) {
        // Prefer codestral model if available, otherwise use first available model
        const defaultModel = availableModels.find(m => m.includes('codestral')) || availableModels[0];
        const wasCodestralSelected = defaultModel.includes('codestral');
        this.model_name = defaultModel;
        trackMatomoEvent('ai', 'remixAI', `ollama_model_auto_selected:${this.model_name}|codestral:${wasCodestralSelected}`);
      }
      trackMatomoEvent('ai', 'remixAI', `ollama_initialize_success:${this.model_name}`);
    } catch (error) {
      trackMatomoEvent('ai', 'remixAI', `ollama_model_selection_error:${error.message || 'unknown_error'}`);
      console.warn('Could not auto-select model. Make sure you have at least one model installed:', error);
    }
  }

  private getEndpointForRequestType(rType: AIRequestType): string {
    switch (rType) {
    case AIRequestType.COMPLETION:
      return `${this.ollama_host}/api/generate`;
    case AIRequestType.GENERAL:
      return `${this.ollama_host}/api/chat`;
    default:
      return `${this.ollama_host}/api/generate`;
    }
  }

  private removeSuffixOverlap(completion: string, suffix: string): string {
    if (!suffix || !completion) return completion;

    const trimmedCompletion = completion.trimEnd();
    const trimmedSuffix = suffix.trimStart();

    if (!trimmedCompletion || !trimmedSuffix) return completion;

    // Helper function to normalize whitespace for comparison
    const normalizeWhitespace = (str: string): string => {
      return str.replace(/\s+/g, ' ').trim();
    };

    // Helper function to find whitespace-flexible overlap
    const findFlexibleOverlap = (compEnd: string, suffStart: string): number => {
      const normalizedCompEnd = normalizeWhitespace(compEnd);
      const normalizedSuffStart = normalizeWhitespace(suffStart);

      if (normalizedCompEnd === normalizedSuffStart) {
        return compEnd.length;
      }
      return 0;
    };

    let bestOverlapLength = 0;
    let bestOriginalLength = 0;

    // Start from longer overlaps for better performance (early exit on first match)
    const maxOverlap = Math.min(trimmedCompletion.length, trimmedSuffix.length);

    // Limit search to reasonable overlap lengths for performance
    const searchLimit = Math.min(maxOverlap, 50);

    for (let i = searchLimit; i >= 1; i--) {
      const completionEnd = trimmedCompletion.slice(-i);
      const suffixStart = trimmedSuffix.slice(0, i);

      // First try exact match for performance
      if (completionEnd === suffixStart) {
        bestOverlapLength = i;
        bestOriginalLength = i;
        break;
      }

      // Then try whitespace-flexible match
      const flexibleOverlap = findFlexibleOverlap(completionEnd, suffixStart);
      if (flexibleOverlap > 0 && flexibleOverlap > bestOriginalLength) {
        bestOverlapLength = flexibleOverlap;
        bestOriginalLength = flexibleOverlap;
        break;
      }
    }

    // Also check for partial semantic overlaps (like "){"  matching " ) { ")
    if (bestOverlapLength === 0) {
      // Extract significant characters (non-whitespace) from end of completion
      const significantCharsRegex = /[^\s]+[\s]*$/;
      const compMatch = trimmedCompletion.match(significantCharsRegex);

      if (compMatch) {
        const significantEnd = compMatch[0];
        const normalizedSignificant = normalizeWhitespace(significantEnd);

        // Check if this appears at the start of suffix (with flexible whitespace)
        for (let i = 1; i <= Math.min(significantEnd.length + 10, trimmedSuffix.length); i++) {
          const suffixStart = trimmedSuffix.slice(0, i);
          const normalizedSuffStart = normalizeWhitespace(suffixStart);

          if (normalizedSignificant === normalizedSuffStart) {
            bestOverlapLength = significantEnd.length;
            break;
          }
        }
      }
    }

    // Remove the overlapping part from the completion
    if (bestOverlapLength > 0) {
      const result = trimmedCompletion.slice(0, -bestOverlapLength);
      return result;
    }

    return completion;
  }

  private async checkModelInsertSupport(): Promise<boolean> {
    try {
      const response = await axios.post(`${this.ollama_host}/api/show`, {
        name: this.model_name
      });

      if (response.status === 200 && response.data) {
        // Check if the model template or parameters indicate insert support
        const modelInfo = response.data;
        const template = modelInfo.template || '';
        const parameters = modelInfo.parameters || {};

        // Look for FIM/insert indicators in the template or model info
        const hasInsertSupport = template.includes('fim') ||
                                template.includes('suffix') ||
                                template.includes('<fim_') ||
                                template.includes('<|fim_') ||
                                template.includes('.Suffix') ||
                                parameters.stop?.includes('<fim_middle>')

        return hasInsertSupport;
      }
    } catch (error) {
      console.warn(`Failed to check model insert support: ${error}`);
    }
    return false;
  }

  private buildOllamaOptions(payload: any) {
    const options: any = {};

    if (payload.max_tokens || payload.max_new_tokens) options.num_predict = payload.max_tokens || payload.max_new_tokens;

    if (payload.stop) options.stop = Array.isArray(payload.stop) ? payload.stop : [payload.stop];

    if (payload.temperature !== undefined) options.temperature = payload.temperature;
    if (payload.top_p !== undefined) options.top_p = payload.top_p;

    if (payload.top_k !== undefined) options.top_k = payload.top_k;

    if (payload.repeat_penalty !== undefined) options.repeat_penalty = payload.repeat_penalty;

    if (payload.seed !== undefined) options.seed = payload.seed;
    return Object.keys(options).length > 0 ? options : undefined;
  }

  override async _makeRequest(payload: any, rType: AIRequestType): Promise<string | any> {
    this.event.emit("onInference");

    const endpoint = this.getEndpointForRequestType(rType);
    const options = this.buildOllamaOptions(payload);
    let requestPayload = payload

    if (rType === AIRequestType.COMPLETION) {
      // Use /api/generate for completion requests
      if (options) {
        requestPayload.options = options;
      }
    } else {
      // Use /api/chat for general requests
      requestPayload = {
        model: this.model_name,
        messages: payload.messages || [{ role: "user", content: payload.prompt || "" }],
        stream: false,
        system: payload.system
      };
      if (options) requestPayload.options = options;

      if (payload.tools && Array.isArray(payload.tools) && payload.tools.length > 0) {
        requestPayload.tools = payload.tools;
      }

      if (payload.tool_choice) {
        requestPayload.tool_choice = payload.tool_choice;
      }

      if (payload.format) {
        requestPayload.format = payload.format;
      }
    }

    try {
      const result = await axios.post(endpoint, requestPayload, {
        headers: { "Content-Type": "application/json" },
      });

      if (result.status === 200) {
        let text = "";
        if (rType === AIRequestType.COMPLETION) {
          const rawResponse = result.data.response || "";

          // Skip sanitization for any FIM-capable models (user-selected or API-detected)
          const userSelectedFIM = this.fimManager.supportsFIM(this.model_name);
          const hasAnyFIM = userSelectedFIM || this.modelSupportsInsert;

          if (hasAnyFIM) {
            text = rawResponse;
          } else {
            text = sanitizeCompletionText(rawResponse);
          }
        } else {
          const message = result.data.message;
          text = message?.content || "";

          if (message?.tool_calls && Array.isArray(message.tool_calls)) {
            return {
              content: text.trimStart(),
              tool_calls: message.tool_calls
            };
          }
        }
        return text.trimStart();
      } else {
        return defaultErrorMessage;
      }
    } catch (e: any) {
      return defaultErrorMessage;
    } finally {
      this.event.emit("onInferenceDone");
    }
  }

  override async _streamInferenceRequest(payload: any, rType: AIRequestType) {
    this.event.emit("onInference");

    const endpoint = this.getEndpointForRequestType(rType);
    const options = this.buildOllamaOptions(payload);
    let streamPayload: any;

    if (rType === AIRequestType.COMPLETION) {
      // Use /api/generate for completion requests
      streamPayload = {
        model: this.model_name,
        prompt: payload.prompt || payload.messages?.[0]?.content || "",
        stream: true,
        system: payload.system || CODE_COMPLETION_PROMPT
      };
      if (options) {
        streamPayload.options = options;
      }
    } else {
      // Use /api/chat for general requests
      streamPayload = {
        model: this.model_name,
        messages: payload.messages || [{ role: "user", content: payload.prompt || "" }],
        stream: true,
        system: payload.system
      };
      if (options) {
        streamPayload.options = options;
      }

      if (payload.tools && Array.isArray(payload.tools) && payload.tools.length > 0) {
        streamPayload.tools = payload.tools;
      }

      if (payload.tool_choice) {
        streamPayload.tool_choice = payload.tool_choice;
      }

      if (payload.format) {
        streamPayload.format = payload.format;
      }
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(streamPayload),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      if (payload.return_stream_response) {
        return response
      }

      // Use the centralized Ollama stream handler
      let resultText = "";
      await HandleOllamaResponse(
        response,
        (chunk: string) => {
          resultText += chunk;
          this.event.emit("onStreamResult", chunk);
        },
        (finalText: string) => {
          resultText = finalText;
        }
      );

      return resultText;
    } catch (e: any) {
      return defaultErrorMessage;
    } finally {
      this.event.emit("onInferenceDone");
    }
  }

  private _buildPayload(prompt: string, payload: any, system?: string, promptWithHistory?: any) {
    if (promptWithHistory && promptWithHistory.length > 0) {
      promptWithHistory.push({ role: "user", content: prompt });
    }

    let messages = (promptWithHistory && promptWithHistory.length > 0)
      ? promptWithHistory
      : [{ role: "user", content: prompt }];

    // If toolsMessages are provided (from MCP tool execution), append them
    if (payload.toolsMessages && Array.isArray(payload.toolsMessages)) {
      messages = [...messages, ...payload.toolsMessages];
    }

    return {
      model: this.model_name,
      system: system || CHAT_PROMPT,
      messages,
      ...payload
    };
  }

  private _buildCompletionPayload(prompt: string, system?:string) {
    return {
      model: this.model_name,
      system: system || CHAT_PROMPT,
      prompt: prompt,
      stream: false,
      stop:[]
    };
  }

  async buildCompletionPrompt(prfx:string, srfx:string) {
    const prompt = prfx + '<CURSOR>' + srfx;
    return `Complete the code at the <CURSOR> position. Provide only the code that should be inserted at the cursor position, without any explanations or markdown formatting:\n\n${prompt}`;
  }

  async code_completion(prompt: string, promptAfter: string, ctxFiles: any, fileName: any, options: IParams = CompletionParams): Promise<any> {
    // Store the suffix for overlap removal
    this.currentSuffix = promptAfter || "";

    let payload: any;
    const userSelectedFIM = this.fimManager.supportsFIM(this.model_name);

    if (!userSelectedFIM && this.modelSupportsInsert === null) {
      this.modelSupportsInsert = await this.checkModelInsertSupport();
    }

    const hasNativeFIM = userSelectedFIM ? this.fimManager.usesNativeFIM(this.model_name) : this.modelSupportsInsert;
    const hasTokenFIM = userSelectedFIM && !this.fimManager.usesNativeFIM(this.model_name);

    if (hasNativeFIM) {
      // Native FIM support (prompt/suffix parameters)
      trackMatomoEvent('ai', 'remixAI', `ollama_fim_native:${this.model_name}`);
      payload = {
        model: this.model_name,
        prompt: prompt,
        suffix: promptAfter,
        stream: false,
        stop:options.stop
      };
    } else if (hasTokenFIM) {
      trackMatomoEvent('ai', 'remixAI', `ollama_fim_token_based:${this.model_name}`);
      const fimPrompt = this.fimManager.buildFIMPrompt(prompt, promptAfter, this.model_name);
      payload = {
        model: this.model_name,
        prompt: fimPrompt,
        stream: false,
        stop:options.stop
      };
    } else {
      trackMatomoEvent('ai', 'remixAI', `ollama_completion_no_fim:${this.model_name}`);
      const completionPrompt = await this.buildCompletionPrompt(prompt, promptAfter);
      payload = this._buildCompletionPayload(completionPrompt, CODE_COMPLETION_PROMPT);
      payload.stop = options.stop
    }

    const result = await this._makeRequest(payload, AIRequestType.COMPLETION);

    // Apply suffix overlap removal if we have both result and suffix
    if (result && this.currentSuffix) {
      const beforeLength = result.length;
      const cleaned = this.removeSuffixOverlap(result, this.currentSuffix);
      trackMatomoEvent('ai', 'remixAI', `ollama_suffix_overlap_removed:before:${beforeLength}|after:${cleaned.length}`);
      return cleaned;
    }

    trackMatomoEvent('ai', 'remixAI', `ollama_code_completion_complete:length:${result?.length || 0}`);
    return result;
  }

  async code_insertion(msg_pfx: string, msg_sfx: string, ctxFiles: any, fileName: any, options: IParams = GenerationParams): Promise<any> {
    trackMatomoEvent('ai', 'remixAI', `ollama_code_insertion:model:${this.model_name}`);
    // Delegate to code_completion which already handles suffix overlap removal
    return await this.code_completion(msg_pfx, msg_sfx, ctxFiles, fileName, options);
  }

  async code_generation(prompt: string, options: IParams = GenerationParams): Promise<any> {
    trackMatomoEvent('ai', 'remixAI', `ollama_code_generation:model:${this.model_name}|stream:${!!options.stream_result}`);
    const payload = this._buildPayload(prompt, options, CODE_GENERATION_PROMPT);
    if (options.stream_result) {
      return await this._streamInferenceRequest(payload, AIRequestType.GENERAL);
    } else {
      return await this._makeRequest(payload, AIRequestType.GENERAL);
    }
  }

  async generate(userPrompt: string, options: IParams = GenerationParams): Promise<any> {
    trackMatomoEvent('ai', 'remixAI', `ollama_generate_contract:model:${this.model_name}|stream:${!!options.stream_result}`);
    const payload = this._buildPayload(userPrompt, options, CONTRACT_PROMPT);
    if (options.stream_result) {
      return await this._streamInferenceRequest(payload, AIRequestType.GENERAL);
    } else {
      return await this._makeRequest(payload, AIRequestType.GENERAL);
    }
  }

  async generateWorkspace(prompt: string, options: IParams = GenerationParams): Promise<any> {
    trackMatomoEvent('ai', 'remixAI', `ollama_generate_workspace:model:${this.model_name}|stream:${!!options.stream_result}`);
    const payload = this._buildPayload(prompt, options, WORKSPACE_PROMPT);

    if (options.stream_result) {
      return await this._streamInferenceRequest(payload, AIRequestType.GENERAL);
    } else {
      return await this._makeRequest(payload, AIRequestType.GENERAL);
    }
  }

  async answer(prompt: string, options: IParams = GenerationParams): Promise<any> {
    trackMatomoEvent('ai', 'remixAI', `ollama_chat_answer:model:${this.model_name}|stream:${!!options.stream_result}|tools:${!!options.tools}`);
    const chatHistory = buildChatPrompt()
    const payload = this._buildPayload(prompt, options, CHAT_PROMPT, chatHistory);
    if (options.stream_result) {
      return await this._streamInferenceRequest(payload, AIRequestType.GENERAL);
    } else {
      return await this._makeRequest(payload, AIRequestType.GENERAL);
    }
  }

  async code_explaining(prompt: string, context: string = "", options: IParams = GenerationParams): Promise<any> {
    trackMatomoEvent('ai', 'remixAI', `ollama_code_explaining:model:${this.model_name}|stream:${!!options.stream_result}|tools:${!!options.tools}`);
    const payload = this._buildPayload(prompt, options, CODE_EXPLANATION_PROMPT);
    if (options.stream_result) {
      return await this._streamInferenceRequest(payload, AIRequestType.GENERAL);
    } else {
      const req = await this._makeRequest(payload, AIRequestType.GENERAL);
      return { result:req }
    }
  }

  async error_explaining(prompt: string, options: IParams = GenerationParams): Promise<any> {
    trackMatomoEvent('ai', 'remixAI', `ollama_error_explaining:model:${this.model_name}|stream:${!!options.stream_result}`);
    const payload = this._buildPayload(prompt, options, ERROR_EXPLANATION_PROMPT);
    if (options.stream_result) {
      return await this._streamInferenceRequest(payload, AIRequestType.GENERAL);
    } else {
      return await this._makeRequest(payload, AIRequestType.GENERAL);
    }
  }

  async vulnerability_check(prompt: string, options: IParams = GenerationParams): Promise<any> {
    trackMatomoEvent('ai', 'remixAI', `ollama_vulnerability_check:model:${this.model_name}|stream:${!!options.stream_result}`);
    const payload = this._buildPayload(prompt, options, SECURITY_ANALYSIS_PROMPT);
    if (options.stream_result) {
      return await this._streamInferenceRequest(payload, AIRequestType.GENERAL);
    } else {
      return await this._makeRequest(payload, AIRequestType.GENERAL);
    }
  }
}
