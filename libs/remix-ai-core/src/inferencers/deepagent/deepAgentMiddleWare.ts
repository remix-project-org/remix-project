import { remixAILogger } from '../../helpers/logger'
/* eslint-disable no-prototype-builtins */
/* eslint-disable no-case-declarations */
/* eslint-disable no-useless-escape */
import { AIMessage, AgentMiddleware, BaseMessage, ModelRequest, WrapModelCallHandler, trimMessages } from 'langchain'
import { Plugin } from '@remixproject/engine'
import type { DeepAgentInferencer } from './DeepAgentInferencer'

/**
 * Custom middleware for DeepAgent with beforeModel hook functionality
 */
export class RemixDeepAgentMiddleware implements AgentMiddleware {
  name = 'RemixDeepAgentMiddleware'

  constructor (private plugin: Plugin, private inferencer: DeepAgentInferencer) {
    this.plugin = plugin
    this.inferencer = inferencer
  }

  /**
   * Hook called before each model invocation
   * @param request - The model request object
   * @param handler - Function to call the actual model
   * @returns The result from the model call
   */
  async wrapModelCall(request: ModelRequest, handler: WrapModelCallHandler) {
    // Before model call - log the request
    remixAILogger.log('[RemixDeepAgentMiddleware] Before model call:', {
      messages: request?.messages?.length || 0,
      timestamp: new Date().toISOString()
    })

    removePeviousContextFromMessages(request)
    await shortenToolDescription(request, this.plugin, this.inferencer)

    // Call the actual model
    const result = await handler(request as any)

    // After model call - log completion
    remixAILogger.log('[RemixDeepAgentMiddleware] After model call completed')

    return result
  }
}

const removePeviousContextFromMessages = (request: ModelRequest) => {
  remixAILogger.log('[RemixDeepAgentMiddleware] Removing previous context from messages if present', request)
  // Optimize message history by removing context from all human messages except the last one
  if (request.messages && request.messages.length > 1) {
    for (let i = 0; i < request.messages.length - 1; i++) {
      const message = request.messages[i]
      if (typeof message.content === 'string') {
        remixAILogger.log(`[RemixDeepAgentMiddleware] Processing string content for message ${i}`)
        const content = message.content
        if (content.startsWith('Context:')) {
          const questionIndex = content.indexOf('Question:')
          if (questionIndex !== -1) {
            // Strip out everything between "Context:" and "Question:", including "Question:"
            const newContent = content.substring(questionIndex + 'Question:'.length).trim()
            ;(message as any).content = newContent
            remixAILogger.log(`[RemixDeepAgentMiddleware] Stripped context from message ${i}`)
          }
        }
      }
      // Handle array content (complex message types for Mistral, OpenAI, etc.)
      else if (Array.isArray(message.content)) {
        remixAILogger.log(`[RemixDeepAgentMiddleware] Processing array content for message ${i}`)
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
                remixAILogger.log(`[RemixDeepAgentMiddleware] Stripped context from message ${i}, part ${j}`)
              }
            }
          }
        }
      }
    }
  }
}

