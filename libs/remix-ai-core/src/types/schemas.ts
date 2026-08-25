import { z } from 'zod'

export const SecurityCheckSchema = z.object({
  Answer: z
    .string()
    .describe('Whether the code contains major security vulnerabilities. Short answer, e.g. "Yes" or "No".'),
  Reason: z
    .array(z.string())
    .describe('Concise list of the vulnerabilities or risky patterns found. Empty when none.'),
  Suggestion: z
    .array(z.string())
    .describe('Concise list of recommendations to fix or mitigate the issues. Empty when none.')
})
export type SecurityCheck = z.infer<typeof SecurityCheckSchema>

/** A single generated / modified source file. */
export const GeneratedFileSchema = z.object({
  fileName: z.string().describe('Workspace-relative file path, e.g. "contracts/MyToken.sol".'),
  content: z.string().describe('Full file content. Valid code only, no markdown fences.')
})
export type GeneratedFile = z.infer<typeof GeneratedFileSchema>

/** A full generated project (new-workspace generation). */
export const GeneratedProjectSchema = z.object({
  projectName: z.string().describe('Concise project name reflecting the contracts purpose.'),
  files: z.array(GeneratedFileSchema).describe('All files in the project. Keep the count minimal.'),
  threadID: z.string().optional().describe('Conversation/thread id, if continuing a prior generation.')
})
export type GeneratedProject = z.infer<typeof GeneratedProjectSchema>

/** A set of workspace edits (existing-workspace modification). */
export const WorkspaceEditSchema = z.object({
  files: z
    .array(GeneratedFileSchema)
    .describe('Only the files to create or modify. Omit unchanged files. Return full file content.')
})
export type WorkspaceEdit = z.infer<typeof WorkspaceEditSchema>
