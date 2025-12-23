import { JsonStreamParser, IAIStreamResponse } from '../types/types';

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
      const { done, value } = await reader.read();
      if (done) break;

      try {
        const chunk = parser.safeJsonParse<{ generatedText: string; isGenerating: boolean }>(decoder.decode(value, { stream: true }));
        for (const parsedData of chunk) {
          resultText += parsedData.generatedText;
          if (cb) {
            cb(parsedData.generatedText);
          }
        }
      } catch (error) {
        console.error('Error parsing JSON:', error);
        const errorMessage = "Error: Unable to decode the AI response. Please try again.";
        cb(errorMessage);
        done_cb?.(errorMessage);
        return;
      }
    }

    if (done_cb) {
      done_cb(resultText);
    }
  } catch (error) {
    console.error('Error processing stream response:', error);
  }
};

export const HandleOpenAIResponse = async (aiResponse: IAIStreamResponse | any, cb: (streamText: string) => void, done_cb?: (result: string, thrID:string) => void) => {
  // Handle both IAIStreamResponse format and plain response for backward compatibility
  const streamResponse = aiResponse?.streamResponse || aiResponse
  const uiToolCallback = aiResponse?.uiToolCallback
  const tool_callback = aiResponse?.callback
  const reader = streamResponse.body?.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let threadId: string = ""
  let resultText = "";
  const toolCalls: Map<number, any> = new Map(); // Accumulate tool calls by index

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

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer = decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // Keep the unfinished line for next chunk

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const jsonStr = line.replace(/^data: /, "").trim();
        if (jsonStr === "[DONE]") {
          done_cb?.(resultText, threadId);
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

            if (response && typeof response === 'object') {
              response.uiToolCallback = uiToolCallback;
            }
            cb("\n\n");
            HandleOpenAIResponse(response, cb, done_cb)
            return;
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
          console.error("⚠️ OpenAI Stream parse error:", e);
          console.error("Problematic JSON string:", jsonStr);
          // Skip this chunk and continue processing the stream
          continue;
        }
      }
    }
  }
}

export const HandleMistralAIResponse = async (aiResponse: IAIStreamResponse | any, cb: (streamText: string) => void, done_cb?: (result: string, thrID:string) => void) => {
  // Handle both IAIStreamResponse format and plain response for backward compatibility
  const streamResponse = aiResponse?.streamResponse || aiResponse
  const tool_callback = aiResponse?.callback
  const uiToolCallback = aiResponse?.uiToolCallback
  const reader = streamResponse.body?.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let threadId: string = ""
  let resultText = "";

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

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer = decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const jsonStr = line.replace(/^data: /, "").trim();
        if (jsonStr === "[DONE]") {
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
          if (json.choices[0].delta.tool_calls && tool_callback){
            const toolCalls = json.choices[0].delta.tool_calls;
            const response = await tool_callback(toolCalls, uiToolCallback)

            if (response && typeof response === 'object') {
              response.uiToolCallback = uiToolCallback;
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
          console.error("MistralAI Stream parse error:", e);
          console.error("Problematic JSON string:", jsonStr);
          // Skip this chunk and continue processing the stream
          continue;
        }
      }
    }
  }
}

export const HandleAnthropicResponse = async (aiResponse: IAIStreamResponse | any, cb: (streamText: string) => void, done_cb?: (result: string, thrID:string) => void) => {
  // Handle both IAIStreamResponse format and plain response for backward compatibility
  const streamResponse = aiResponse?.streamResponse || aiResponse
  const uiToolCallback = aiResponse?.uiToolCallback
  const tool_callback = aiResponse?.callback
  const reader = streamResponse.body?.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let resultText = "";
  const toolUseBlocks: Map<number, any> = new Map();
  let currentBlockIndex: number = -1;

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

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer = decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // Keep the unfinished line for next chunk
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const jsonStr = line.replace(/^data: /, "").trim();

        // Skip empty or invalid JSON strings
        if (!jsonStr || jsonStr.length === 0) {
          continue;
        }

        try {
          const json = JSON.parse(jsonStr);

          if (json.type === "message_stop"){
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
              uiToolCallback?.(true);
              const response = await tool_callback(toolCalls)
              uiToolCallback?.(false);
              // Keep the callback attached for recursive calls
              if (response && typeof response === 'object') {
                response.uiToolCallback = uiToolCallback;
              }
              cb("\n\n");
              HandleAnthropicResponse(response, cb, done_cb)
              return;
            }
          }

          // Handle text content deltas
          if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
            cb(json.delta.text);
            resultText += json.delta.text;
          }
        } catch (e) {
          console.error("Anthropic Stream parse error:", e);
          console.error("Problematic JSON string:", jsonStr);
          // Skip this chunk and continue processing the stream
          continue;
        }
      }
    }
  }
}

export const HandleOllamaResponse = async (aiResponse: IAIStreamResponse | any, cb: (streamText: string) => void, done_cb?: (result: string) => void, reasoning_cb?: (result: string) => void) => {
  // Handle both IAIStreamResponse format and plain response for backward compatibility
  const streamResponse = aiResponse?.streamResponse || aiResponse
  const tool_callback = aiResponse?.callback
  const uiToolCallback = aiResponse?.uiToolCallback
  const reader = streamResponse.body?.getReader();
  const decoder = new TextDecoder("utf-8");
  let resultText = "";
  let inThinking = false;

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
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          let content = "";

          // Handle tool calls in Ollama format
          if (parsed.message?.tool_calls && tool_callback) {
            const toolCalls = parsed.message.tool_calls;
            const response = await tool_callback(toolCalls, uiToolCallback)
            // Keep the callback attached for recursive calls
            if (response && typeof response === 'object') {
              response.uiToolCallback = uiToolCallback;
            }
            cb("\n\n");
            HandleOllamaResponse(response, cb, done_cb, reasoning_cb)
            return;
          }

          if (parsed.message?.thinking) {
            reasoning_cb?.('***Thinking ...***')
            inThinking = true
            continue
          }

          if (parsed.response) {
            // For /api/generate endpoint
            content = parsed.response;
          } else if (parsed.message?.content) {
            if (inThinking) {
              reasoning_cb?.("")
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
            done_cb?.(resultText);
            return;
          }
        } catch (parseError) {
          console.warn("Ollama: Skipping invalid JSON line:", line);
          continue;
        }
      }
    }

    done_cb?.(resultText);
  } catch (error) {
    console.error("Ollama Stream error:", error);
    done_cb?.(resultText);
  }
}
