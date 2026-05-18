import { AIMessage, AgentMiddleware, BaseMessage, ModelRequest, WrapModelCallHandler, trimMessages } from 'langchain'

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
    shortenToolDescription(request)

    // Call the actual model
    const result = await handler(request as any)
    
    // After model call - log completion
    console.log('[RemixDeepAgentMiddleware] After model call completed')
    
    return result
  }
}

const removePeviousContextFromMessages = (request: ModelRequest) => {
  console.log('[RemixDeepAgentMiddleware] Removing previous context from messages if present', request)
  // Optimize message history by removing context from all human messages except the last one
  if (request.messages && request.messages.length > 1) {
    for (let i = 0; i < request.messages.length - 1; i++) {
      const message = request.messages[i]
      if (typeof message.content === 'string') {
        console.log(`[RemixDeepAgentMiddleware] Processing string content for message ${i}`)
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
      // Handle array content (complex message types for Mistral, OpenAI, etc.)
      else if (Array.isArray(message.content)) {
        console.log(`[RemixDeepAgentMiddleware] Processing array content for message ${i}`)
        for (let j = 0; j < message.content.length; j++) {
          const contentPart = message.content[j]
          // Only process text type content
          if (contentPart.type === 'text' && typeof contentPart.text === 'string') {
            const text = contentPart.text
            if (text.startsWith('Context:')) {
              const questionIndex = text.indexOf('Question:')
              if (questionIndex !== -1) {
                // Strip out everything between "Context:" and "Question:", including "Question:"
                const newText = text.substring(questionIndex + 'Question:'.length).trim()
                contentPart.text = newText
                console.log(`[RemixDeepAgentMiddleware] Stripped context from message ${i}, part ${j}`)
              }
            }
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
    if (tool.name === 'task') {
      tool.description = shortTaskDescription
    }
  })
}

const shortWriteTodosDescription = 'Create and manage a structured task list for the current work session to track progress on complex, multi-step work. Use when: a task has 3+ distinct steps, requires planning across multiple operations, the user provides multiple tasks, or the user explicitly requests a todo list. Skip for trivial, single-step, or purely conversational requests where tracking adds no value. Mark tasks as in_progress before starting and completed immediately after finishing — never mark complete if blocked, partial, or errored. Always keep at least one task in_progress until all are done, and update the list in real time as scope changes.'
const shortTaskDescription = `Launch ephemeral subagents for complex, isolated, or parallelizable tasks. Each runs statelessly and returns one final report.
## Agent Types
- general-purpose — all tools; research, multi-step tasks, broad searches
- Solidity Engineer — write/optimize Solidity
- Security Auditor — vulnerability review
- Gas Optimizer — gas usage tuning
- Code Reviewer — code quality feedback
- Comprehensive Auditor — full contract audits
- Web3 Educator — explain Web3 concepts
- Frontend Specialist — UI/frontend work
- Web Search Specialist — web retrieval
- Etherscan / TheGraph / Alchemy / Circle Specialist — platform-specific data & docs
- Debug Specialist — troubleshoot contracts
- Conversion Utilities Specialist — data format conversions
## Usage Rules
1. Always pass \`subagent_type\`.
2. Launch agents in parallel (single message, multiple tool calls) when tasks are independent.
3. Give each agent a detailed, self-contained prompt — they can't ask follow-ups.
4. State whether you want research, analysis, or content creation.
5. Agent output isn't shown to user — summarize it back.
6. Use proactively when an agent's description says so.
7. Skip subagents for trivial tasks; call tools directly.
## When to Use
- Complex research across multiple subjects (run in parallel)
- Large/context-heavy analysis (isolate from main thread)
- Independent parallel deliverables
## When Not to Use
- Simple tasks needing only a few direct tool calls

### Example usage of the general-purpose agent:

<example_agent_descriptions>
"general-purpose": use this agent for general purpose tasks, it has access to all tools as the main agent.
</example_agent_descriptions>

<example>
User: "I want to conduct research on the accomplishments of Lebron James, Michael Jordan, and Kobe Bryant, and then compare them."
Assistant: *Uses the task tool in parallel to conduct isolated research on each of the three players*
Assistant: *Synthesizes the results of the three isolated research tasks and responds to the User*
<commentary>
Research is a complex, multi-step task in it of itself.
The research of each individual player is not dependent on the research of the other players.
The assistant uses the task tool to break down the complex objective into three isolated tasks.
Each research task only needs to worry about context and tokens about one player, then returns synthesized information about each player as the Tool Result.
This means each research task can dive deep and spend tokens and context deeply researching each player, but the final result is synthesized information, and saves us tokens in the long run when comparing the players to each other.
</commentary>
</example>

<example>
User: "Analyze a single large code repository for security vulnerabilities and generate a report."
Assistant: *Launches a single \`task\` subagent for the repository analysis*
Assistant: *Receives report and integrates results into final summary*
<commentary>
Subagent is used to isolate a large, context-heavy task, even though there is only one. This prevents the main thread from being overloaded with details.
If the user then asks followup questions, we have a concise report to reference instead of the entire history of analysis and tool calls, which is good and saves us time and money.
</commentary>
</example>

### Example usage with custom agents:

<example_agent_descriptions>
"content-reviewer": use this agent after you are done creating significant content or documents
"greeting-responder": use this agent when to respond to user greetings with a friendly joke
"research-analyst": use this agent to conduct thorough research on complex topics
</example_agent_description>

<example>
user: "Please write a function that checks if a number is prime"
assistant: Sure let me write a function that checks if a number is prime
assistant: First let me use the Write tool to write a function that checks if a number is prime
assistant: I'm going to use the Write tool to write the following code:
<code>
function isPrime(n) {
  if (n <= 1) return false
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return false
  }
  return true
}
</code>
<commentary>
Since significant content was created and the task was completed, now use the content-reviewer agent to review the work
</commentary>
assistant: Now let me use the content-reviewer agent to review the code
assistant: Uses the Task tool to launch with the content-reviewer agent
</example>
`