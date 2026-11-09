'use strict'
import type { FormalCheckState, FormalCheckTemplate } from '@remix-project/remix-formal-check'

export interface FormalCheckUIProps {
  plugin: {
    state: FormalCheckState
    templates: FormalCheckTemplate[]
    runCheck(templateId: string): Promise<void>
    cancelCheck(): void
    confirmMatch(confirmed: boolean): void
    setCurrentFile(path: string): void
  }
}
