'use strict'
import type { FormalCheckState, FormalCheckTemplate } from '@remix-project/remix-formal-check'

export interface FormalCheckUIProps {
  plugin: {
    state: FormalCheckState
    templates: FormalCheckTemplate[]
    // Template mode
    runCheck(templateId: string): Promise<void>
    // LLM mode
    setMode(mode: 'template' | 'llm'): void
    setLLMIntent(intent: string): void
    requestLLMProposal(intent: string): void
    grantConsent(): void
    denyConsent(): void
    confirmAndRun(): Promise<void>
    // Shared
    cancelCheck(): void
    confirmMatch(confirmed: boolean): void
    setCurrentFile(path: string): void
  }
}
