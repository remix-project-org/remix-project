import { AgentMiddleware, BaseMessage, ModelRequest, WrapModelCallHandler, trimMessages } from 'langchain'

/**
 * Custom middleware for DeepAgent with beforeModel hook functionality
 */
export class RemixDeepAgentMiddleware implements AgentMiddleware {
  name = 'RemixDeepAgentMiddleware'

  /**
   * Hook called before each model invocation
   * @param request - The model request object
   * @param handler - Function to call the actual model
   * @returns The result from the model call
   */
  async wrapModelCall(request: ModelRequest, handler: WrapModelCallHandler) {
    console.log(request)
    // Before model call - log the request
    console.log('[RemixDeepAgentMiddleware] Before model call:', {
      messages: request?.messages?.length || 0,
      timestamp: new Date().toISOString()
    })
    
    removePeviousContextFromMessages(request)
    // await summarizeOldMessages(request)
    shortenToolDescription(request)    
    
    // Call the actual model
    const result = await handler(request as any)
    
    // After model call - log completion
    console.log('[RemixDeepAgentMiddleware] After model call completed')
    
    return result
  }
}

const removePeviousContextFromMessages = (request: ModelRequest) => {
  // Optimize message history by removing context from all human messages except the last one
  if (request.messages && request.messages.length > 1) {
    for (let i = 0; i < request.messages.length - 1; i++) {
      const message = request.messages[i]
      if (typeof message.content === 'string') {
        const content = message.content
        if (content.startsWith('Context:')) {
          const questionIndex = content.indexOf('Question:')
          if (questionIndex !== -1) {
            // Strip out everything between "Context:" and "Question:", including "Question:"
            const newContent = content.substring(questionIndex + 'Question:'.length).trim()
            ;(message as any).content = newContent
            console.log(`[RemixDeepAgentMiddleware] Stripped context from message ${i}`)
          }
        }
      }
    }
  }
}

const shortenToolDescription = (request: ModelRequest) => {
  request.tools.find((tool) => {
    if (tool.name === 'write_todos') {
      tool.description = shortWriteTodosDescription
    }
  })
}

function dummyTokenCounter(messages: BaseMessage[]): number {
  // treat each message like it adds 3 default tokens at the beginning
  // of the message and at the end of the message. 3 + 4 + 3 = 10 tokens
  // per message.

  const defaultContentLen = 4;
  const defaultMsgPrefixLen = 3;
  const defaultMsgSuffixLen = 3;

  let count = 0;
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      count += defaultMsgPrefixLen + defaultContentLen + defaultMsgSuffixLen;
    }
    if (Array.isArray(msg.content)) {
      count +=
        defaultMsgPrefixLen +
        msg.content.length * defaultContentLen +
        defaultMsgSuffixLen;
    }
  }
  return count;
}

const summarizeOldMessages = async (request: ModelRequest) => {
  if (request.messages && request.messages.length > 6) {
    request.messages = await trimMessages(request.messages, {
      maxTokens: 40,
      tokenCounter: dummyTokenCounter,
      strategy: "first",
      includeSystem: true,
      allowPartial: true,
      startOn: "human",
    });
  }
}

const shortWriteTodosDescription = 'Create and manage a structured task list for the current work session to track progress on complex, multi-step work. Use when: a task has 3+ distinct steps, requires planning across multiple operations, the user provides multiple tasks, or the user explicitly requests a todo list. Skip for trivial, single-step, or purely conversational requests where tracking adds no value. Mark tasks as in_progress before starting and completed immediately after finishing — never mark complete if blocked, partial, or errored. Always keep at least one task in_progress until all are done, and update the list in real time as scope changes.'