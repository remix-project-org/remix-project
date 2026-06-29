import { Plugin } from '@remixproject/engine'
import * as packageJson from '../../../../../package.json'
import {
  createAssistantActor,
  snapshotFromActor,
  selectCanAskAI,
  selectPlanManagerHandoff,
  selectAvailableModels,
  selectFeatureEnabled,
  selectCooldownRemaining,
  selectCooldownDisplay,
  selectChatNotice,
  selectDefaultModel,
  selectModelForTask,
  selectTaskParam,
  selectAutoModeEnabled,
  remixAILogger,
  type AssistantSnapshot,
  type AIError,
  type AIModel,
  type ChatNotice,
  type CooldownDisplay,
  type PlanManagerHandoff
} from '@remix/remix-ai-core'

/**
 * AssistantStatePlugin — owns the AssistantMachine actor and exposes a
 * narrow query/report API to every other plugin.
 *
 * Policy lives here. Mechanism (the actual fetch / inferencer) lives in
 * `remixAIPlugin`. This split mirrors `planManager` (policy + UI) vs the
 * billing API services (mechanism).
 *
 * Lifecycle bridges this plugin owns:
 *   - on `auth.authStateChanged` → AUTH_CHANGED (also fired by auth after
 *     refreshPermissions(), so this single event covers entitlement updates
 *     after plan upgrades / email verification)
 *   - 1s ticker while `cooldown === 'rate-limited'` → COOLDOWN_TICK
 *
 * Other plugins call:
 *   - getSnapshot() → AssistantSnapshot          (read once)
 *   - subscribe(cb) → unsubscribe                (re-render on changes)
 *   - canAskAI() → boolean                       (cheap pre-check)
 *   - requireReady({ feature? }) → boolean       (gate + auto-open planManager)
 *   - getAllowedModels() → AIModel[]             (drive model picker)
 *   - reportRequestStarted() / reportRequestSucceeded()
 *   - reportError(error)                         (parsed AIError envelope)
 */

const profile = {
  name: 'assistantState',
  displayName: 'Assistant State',
  methods: [
    'getSnapshot',
    'subscribe',
    'canAskAI',
    'requireReady',
    'getAllowedModels',
    'getAvailableModels',
    'getDefaultModel',
    'getModelForTask',
    'getTaskParam',
    'isAutoModeEnabled',
    'hasFeature',
    'getCooldownRemaining',
    'getCooldownDisplay',
    'getChatNotice',
    'dismissChatNotice',
    'reportRequestStarted',
    'reportStreamStarted',
    'reportRequestSucceeded',
    'reportError',
    'reportSuccess',
    'resetSession',
    'refreshPermissions'
  ],
  events: ['stateChanged'],
  description: 'Owns the AI assistant state machine — auth/permission gating, cooldowns, and error policy.',
  kind: '',
  location: 'none',
  version: packageJson.version,
  maintainedBy: 'Remix'
}

type Unsubscribe = () => void

let __assistantStateInstanceCounter = 0

export class AssistantStatePlugin extends Plugin {
  // The XState actor. Created in the constructor so methods are safe to
  // call before onActivation completes.
  private actor = createAssistantActor()
  private cachedSnapshot: AssistantSnapshot
  // Single in-flight permissions fetch — auth events can fire in bursts.
  private permissionsRefreshing: Promise<void> | null = null
  private instanceId: number = ++__assistantStateInstanceCounter

  constructor() {
    super(profile)
    remixAILogger.log('[assistantState] CONSTRUCT plugin#' + this.instanceId)
    this.actor.start()
    this.cachedSnapshot = snapshotFromActor(this.actor)
    // Re-emit `stateChanged` on every transition so React subscribers
    // re-render. Snapshot is recomputed lazily via getSnapshot().
    this.actor.subscribe(() => {
      this.cachedSnapshot = snapshotFromActor(this.actor)
      this.emit('stateChanged', this.cachedSnapshot)
    })
  }

