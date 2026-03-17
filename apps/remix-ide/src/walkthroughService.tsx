import React from 'react'
import { ViewPlugin } from '@remixproject/engine-web'
import { driver, DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'
import * as packageJson from '../../../package.json'
import { CustomRemixApi, WalkthroughDefinition, WalkthroughStep, ApiWalkthrough, ApiWalkthroughsResponse } from '@remix-api'
import { ApiClient, IApiClient } from '@remix-api'
import { PluginViewWrapper } from '@remix-ui/helper'
import { RemixUIWalkthrough } from '@remix-ui/walkthrough'
import { builtinWalkthroughs } from './walkthrough-definitions'
import { endpointUrls } from '@remix-endpoints-helper'

const profile = {
  name: 'walkthrough',
  displayName: 'Help & Walkthroughs',
  description: 'API-driven guided tours for Remix IDE',
  version: packageJson.version,
  icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIvPjxwYXRoIGQ9Ik05LjA5IDlhMyAzIDAgMCAxIDUuODMgMWMwIDItMyAzLTMgMyIvPjxsaW5lIHgxPSIxMiIgeTE9IjE3IiB4Mj0iMTIuMDEiIHkyPSIxNyIvPjwvc3ZnPg==',
  location: 'sidePanel',
  methods: ['registerWalkthrough', 'unregisterWalkthrough', 'start', 'startSteps', 'getWalkthroughs', 'stop', 'fetchFromApi', 'markCompleted'],
  events: ['walkthroughStarted', 'walkthroughCompleted', 'stepChanged', 'walkthroughsChanged'],
}

export class WalkthroughService extends ViewPlugin {
  private walkthroughs: Map<string, WalkthroughDefinition> = new Map()
  private activeDriver: ReturnType<typeof driver> | null = null
  private activeWalkthroughId: string | null = null
  private apiClient: IApiClient
  private isAuthenticated = false
  dispatch: React.Dispatch<any> = () => {}
  element: HTMLDivElement

  constructor() {
    super(profile)
    this.element = document.createElement('div')
    this.element.setAttribute('id', 'walkthrough-panel')
    this.apiClient = new ApiClient(endpointUrls.walkthroughs)
  }

  onActivation(): void {
    console.log('[walkthrough] plugin activated')
    // Register built-in walkthroughs and restore persisted completion state
    this.loadBuiltinCompletionState().then(() => {
      this.renderComponent()
    })

    // Listen for auth state changes to fetch API walkthroughs on login
    this.on('auth' as any, 'authStateChanged', async (state: { isAuthenticated: boolean; token?: string }) => {
      this.isAuthenticated = state.isAuthenticated
      if (state.isAuthenticated) {
        const token = state.token || localStorage.getItem('remix_access_token')
        if (token) {
          this.apiClient.setToken(token)
        }
        this.setupTokenRefresh()
        await this.fetchFromApi()
      } else {
        this.apiClient.setToken(null)
        this.isAuthenticated = false
        // Remove API walkthroughs on logout, keep built-ins
        for (const [id, wt] of this.walkthroughs.entries()) {
          if (wt.sourcePlugin === 'api') {
            this.walkthroughs.delete(id)
          }
        }
        this.emit('walkthroughsChanged' as any)
        this.renderComponent()
      }
    })

    // Check initial auth state
    const token = localStorage.getItem('remix_access_token')
    if (token) {
      this.isAuthenticated = true
      this.apiClient.setToken(token)
      this.setupTokenRefresh()
      this.fetchFromApi().catch(() => {})
    }

    this.renderComponent()
  }

  /**
   * Configure the ApiClient to handle 401s by triggering a real token refresh
   * through the auth plugin.
   */
  private setupTokenRefresh(): void {
    this.apiClient.setTokenRefreshCallback(async () => {
      try {
        const newToken = await this.call('auth' as any, 'getToken')
        return newToken
      } catch {
        return null
      }
    })
  }

  /**
   * Emit a statusChanged event to show/hide the unseen-count badge
   * on the walkthrough side-panel icon.
   */
  private emitUnseenBadge(): void {
    const unseen = Array.from(this.walkthroughs.values()).filter(w => !w.completed).length
    if (unseen > 0) {
      this.emit('statusChanged', { key: unseen, title: `${unseen} new walkthrough${unseen === 1 ? '' : 's'}`, type: 'info' })
    } else {
      this.emit('statusChanged', { key: 'none' })
    }
  }

  /**
   * Sync the ApiClient token from localStorage as a safety net.
   */
  private syncToken(): void {
    const token = localStorage.getItem('remix_access_token')
    if (token) {
      this.apiClient.setToken(token)
    }
  }

  /**
   * Load built-in walkthrough completion state from the Remix config plugin
   * and register built-in walkthroughs with correct `completed` flags.
   */
  private async loadBuiltinCompletionState(): Promise<void> {
    let completedIds: string[] = []
    try {
      const raw = await this.call('config' as any, 'getAppParameter', 'settings/walkthrough-completed')
      if (raw) {
        completedIds = JSON.parse(raw)
      }
    } catch (e) {
      console.warn('[walkthrough] failed to load completion state from config:', e)
    }

    for (const wt of builtinWalkthroughs) {
      const isCompleted = completedIds.includes(wt.id)
      this.walkthroughs.set(wt.id, { ...wt, completed: isCompleted, completedAt: isCompleted ? 'local' : undefined })
      console.log(`[walkthrough] registered built-in: "${wt.id}" (${wt.steps.length} steps, completed: ${isCompleted})`)
    }
    console.log(`[walkthrough] ${this.walkthroughs.size} walkthroughs available:`, Array.from(this.walkthroughs.keys()))
  }

  /**
   * Persist a built-in walkthrough ID as completed in the Remix config plugin (localStorage).
   */
  private async saveBuiltinCompleted(walkthroughId: string): Promise<void> {
    try {
      let completedIds: string[] = []
      const raw = await this.call('config' as any, 'getAppParameter', 'settings/walkthrough-completed')
      if (raw) {
        completedIds = JSON.parse(raw)
      }
      if (!completedIds.includes(walkthroughId)) {
        completedIds.push(walkthroughId)
        await this.call('config' as any, 'setAppParameter', 'settings/walkthrough-completed', JSON.stringify(completedIds))
        console.log(`[walkthrough] persisted built-in completion: "${walkthroughId}"`)
      }
    } catch (e) {
      console.error(`[walkthrough] failed to persist built-in completion:`, e)
    }
  }

  /**
   * Map a snake_case API walkthrough to the frontend WalkthroughDefinition shape.
   */
  private mapApiWalkthrough(w: ApiWalkthrough): WalkthroughDefinition {
    return {
      id: w.slug,
      apiId: w.id,
      name: w.name,
      description: w.description || '',
      sourcePlugin: w.source_plugin || 'api',
      priority: w.priority,
      completed: w.completed,
      completedAt: w.completed_at,
      steps: w.steps.map(s => ({
        targetSelector: s.target_selector,
        title: s.title,
        content: s.content,
        placement: s.placement || undefined,
        clickSelector: s.click_selector || undefined,
        clickDelay: s.click_delay || undefined,
        preAction: s.pre_action || undefined,
      })),
    }
  }

  /**
   * Register a walkthrough definition. Other plugins call this method
   * to add their guided tours to the walkthrough system.
   */
  async registerWalkthrough(walkthrough: WalkthroughDefinition): Promise<void> {
    this.walkthroughs.set(walkthrough.id, {
      ...walkthrough,
      sourcePlugin: (this.currentRequest as any)?.from || walkthrough.sourcePlugin || 'unknown',
    })
    this.emit('walkthroughsChanged' as any)
    this.renderComponent()
  }

  /**
   * Unregister a walkthrough by its ID.
   */
  async unregisterWalkthrough(walkthroughId: string): Promise<void> {
    this.walkthroughs.delete(walkthroughId)
    this.emit('walkthroughsChanged' as any)
    this.renderComponent()
  }

  /**
   * Start a registered walkthrough by its ID.
   */
  async start(walkthroughId: string): Promise<void> {
    console.log(`[walkthrough] start("${walkthroughId}")`)
    const definition = this.walkthroughs.get(walkthroughId)
    if (!definition) {
      console.error(`[walkthrough] not found: "${walkthroughId}". Available:`, Array.from(this.walkthroughs.keys()))
      throw new Error(`Walkthrough "${walkthroughId}" not found. Available: ${Array.from(this.walkthroughs.keys()).join(', ')}`)
    }
    console.log(`[walkthrough] starting "${definition.name}" with ${definition.steps.length} steps`)
    this.call('matomo' as any, 'trackEvent', 'walkthrough', 'start', walkthroughId, definition.steps.length).catch(() => {})
    await this._runWalkthrough(walkthroughId, definition.steps)
  }

  /**
   * Start an ad-hoc walkthrough with inline steps (no registration needed).
   */
  async startSteps(steps: WalkthroughStep[]): Promise<void> {
    await this._runWalkthrough('_adhoc_' + Date.now(), steps)
  }

  /**
   * Get all registered walkthrough definitions.
   */
  async getWalkthroughs(): Promise<WalkthroughDefinition[]> {
    return Array.from(this.walkthroughs.values())
  }

  /**
   * Stop the currently active walkthrough.
   */
  async stop(): Promise<void> {
    if (this.activeDriver) {
      this.activeDriver.destroy()
      this.activeDriver = null
      this.activeWalkthroughId = null
    }
  }

  /**
   * Fetch walkthrough definitions from the notification service API
   * and register them. Existing API walkthroughs are replaced.
   * If a URL is provided, it fetches from that URL instead (legacy behavior).
   */
  async fetchFromApi(url?: string): Promise<void> {
    if (url) {
      // Legacy: fetch raw WalkthroughDefinition[] from arbitrary URL
      console.log(`[walkthrough] fetching walkthroughs from ${url}`)
      try {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        const data: WalkthroughDefinition[] = await response.json()
        for (const wt of data) {
          if (!wt.id || !wt.steps || !Array.isArray(wt.steps)) continue
          this.walkthroughs.set(wt.id, { ...wt, sourcePlugin: wt.sourcePlugin || 'api' })
        }
        this.emit('walkthroughsChanged' as any)
        this.renderComponent()
      } catch (e) {
        console.error(`[walkthrough] fetchFromApi failed:`, e)
        throw e
      }
      return
    }

    // Standard: fetch from the notification service /walkthroughs endpoint
    if (!this.isAuthenticated) {
      console.log('[walkthrough] not authenticated, skipping API fetch')
      return
    }

    console.log('[walkthrough] fetching walkthroughs from API')
    this.syncToken()
    try {
      const response = await this.apiClient.get<ApiWalkthroughsResponse>('')
      if (!response.ok || !response.data) {
        console.warn(`[walkthrough] API returned error:`, response)
        return
      }

      const { walkthroughs: apiWalkthroughs } = response.data
      console.log(`[walkthrough] received ${apiWalkthroughs.length} walkthroughs from API`)

      // Remove old API walkthroughs
      for (const [id, wt] of this.walkthroughs.entries()) {
        if (wt.sourcePlugin === 'api') {
          this.walkthroughs.delete(id)
        }
      }

      // Register new ones
      for (const w of apiWalkthroughs) {
        if (!w.slug || !w.steps || !Array.isArray(w.steps)) {
          console.warn(`[walkthrough] skipping invalid API walkthrough:`, w)
          continue
        }
        const definition = this.mapApiWalkthrough(w)
        this.walkthroughs.set(definition.id, definition)
        console.log(`[walkthrough] registered from API: "${definition.id}" (${definition.steps.length} steps, completed: ${definition.completed})`)
      }

      this.emit('walkthroughsChanged' as any)
      this.renderComponent()
    } catch (e) {
      console.error('[walkthrough] API fetch failed:', e)
    }
  }

  /**
   * Mark a walkthrough as completed by calling the backend API.
   * Uses the numeric `apiId` for the /complete endpoint.
   */
  async markCompleted(walkthroughId: string): Promise<void> {
    const definition = this.walkthroughs.get(walkthroughId)
    if (!definition) return

    // Update local state immediately
    definition.completed = true
    definition.completedAt = new Date().toISOString()
    this.walkthroughs.set(walkthroughId, definition)
    this.renderComponent()
    this.call('matomo' as any, 'trackEvent', 'walkthrough', 'completed', walkthroughId, undefined).catch(() => {})

    // Call backend if this is an API walkthrough with a numeric ID
    if (definition.apiId && this.isAuthenticated) {
      this.syncToken()
      try {
        await this.apiClient.post(`/${definition.apiId}/complete`)
        console.log(`[walkthrough] marked "${walkthroughId}" (apiId: ${definition.apiId}) as completed on server`)
      } catch (e) {
        console.error(`[walkthrough] failed to mark "${walkthroughId}" as completed on server:`, e)
      }
    } else {
      // Built-in walkthrough: persist completion in local config
      await this.saveBuiltinCompleted(walkthroughId)
    }
  }

  /**
   * Core method: converts WalkthroughStep[] to driver.js steps and runs the tour.
   */
  private async _runWalkthrough(walkthroughId: string, steps: WalkthroughStep[]): Promise<void> {
    // Stop any active walkthrough first
    await this.stop()

    this.activeWalkthroughId = walkthroughId

    // Execute preActions and build driver.js steps
    const driverSteps: DriveStep[] = []
    for (const step of steps) {
      driverSteps.push({
        element: step.targetSelector,
        popover: {
          title: step.title,
          description: step.content,
          side: step.placement || 'bottom',
          popoverClass: 'remix-walkthrough-popover',
        },
      })
    }

    const driverInstance = driver({
      showProgress: true,
      animate: true,
      allowClose: true,
      overlayColor: 'rgba(0, 0, 0, 0.35)',
      stagePadding: 8,
      stageRadius: 8,
      popoverClass: 'remix-walkthrough-popover',
      steps: driverSteps,

      onHighlightStarted: async (_element, step, opts) => {
        const stepIndex = driverInstance.getActiveIndex() ?? 0
        const originalStep = steps[stepIndex]
        console.log(`[walkthrough] step ${stepIndex + 1}/${steps.length}: "${originalStep?.title}"`, {
          targetSelector: originalStep?.targetSelector,
          elementFound: !!document.querySelector(originalStep?.targetSelector),
          hasClickSelector: !!originalStep?.clickSelector,
          hasPreAction: !!originalStep?.preAction,
        })

        // Click an element before showing this step
        if (originalStep?.clickSelector) {
          const el = document.querySelector(originalStep.clickSelector) as HTMLElement
          console.log(`[walkthrough]   clicking "${originalStep.clickSelector}"`, el ? 'found' : 'NOT FOUND')
          try {
            if (el) {
              el.click()
              const delay = originalStep.clickDelay ?? 500
              console.log(`[walkthrough]   waiting ${delay}ms after click`)
              await new Promise((resolve) => setTimeout(resolve, delay))
            }
          } catch (e) {
            console.error(`[walkthrough]   click failed:`, e)
          }
        }

        // Execute preAction plugin call(s) if defined
        if (originalStep?.preAction) {
          const actions = Array.isArray(originalStep.preAction) ? originalStep.preAction : [originalStep.preAction]
          for (const action of actions) {
            const { plugin, method, args = []} = action
            console.log(`[walkthrough]   preAction: ${plugin}.${method}(${JSON.stringify(args)})`)
            try {
              await this.call(plugin as any, method as any, ...args)
              console.log(`[walkthrough]   preAction completed, waiting 300ms`)
              await new Promise((resolve) => setTimeout(resolve, 300))
            } catch (e) {
              console.error(`[walkthrough]   preAction failed:`, e)
            }
          }
        }

      },

      onHighlighted: (_element, step, opts) => {
        const stepIndex = driverInstance.getActiveIndex() ?? 0
        console.log(`[walkthrough] step ${stepIndex + 1} highlighted, element:`, _element)
        this.emit('stepChanged' as any, walkthroughId, stepIndex)
      },

      onDestroyStarted: () => {
        const isLast = driverInstance.isLastStep()
        console.log(`[walkthrough] destroying, isLastStep: ${isLast}`)
        if (isLast) {
          console.log(`[walkthrough] tour "${walkthroughId}" completed!`)
          this.emit('walkthroughCompleted' as any, walkthroughId)
          // Mark as completed on the backend
          this.markCompleted(walkthroughId)
        }
        driverInstance.destroy()
        this.activeDriver = null
        this.activeWalkthroughId = null
      },
    })

    this.activeDriver = driverInstance
    this.emit('walkthroughStarted' as any, walkthroughId)
    driverInstance.drive()
  }

  // --- PluginViewWrapper pattern ---

  setDispatch(dispatch: React.Dispatch<any>) {
    this.dispatch = dispatch
    this.renderComponent()
  }

  renderComponent() {
    this.dispatch({
      walkthroughs: Array.from(this.walkthroughs.values()),
      plugin: this,
    })
    this.emitUnseenBadge()
  }

  updateComponent(state: any) {
    return (
      <RemixUIWalkthrough
        plugin={state.plugin}
        walkthroughs={state.walkthroughs}
      />
    )
  }

  render() {
    return (
      <div data-id="walkthrough-container">
        <PluginViewWrapper plugin={this} />
      </div>
    )
  }
}
