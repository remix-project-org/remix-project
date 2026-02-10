export type AiContextType = "none" | "current" | "opened" | "workspace"

// Re-export AI Model types from core
export type { AIModel } from '@remix/remix-ai-core'
export type AIModelId = string

// Legacy type for backwards compatibility (deprecated)
export type AiAssistantType = "openai" | "mistralai" | "anthropic" | "ollama"

export type groupListType = {
      label: string,
      bodyText: string,
      icon: 'fa-solid fa-check',
      dataId: string
      stateValue: AiContextType | string | any
    }