  async onActivation(): Promise<void> {
    // The auth plugin re-emits `authStateChanged` after refreshPermissions(),
    // so a single listener covers both login/logout and entitlement changes.
    this.on('auth' as any, 'authStateChanged', (s: { isAuthenticated: boolean }) => {
      const isAuthed = !!s?.isAuthenticated
      this.dispatch({ type: 'AUTH_CHANGED', isAuthenticated: isAuthed })
      if (isAuthed) void this.refreshPermissions()
      else this.dispatch({ type: 'PERMISSIONS_LOADED', permissions: null })
    })

    // Best-effort initial probe — if the user is already signed in by the
    // time we activate (cached JWT), pull permissions now.
    try {
      const isAuthed = await this.call('auth' as any, 'isAuthenticated')
      this.dispatch({ type: 'AUTH_CHANGED', isAuthenticated: !!isAuthed })
      if (isAuthed) void this.refreshPermissions()
    } catch (e) {
      // Auth not yet active — the authStateChanged listener above will
      // catch the next state change. No-op.
    }
  }

  /** Send an event into the actor. */
  private dispatch(event: any): void {
    this.actor.send(event)
  }

  async onDeactivation(): Promise<void> {
    // IMPORTANT: do NOT stop the XState actor here.
    //
    // The Remix engine auto-toggles inactive plugins when another plugin
    // calls them (e.g. remixAIPlugin.onActivation → PermissionChecker →
    // call('assistantState', 'getSnapshot') happens BEFORE assistantState
    // is activated in the app.ts batch). The engine's toggle path is
    // activate → run call → deactivate, which lands here. If we stop()
    // the actor, every subsequent dispatch silently no-ops with the
    // "sent to stopped actor" warning and the UI never reacts to login.
    //
    // The actor lives as long as the plugin instance does — nothing
    // to clean up here.
  }

  // ─── Read API ─────────────────────────────────────────────────────

  getSnapshot(): AssistantSnapshot {
    return this.cachedSnapshot
  }

  /**
   * Cross-plugin subscription. Returns an unsubscribe function. Do not use
   * inside React render — use `useSyncExternalStore` against the same
   * cached snapshot instead (helper exposed from remix-ai-core).
   */
  subscribe(cb: (snap: AssistantSnapshot) => void): Unsubscribe {
    const sub = this.actor.subscribe(() => cb(this.cachedSnapshot))
    return () => sub.unsubscribe()
  }

  canAskAI(): boolean {
    return selectCanAskAI(this.cachedSnapshot)
  }

  /** @deprecated use getAvailableModels(). Kept for legacy callers. */
  getAllowedModels(): AIModel[] {
    return this.getAvailableModels().filter((m) => m.available)
  }

  /**
   * Full model catalogue for the picker. Each entry carries `available`
   * (false → render locked + open planManager on click) and `requiredFeature`
   * for the upgrade prompt.
   */
  getAvailableModels(): AIModel[] {
    return selectAvailableModels(this.cachedSnapshot)
  }

  /**
   * The chat-default model the backend marks `is_default: true`. Returns
   * null when permissions haven't loaded — callers MUST handle null and
   * never substitute a hardcoded model id.
   */
  getDefaultModel(): AIModel | null {
    return selectDefaultModel(this.cachedSnapshot)
  }

  /**
   * Backend-driven model id for a named task (e.g. 'dapp_generator').
   * Returns null when the task isn't advertised in `permissions.task_models`;
   * callers MUST throw rather than fall back to a literal model id.
   */
  getModelForTask(taskId: string): string | null {
    return selectModelForTask(this.cachedSnapshot, taskId)
  }

  /**
   * Backend-driven param value for a named task (e.g. max_tokens). Returns
   * null when the value isn't advertised; callers may apply a documented
   * default ONLY at the call site, not via shared constants.
   */
  getTaskParam(taskId: string, key: string): number | string | boolean | null {
    return selectTaskParam(this.cachedSnapshot, taskId, key)
  }

  /** Sugar — Auto Mode is `ai:auto`. */
  isAutoModeEnabled(): boolean {
    return selectAutoModeEnabled(this.cachedSnapshot)
  }

  /**
   * Generic capability gate. Use for ai:* feature flags that aren't
   * tied to a specific model row, e.g. ai:auto, ai:ollama.
   * Returns false for anonymous users (no permissions loaded).
   */
  hasFeature(key: string): boolean {
    return selectFeatureEnabled(this.cachedSnapshot, key)
  }

  getCooldownRemaining(): number | null {
    return selectCooldownRemaining(this.cachedSnapshot)
  }

  /** Rich cooldown view: countdown, expiresAt, message, terminal flag, feature… */
  getCooldownDisplay(): CooldownDisplay | null {
    return selectCooldownDisplay(this.cachedSnapshot)
  }