const shortenToolDescription = async (request: ModelRequest, plugin: Plugin, inferencer: DeepAgentInferencer) => {
  request.tools.find((tool) => {
    if (tool.name === 'write_todos') {
      // Keep a minimal description - full guidance is in system prompt
      const minDesc = 'Track and display task progress to the user. Use for multi-step tasks.'
      tool.description = minDesc;
      (tool as any).lc_kwargs.description = minDesc
    }
    if (tool.name === 'ls') {
      tool.description = '';
      (tool as any).lc_kwargs.description = ''
    }
    if (tool.name === 'read_file') {
      tool.description = '';
      (tool as any).lc_kwargs.description = ''
    }
    if (tool.name === 'write_file') {
      tool.description = '';
      (tool as any).lc_kwargs.description = ''
    }
    if (tool.name === 'edit_file') {
      tool.description = '';
      (tool as any).lc_kwargs.description = ''
    }
    if (tool.name === 'glob') {
      tool.description = '';
      (tool as any).lc_kwargs.description = ''
    }
    if (tool.name === 'grep') {
      tool.description = '';
      (tool as any).lc_kwargs.description = ''
    }
    if (tool.name === 'task') {
      tool.description = '';
      (tool as any).lc_kwargs.description = ''
    }
  });

  let skills = null
  try {
    skills = await plugin.call('fileManager', 'dirList', 'skills')
  } catch (e) {
    remixAILogger.warn('Unable to get skills folder. skills set to true', e)
  }
  const hasSkills = skills && Object.keys(skills).length > 0;

  (request.systemMessage.content as any[]).map((part) => {
    if (part.text.includes('## `write_todos`')) {
      part.text = shortSytemWriteTodo
    }
    if (part.text.includes('## Filesystem Tools')) {
      part.text = shortSystemFilesystemTools
    }
    if (part.text.includes('## `task`')) {
      part.text = shortSystemTask
    }
    if (part.text.includes('## Skills System')) {
      part.text = hasSkills ? shortSystemSkillsSystem(hasSkills, skills) : 'No Skills installed'
    }
  });
  (request.systemMessage.content as any[]).push({
    text: await inferencer.getProjectStructure() + '\n' + await inferencer.getCompilerConfig(),
    type: 'text'
  })
  request.systemPrompt = (request.systemMessage.content as any).map((part: any) => part.text).join('\n')
}

const shortSytemWriteTodo = `## \`write_todos\`
Use \`write_todos\` to track and show progress on tasks. This provides visibility to the user.
**Use when:**
- Task involves 2+ steps (e.g., write contract, compile, deploy)
- User asks to implement a feature, fix a bug, or perform multi-file changes
- You need to coordinate multiple operations

**Rules:**
- Mark each todo complete immediately when done (no batching)
- Revise the list as new information emerges
- Never call in parallel`
const shortSystemTask = `## \`task\` (subagent spawner)
Spawns ephemeral subagents for isolated, delegatable work. Each returns a single result.

**Use when:**
- Task is complex, multi-step, and fully self-contained
- Task can run in parallel with others
- Task would bloat the main thread with heavy reasoning/context
- Only the final output matters (not intermediate steps)

**Skip when:**
- You need to see intermediate reasoning
- Task is trivial (few tool calls or simple lookup)
- Splitting adds latency without benefit

**Lifecycle:** Spawn → Run → Return → Reconcile

**Rules:**
- Parallelize aggressively — run independent tasks simultaneously
- Use to silo independent steps within a multi-part objective`
const shortSystemFilesystemTools = `## Filesystem Tools
\`ls\`, \`read_file\`, \`write_file\`, \`edit_file\`, \`glob\`, \`grep\` — interact with the filesystem. All paths must be absolute (start with \`/\`).
- \`ls\`: list directory contents
- \`read_file\`: read entire file (always returns full content, offset/limit ignored)
- \`write_file\`: write a file
- \`edit_file\`: edit a file
- \`glob\`: find files by pattern (e.g. \`\*\*/\*.py\`)
- \`grep\`: search text within files`

const shortSystemSkillsSystem = (hasSkills: boolean, dirs: any) => {
  return `## Skills System
Skills provide specialized workflows. When a task matches a skill's domain, read its \`SKILL.md\` before proceeding.

**Available Skills:** ${hasSkills ? Object.values(dirs).join('\n ') : '*(none yet — create them in \`skills/\`)*'}

**Usage:**
1. Check if the task matches a skill's description
2. Read the skill's \`SKILL.md\` via \`read_file\` (path shown in skill list)
3. Follow its instructions carefully — they contain crucial guidance for successful execution
4. If the skill has resources (e.g. data files), access them with absolute paths as needed`
}

