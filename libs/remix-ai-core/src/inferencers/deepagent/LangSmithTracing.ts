/**
 * LangSmith Tracing Configuration for Remix IDE DeepAgent
 *
 * This module provides LangSmith tracing integration for observability
 * and debugging of LLM calls in the DeepAgent system.
 *
 * Tracing is handled transparently through the backend proxy - no API key needed.
 */

import { LangChainTracer } from '@langchain/core/tracers/tracer_langchain'
import { Client } from 'langsmith'
import { endpointUrls } from '@remix-endpoints-helper'
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base'

/**
 * Singleton class to manage LangSmith tracing configuration
 * Tracing is proxied through the backend - no user configuration needed
 */
export class LangSmithTracingManager {
  private static instance: LangSmithTracingManager | null = null
  private tracer: LangChainTracer | null = null
  private client: Client | null = null
  private enabled: boolean = false

  private constructor() {}

  static getInstance(): LangSmithTracingManager {
    if (!LangSmithTracingManager.instance) {
      LangSmithTracingManager.instance = new LangSmithTracingManager()
    }
    return LangSmithTracingManager.instance
  }

  initialize(projectName?: string): void {
    try {
      const authToken = typeof window !== 'undefined'
        ? window.localStorage?.getItem('remix_access_token')
        : undefined

      const fetchOptions: RequestInit = {
        headers: authToken
          ? { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' }
          : { 'Content-Type': 'application/json' }
      }

      this.client = new Client({
        apiKey: 'proxy-handled',
        apiUrl: `${endpointUrls.langsmith}`,
        fetchOptions,
        // Disable features that cause browser compatibility issues
        autoBatchTracing: false,
      })

      this.tracer = new LangChainTracer({
        projectName: projectName || 'Remix-IDE',
        client: this.client as any
      })

      this.enabled = true
      console.log('[LangSmith] Tracing initialized via proxy')
    } catch (error) {
      console.error('[LangSmith] Failed to initialize:', error)
      this.enabled = false
    }
  }

  disable(): void {
    this.enabled = false
    this.tracer = null
    this.client = null
  }

  isEnabled(): boolean {
    return this.enabled && this.tracer !== null
  }

  getCallbacks(): BaseCallbackHandler[] {
    if (!this.enabled || !this.tracer) {
      return []
    }
    return [this.tracer]
  }

  getTracer(): LangChainTracer | null {
    return this.tracer
  }

  getRunConfig(runName?: string): Record<string, any> {
    if (!this.enabled || !this.tracer) {
      return {}
    }

    return {
      callbacks: [this.tracer],
      runName: runName || 'remix-deepagent-run',
      tags: ['remix-ide', 'deepagent'],
      metadata: {
        source: 'remix-ide',
        timestamp: new Date().toISOString()
      }
    }
  }

  getProjectName(): string {
    return 'Remix-IDE'
  }
}

export const langSmithTracing = LangSmithTracingManager.getInstance()