  /**
   * In-chat notice for any error that ISN'T already covered by the
   * cooldown banner or plan-manager hand-off. PROVIDER_DENIED, server
   * errors, validation errors, unknown codes — returns a typed
    * `{ severity, code, title, message, actionable, allowedProviders?, actions? }`.
   * Returns null when no notice should be shown (success, cooldown
   * already showing, plan-manager already opening).
   */
  getChatNotice(): ChatNotice | null {
    return selectChatNotice(this.cachedSnapshot)
  }

  /** Clear the current chat notice. Cooldown / gate state untouched. */
  dismissChatNotice(): void {
    this.dispatch({ type: 'NOTICE_DISMISSED' })
  }

  /**
   * Gate helper. Returns true if the caller may proceed; returns false
   * AND opens the plan manager with the right reason if not.
   *
   * `feature` is optional — pass it when the call site is for a specific
   * `ai:*` capability so the planManager can highlight it on the upgrade
   * screen.
   */
  async requireReady(opts: { feature?: string } = {}): Promise<boolean> {
    const snap = this.cachedSnapshot
    if (selectCanAskAI(snap)) return true

    // Cooldown-only block (rate-limit / blocked) → still allow the call.
    // The banner is informational; if the user wants to retry while
    // rate-limited, that's their choice and the backend will reject it
    // with a fresh error envelope. Plan upgrades don't lift rate-limits,
    // so there's nothing to gate.
    if (snap.cooldown !== 'none' && !snap.gateReason) return true

    // Decide the hand-off reason. If the snapshot already carries a
    // gate, use it. If there's no gate but cooldown is active, we don't
    // open the planManager — the UI shows a countdown and the user waits.
    let handoff: PlanManagerHandoff | null = selectPlanManagerHandoff(snap)
    if (!handoff && snap.availability === 'gated' && !snap.isAuthenticated) {
      handoff = { reason: 'auth-required' }
    }
    if (!handoff && opts.feature && snap.availability !== 'available') {
      handoff = { reason: 'feature-required', requiredFeature: opts.feature }
    }
    if (handoff) {
      try {
        await this.call('planManager' as any, 'open', handoff)
      } catch (e) {
        remixAILogger.warn('[assistantState] failed to open planManager', e)
      }
    }
    return false
  }

  // ─── Write API (called by remixAIPlugin) ─────────────────────────

  reportRequestStarted(): void {
    this.dispatch({ type: 'REQUEST_STARTED' })
  }
  reportStreamStarted(): void {
    this.dispatch({ type: 'STREAM_STARTED' })
  }
  reportRequestSucceeded(): void {
    this.dispatch({ type: 'REQUEST_SUCCEEDED' })
  }
  /** Alias for symmetry — some call sites prefer the shorter name. */
  reportSuccess(): void {
    this.reportRequestSucceeded()
  }
  /** Caller must pass an already-parsed AIError envelope. */
  reportError(error: AIError): void {
    this.dispatch({ type: 'ERROR_RECEIVED', error })
  }
  resetSession(): void {
    this.dispatch({ type: 'RESET_SESSION' })
  }

  // ─── Internal ────────────────────────────────────────────────────

  /** Idempotent — coalesces concurrent calls into a single fetch. */
  async refreshPermissions(): Promise<void> {
    if (this.permissionsRefreshing) return this.permissionsRefreshing
    this.permissionsRefreshing = (async () => {
      this.dispatch({ type: 'PERMISSIONS_LOADING' })
      try {
        const api: any = await this.call('auth' as any, 'getPermissionsApi')
        if (!api) {
          this.dispatch({ type: 'PERMISSIONS_LOADED', permissions: null })
          return
        }
        const r = await api.getPermissions()
        if (r?.ok) {
          this.dispatch({ type: 'PERMISSIONS_LOADED', permissions: r.data })
        } else {
          this.dispatch({ type: 'PERMISSIONS_FAILED', message: r?.error ?? 'Failed to load permissions' })
        }
      } catch (e: any) {
        this.dispatch({ type: 'PERMISSIONS_FAILED', message: e?.message ?? 'Failed to load permissions' })
      } finally {
        this.permissionsRefreshing = null
      }
    })()
    return this.permissionsRefreshing
  }
}
