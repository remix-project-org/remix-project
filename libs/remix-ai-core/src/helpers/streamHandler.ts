import { remixAILogger } from './logger'
import { JsonStreamParser, IAIStreamResponse } from '../types/types';

function trackTokenUsage(usage: any, provider?: string, modelId?: string) {
  try {
    if (!usage) return;

    let userId: string | undefined;
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const userStr = window.localStorage?.getItem('remix_user');
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          userId = user.sub || user.id;
        } catch (e) {
        }
      }

      // If no user ID, create or retrieve a random session ID
      if (!userId) {
        let sessionId = window.sessionStorage.getItem('remix_random_session_id');
        if (!sessionId) {
          sessionId = `random_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
          window.sessionStorage.setItem('remix_random_session_id', sessionId);
        }
        userId = sessionId;
      }
    }

    if (typeof window !== 'undefined' && (window as any)._matomoManagerInstance) {
      const eventName = [
        provider ? `provider:${provider}` : '',
        modelId ? `model:${modelId}` : '',
        usage.prompt_tokens ? `prompt_tokens:${usage.prompt_tokens}` : '',
        usage.completion_tokens ? `completion_tokens:${usage.completion_tokens}` : '',
        usage.total_tokens ? `total_tokens:${usage.total_tokens}` : '',
        userId ? `user_id:${userId}` : ''
      ].filter(Boolean).join('|');

      if (eventName) {
        (window as any)._matomoManagerInstance.trackEvent('ai', 'remixAI', `token_usage|${eventName}`);
      }
    }
  } catch (error) {
    remixAILogger.log('Token usage tracking error:', error);
  }
}

export const HandleSimpleResponse = async (response, cb?: (streamText: string) => void) => {
  let resultText = '';
  const parser = new JsonStreamParser();

  const chunk = parser.safeJsonParse<{ generatedText: string; isGenerating: boolean }>(response);
  for (const parsedData of chunk) {
    resultText += parsedData.generatedText;
    if (cb) {
      cb(parsedData.generatedText);
    }
  }
};

export const HandleStreamResponse = async (streamResponse, cb: (streamText: string) => void, done_cb?: (result: string) => void) => {
  try {
    let resultText = '';
    const parser = new JsonStreamParser();
    const reader = streamResponse.body?.getReader();
    const decoder = new TextDecoder();
    const abortSignal = streamResponse?.abortSignal;

    // Check for missing body in the streamResponse
    if (!reader) {
      // most likely no stream response, so we can just return the result
      if (streamResponse.result) {
        cb(streamResponse.result)
        done_cb?.(streamResponse.result);
      } else {
        const errorMessage = "Error: Unable to to process your request. Try again!";
        cb(errorMessage);
        done_cb?.(errorMessage);
      }
      return;
    }

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Check if aborted
      if (abortSignal?.aborted) {
        reader.cancel().catch(() => {});
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      try {
        const chunk = parser.safeJsonParse<{ generatedText: string; isGenerating: boolean }>(decoder.decode(value, { stream: true }));
        for (const parsedData of chunk) {
          // Check if aborted before processing each chunk
          if (abortSignal?.aborted) {
            reader.cancel().catch(() => {});
            return;
          }
          resultText += parsedData.generatedText;
          if (cb) {
            cb(parsedData.generatedText);
          }
        }
      } catch (error) {
        remixAILogger.error('Error parsing JSON:', error);
        const errorMessage = "Network Error: Unable to process the AI response. Please try again";
        cb(errorMessage);
        done_cb?.(errorMessage);
        return;
      }
    }

    if (done_cb && !abortSignal?.aborted) {
      done_cb(resultText);
    }
  } catch (error) {
    remixAILogger.error('Error processing stream response:', error);
  }
};

export const HandleOpenAIResponse = async (aiResponse: IAIStreamResponse | any, cb: (streamText: string) => void, done_cb?: (result: string, thrID:string) => void, thinking_cb?: (isThinking: boolean) => void) => {
  // Handle both IAIStreamResponse format and plain response for backward compatibility
  const streamResponse = aiResponse?.streamResponse || aiResponse
  const uiToolCallback = aiResponse?.uiToolCallback
  const tool_callback = aiResponse?.callback
  const abortSignal = aiResponse?.abortSignal
  const modelId = aiResponse?.modelId
  const reader = streamResponse.body?.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let threadId: string = ""
  let resultText = "";
  let inThinking = false;
  const toolCalls: Map<number, any> = new Map(); // Accumulate tool calls by index
  const usage: any = null; // Track token usage

  if (!reader) { // normal response, not a stream
    if (streamResponse.result) {
      cb(streamResponse.result)
      done_cb?.(streamResponse.result, streamResponse?.threadId || "");
    } else {
      const errorMessage = "Error: Unable to to process your request. Try again!";
      cb(errorMessage);
      done_cb?.(errorMessage, streamResponse?.threadId || "");
    }
    return;
  }

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      remixAILogger.log('reader')
      // Check if aborted
      if (abortSignal?.aborted) {
        reader.cancel();
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer = decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // Keep the unfinished line for next chunk
      for (const line of lines) {
      // Check if aborted before processing each line
        if (abortSignal?.aborted) {
          reader.cancel().catch(() => {});
          return;
        }

        if (line.startsWith("data: ")) {
          const jsonStr = line.replace(/^data: /, "").trim();
          if (jsonStr === "[DONE]") {
            if (!abortSignal?.aborted) {
              trackTokenUsage(usage, 'openai', modelId);
              done_cb?.(resultText, threadId);
            }
            return;
          }

          // Skip empty JSON strings
          if (!jsonStr || jsonStr.length === 0) {
            continue;
          }

          try {
            const json = JSON.parse(jsonStr);
            threadId = json?.thread_id;

            // Handle tool calls in OpenAI format - accumulate deltas
            if (json.choices?.[0]?.delta?.tool_calls) {
              const toolCallDeltas = json.choices[0].delta.tool_calls;

              for (const delta of toolCallDeltas) {
                const index = delta.index;

                if (!toolCalls.has(index)) {
                  // Initialize new tool call
                  toolCalls.set(index, {
                    id: delta.id || "",
                    type: delta.type || "function",
                    function: {
                      name: delta.function?.name || "",
                      arguments: delta.function?.arguments || ""
                    }
                  });
                } else {
                  // Accumulate deltas
                  const existing = toolCalls.get(index);
                  if (delta.id) existing.id = delta.id;
                  if (delta.function?.name) existing.function.name += delta.function.name;
                  if (delta.function?.arguments) existing.function.arguments += delta.function.arguments;
                }
              }
            }

            // Check if this is the finish reason for tool calls
            if (json.choices?.[0]?.finish_reason === "tool_calls" && tool_callback && toolCalls.size > 0) {
              const toolCallsArray = Array.from(toolCalls.values());
              const response = await tool_callback(toolCallsArray, uiToolCallback)

              // Preserve the uiToolCallback and abortSignal from the response if it exists (from subsequent calls)
              if (response && typeof response === 'object') {
                if (!response.uiToolCallback && uiToolCallback) {
                  response.uiToolCallback = uiToolCallback;
                }
                if (!response.abortSignal && abortSignal) {
                  response.abortSignal = abortSignal;
                }
              }
              cb("\n\n");
              HandleOpenAIResponse(response, cb, done_cb)
              return;
            }

            // Handle OpenAI o-series reasoning content
            const reasoningContent = json.choices?.[0]?.delta?.reasoning_content
            if (reasoningContent && reasoningContent !== '') {
              if (!inThinking) {
                inThinking = true
                thinking_cb?.(true)
              }
            } else if (inThinking && json.choices?.[0]?.delta?.content) {
              inThinking = false
              thinking_cb?.(false)
            }

            // Handle OpenAI "thread.message.delta" format
            if (json.object === "thread.message.delta" && json.delta?.content) {
              for (const contentItem of json.delta.content) {
                if (
                  contentItem.type === "text" &&
                  contentItem.text &&
                  typeof contentItem.text.value === "string"
                ) {
                  cb(contentItem.text.value);
                  resultText += contentItem.text.value;
                }
              }
            } else if (json.choices?.[0]?.delta?.content) {
              // Handle standard OpenAI streaming format
              const content = json.choices[0].delta.content;
              if (typeof content === "string") {
                cb(content);
                resultText += content;
              }
            } else if (json.delta?.content) {
              // fallback for other formats
              const content = json.delta.content;
              if (typeof content === "string") {
                cb(content);
                resultText += content;
              }
            }
          } catch (e) {
            remixAILogger.error("⚠️ OpenAI Stream parse error:", e);
            remixAILogger.error("Problematic JSON string:", jsonStr);
            const errorMessage = "Network Error: Unable to process the AI response. Please try again";
            cb(errorMessage);
            done_cb?.(errorMessage, threadId);
            thinking_cb?.(false)
            return;
          }
        }
      }
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      remixAILogger.error('Error processing OpenAI stream:', error);
    }
  }
}

export const HandleMistralAIResponse = async (aiResponse: IAIStreamResponse | any, cb: (streamText: string) => void, done_cb?: (result: string, thrID:string) => void) => {
  // Handle both IAIStreamResponse format and plain response for backward compatibility
  const streamResponse = aiResponse?.streamResponse || aiResponse
  const tool_callback = aiResponse?.callback
  const uiToolCallback = aiResponse?.uiToolCallback
  const abortSignal = aiResponse?.abortSignal
  const modelId = aiResponse?.modelId
  const reader = streamResponse.body?.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let threadId: string = ""
  let resultText = "";
  let usage: any = null; // Track token usage

  if (!reader) { // normal response, not a stream
    if (streamResponse.result) {
      cb(streamResponse.result)
      done_cb?.(streamResponse.result, streamResponse?.threadId || "");
    } else {
      const errorMessage = "Error: Unable to to process your request. Try again!";
      cb(errorMessage);
      done_cb?.(errorMessage, streamResponse?.threadId || "");
    }
    return;
  }

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Check if aborted
      if (abortSignal?.aborted) {
        reader.cancel().catch(() => {});
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer = decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.replace(/^data: /, "").trim();
          if (jsonStr === "[DONE]") {
            trackTokenUsage(usage, 'mistralai', modelId);
            done_cb?.(resultText, threadId);
            return;
          }

          // Skip empty JSON strings
          if (!jsonStr || jsonStr.length === 0) {
            continue;
          }

          try {
            const json = JSON.parse(jsonStr);
            threadId = json?.id || threadId;

            // Extract usage information if available
            if (json.usage) {
              usage = json.usage;
            }

            if (json.choices[0].delta.tool_calls && tool_callback){
              const toolCalls = json.choices[0].delta.tool_calls;
              const response = await tool_callback(toolCalls, uiToolCallback)

              // Preserve the uiToolCallback and abortSignal from the response if it exists (from subsequent calls)
              if (response && typeof response === 'object') {
                if (!response.uiToolCallback && uiToolCallback) {
                  response.uiToolCallback = uiToolCallback;
                }
                if (!response.abortSignal && abortSignal) {
                  response.abortSignal = abortSignal;
                }
              }
              HandleMistralAIResponse(response, cb, done_cb)
            } else if (json.choices[0].delta.content){
              const content = json.choices[0].delta.content
              cb(content);
              resultText += content;
            } else {
              continue
            }
          } catch (e) {
            remixAILogger.error("MistralAI Stream parse error:", e);
            remixAILogger.error("Problematic JSON string:", jsonStr);
            const errorMessage = "Network Error: Unable to process the AI response. Please try again";
            cb(errorMessage);
            done_cb?.(errorMessage, threadId);
            return;
          }
        }
      }
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      remixAILogger.error('Error processing MistralAI stream:', error);
    }
  }
}

export const HandleAnthropicResponse = async (aiResponse: IAIStreamResponse | any, cb: (streamText: string) => void, done_cb?: (result: string, thrID:string) => void, thinking_cb?: (isThinking: boolean) => void) => {
  // Handle both IAIStreamResponse format and plain response for backward compatibility
  const streamResponse = aiResponse?.streamResponse || aiResponse
  const uiToolCallback = aiResponse?.uiToolCallback
  const tool_callback = aiResponse?.callback
  const abortSignal = aiResponse?.abortSignal
  const modelId = aiResponse?.modelId
  const reader = streamResponse.body?.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let resultText = "";
  let inThinking = false;
  const toolUseBlocks: Map<number, any> = new Map();
  let currentBlockIndex: number = -1;
  let usage: any = null; // Track token usage

  if (!reader) { // normal response, not a stream
    if (streamResponse.result) {
      cb(streamResponse.result)
      done_cb?.(streamResponse.result, streamResponse?.threadId || "");
    } else {
      const errorMessage = "Error: Unable to to process your request. Try again!";
      cb(errorMessage);
      done_cb?.(errorMessage, streamResponse?.threadId || "");
    }
    return;
  }

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Check if aborted
      if (abortSignal?.aborted) {
        reader.cancel().catch(() => {});
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer = decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // Keep the unfinished line for next chunk
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.replace(/^data: /, "").trim();

          try {
            const json = JSON.parse(jsonStr);

            if (json.type === "message_delta" && json.usage) {
              usage = {
                prompt_tokens: json.usage.input_tokens,
                completion_tokens: json.usage.output_tokens,
                total_tokens: (json.usage.input_tokens || 0) + (json.usage.output_tokens || 0)
              };
            }

            if (json.type === "message_stop"){
              trackTokenUsage(usage, 'anthropic', modelId);
              done_cb?.(resultText, "");
              return;
            }

            // Handle tool use block start in Anthropic format
            if (json.type === "content_block_start" && json.content_block?.type === "tool_use") {
              currentBlockIndex = json.index;
              toolUseBlocks.set(currentBlockIndex, {
                id: json.content_block.id,
                name: json.content_block.name,
                input: ""
              });
            }

            // Accumulate tool input deltas
            if (json.type === "content_block_delta" && json.delta?.type === "input_json_delta") {
              if (currentBlockIndex >= 0 && toolUseBlocks.has(json.index)) {
                const block = toolUseBlocks.get(json.index);
                block.input += json.delta.partial_json;
              }
            }

            // Handle tool calls when message stops for tool use
            if (json.type === "message_delta" && json.delta?.stop_reason === "tool_use" && tool_callback) {

              // Convert accumulated tool use blocks to tool calls format
              const toolCalls = Array.from(toolUseBlocks.values()).map(block => ({
                id: block.id,
                function: {
                  name: block.name,
                  arguments: block.input
                }
              }));

              if (toolCalls.length > 0) {
                const response = await tool_callback(toolCalls, uiToolCallback)
                if (response && typeof response === 'object') {
                  if (!response.uiToolCallback && uiToolCallback) {
                    response.uiToolCallback = uiToolCallback;
                  }
                  if (!response.abortSignal && abortSignal) {
                    response.abortSignal = abortSignal;
                  }
                }
                cb("\n\n");
                HandleAnthropicResponse(response, cb, done_cb)
                return;
              }
            }

            // Handle thinking block start in Anthropic format
            if (json.type === "content_block_start" && json.content_block?.type === "thinking") {
              if (!inThinking) {
                inThinking = true
                thinking_cb?.(true)
              }
            }

            // Handle thinking block stop
            if (json.type === "content_block_stop" && inThinking) {
              inThinking = false
              thinking_cb?.(false)
            }

            // Suppress thinking deltas from regular content
            if (json.type === "content_block_delta" && json.delta?.type === "thinking_delta") {
              continue;
            }

            // Handle text content deltas
            if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
              cb(json.delta.text);
              resultText += json.delta.text;
            }
          } catch (e) {
            remixAILogger.error("Anthropic Stream parse error:", e);
            remixAILogger.error("Problematic JSON string:", jsonStr);
            const errorMessage = "Network Error: Unable to process the AI response. Please try again";
            cb(errorMessage);
            done_cb?.(errorMessage, "");
            thinking_cb?.(false)
            return;
          }
        }
      }
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      remixAILogger.error('Error processing Anthropic stream:', error);
    }
  }
}

export const HandleOllamaResponse = async (aiResponse: IAIStreamResponse | any, cb: (streamText: string) => void, done_cb?: (result: string) => void, reasoning_cb?: (result: string) => void, thinking_cb?: (isThinking: boolean) => void) => {
  // Handle both IAIStreamResponse format and plain response for backward compatibility
  const streamResponse = aiResponse?.streamResponse || aiResponse
  const tool_callback = aiResponse?.callback
  const uiToolCallback = aiResponse?.uiToolCallback
  const abortSignal = aiResponse?.abortSignal
  const modelId = aiResponse?.modelId
  const reader = streamResponse.body?.getReader();
  const decoder = new TextDecoder("utf-8");
  let resultText = "";
  let inThinking = false;
  let usage: any = null; // Track token usage

  if (!reader) { // normal response, not a stream
    const result = streamResponse.result || streamResponse.response;
    if (result) {
      cb(result);
      done_cb?.(result);
    } else {
      const errorMessage = "Error: Unable to to process your request. Try again!";
      cb(errorMessage);
      done_cb?.(errorMessage);
    }
    return;
  }

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Check if aborted
      if (abortSignal?.aborted) {
        reader.cancel().catch(() => {});
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          let content = "";

          // Extract usage information if available (Ollama includes this in the final message)
          if (parsed.prompt_eval_count !== undefined || parsed.eval_count !== undefined) {
            usage = {
              prompt_tokens: parsed.prompt_eval_count,
              completion_tokens: parsed.eval_count,
              total_tokens: (parsed.prompt_eval_count || 0) + (parsed.eval_count || 0)
            };
          }

          // Handle tool calls in Ollama format
          if (parsed.message?.tool_calls && tool_callback) {
            const toolCalls = parsed.message.tool_calls;
            const response = await tool_callback(toolCalls, uiToolCallback)
            // Keep the callback attached for recursive calls
            // Preserve the uiToolCallback and abortSignal from the response if it exists (from subsequent calls)
            if (response && typeof response === 'object') {
              if (!response.uiToolCallback && uiToolCallback) {
                response.uiToolCallback = uiToolCallback;
              }
              if (!response.abortSignal && abortSignal) {
                response.abortSignal = abortSignal;
              }
            }
            cb("\n\n");
            HandleOllamaResponse(response, cb, done_cb, reasoning_cb, thinking_cb)
            return;
          }

          if (parsed.message?.thinking) {
            thinking_cb?.(true)
            inThinking = true
            continue
          }

          if (parsed.response) {
            // For /api/generate endpoint
            content = parsed.response;
          } else if (parsed.message?.content) {
            if (inThinking) {
              thinking_cb?.(false)
              inThinking = false
            }
            // For /api/chat endpoint
            content = parsed.message.content;
          }

          if (content) {
            cb(content);
            resultText += content;
          }

          if (parsed.done) {
            trackTokenUsage(usage, 'ollama', modelId);
            done_cb?.(resultText);
            return;
          }
        } catch (parseError) {
          remixAILogger.error("Ollama Stream parse error:", parseError);
          remixAILogger.error("Problematic JSON line:", line);
          const errorMessage = "Network Error: Unable to process the AI response. Please try again";
          cb(errorMessage);
          done_cb?.(errorMessage);
          return;
        }
      }
    }

    trackTokenUsage(usage, 'ollama', modelId);
    done_cb?.(resultText);
  } catch (error) {
    remixAILogger.error("Ollama Stream error:", error);
    trackTokenUsage(usage, 'ollama', modelId);
    done_cb?.(resultText);
  }
}
