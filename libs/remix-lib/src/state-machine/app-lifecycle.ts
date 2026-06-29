/**
 * AppLifecycle — XState v5 machine modelling the Remix IDE boot sequence.
 *
 * The machine tracks which boot phase we're in and maintains a context with
 * the set of activated plugins, fired events, and failure info.
 *
 * The EventGuard system (event-guard.ts) sits alongside this machine and
 * provides the combinator-based prerequisite API (all/any/sequence/when/waitFor).
 * The machine drives phase transitions; the EventGuard drives fine-grained
 * prerequisite callbacks.
 */

import { setup, createActor, type AnyActorRef } from 'xstate'
import { EventGuard } from './event-guard'
import type { AppLifecycleContext, LifecycleEvent, BootPhase } from './types'

// ─── Phase definitions (plugin groups that define each phase) ────────

const CORE_PLUGINS = ['txRunner', 'layout', 'notification', 'editor']

const SERVICE_PLUGINS = [
  'permissionhandler', 'theme', 'locale', 'fileManager',
  'compilerMetadata', 'compilerArtefacts', 'network', 'web3Provider',
  'offsetToLineColumnConverter', 'matomo', 'indexedDbCache'
]

const UI_PLUGINS = [
  'mainPanel', 'menuicons', 'tabs', 'topbar', 'statusBar',
  'bottomBar', 'sidePanel', 'rightSidePanel', 'popupPanel',
  'overlay', 'home', 'settings'
]

const TOOL_PLUGINS = [
  'hiddenPanel', 'pluginManager', 'codeParser', 'codeFormatter',
  'terminal', 'blockchain', 'fetchAndCompile', 'solidity',
  'filePanel', 'remixAI'
]

function hasAllPlugins(activated: Set<string>, required: string[]): boolean {
  return required.every(name => activated.has(name))
}

// ─── XState Machine Definition ───────────────────────────────────────

const appLifecycleMachine = setup({
  types: {
    context: {} as AppLifecycleContext,
    events: {} as LifecycleEvent
  },
  guards: {
    corePluginsReady: ({ context }) => hasAllPlugins(context.activatedPlugins, CORE_PLUGINS),
    servicePluginsReady: ({ context }) => hasAllPlugins(context.activatedPlugins, SERVICE_PLUGINS),
    uiPluginsReady: ({ context }) => hasAllPlugins(context.activatedPlugins, UI_PLUGINS),
    toolPluginsReady: ({ context }) => hasAllPlugins(context.activatedPlugins, TOOL_PLUGINS),
  },
  actions: {
    addActivatedPlugin: ({ context, event }) => {
      if (event.type === 'PLUGIN_ACTIVATED') {
        context.activatedPlugins.add(event.name)
        context.firedEvents.add(`PLUGIN_ACTIVATED:${event.name}`)
      }
    },
    removeActivatedPlugin: ({ context, event }) => {
      if (event.type === 'PLUGIN_DEACTIVATED') {
        context.activatedPlugins.delete(event.name)
      }
    },
    recordPluginFailure: ({ context, event }) => {
      if (event.type === 'PLUGIN_ACTIVATION_FAILED') {
        context.failedPlugins.set(event.name, event.error)
        context.firedEvents.add(`PLUGIN_ACTIVATION_FAILED:${event.name}`)
      }
    },
    recordEvent: ({ context, event }) => {
      context.firedEvents.add(event.type)
    },
    recordCustomEvent: ({ context, event }) => {
      if (event.type === 'CUSTOM') {
        context.firedEvents.add(`CUSTOM:${event.id}`)
      }
    },
    setPhase: ({ context }, params: { phase: string }) => {
      context.currentPhase = params.phase
    },
  }
}).createMachine({
  id: 'appLifecycle',
  initial: 'idle',
  context: {
    activatedPlugins: new Set<string>(),
    failedPlugins: new Map<string, string>(),
    readyServices: new Set<string>(),
    bootStartedAt: 0,
    currentPhase: 'idle',
    firedEvents: new Set<string>(),
  },
  states: {
    idle: {
      on: {
        BOOT: {
          target: 'booting',
          actions: [
            ({ context }) => { context.bootStartedAt = Date.now() },
            { type: 'setPhase', params: { phase: 'booting' } },
            { type: 'recordEvent' }
          ]
        }
      }
    },

    booting: {
      on: {
        PLUGINS_REGISTERED: {
          target: 'activating',
          actions: [
            { type: 'recordEvent' },
            { type: 'setPhase', params: { phase: 'activating' } }
          ]
        }
      }
    },

    activating: {
      initial: 'core',
      on: {
        PLUGIN_ACTIVATED: {
          actions: ['addActivatedPlugin']
        },
        PLUGIN_DEACTIVATED: {
          actions: ['removeActivatedPlugin']
        },
        PLUGIN_ACTIVATION_FAILED: {
          actions: ['recordPluginFailure']
        },
        WORKSPACE_INITIALIZED: {
          actions: ['recordEvent']
        },
        EDITOR_MOUNTED: {
          actions: ['recordEvent']
        },
        WORKSPACE_PLUGINS_ACTIVATED: {
          actions: ['recordEvent']
        },
        CACHE_READY: {
          actions: ['recordEvent']
        },
        PROVIDER_CONNECTED: {
          actions: [({ context, event }) => {
            if (event.type === 'PROVIDER_CONNECTED') {
              context.readyServices.add(event.name)
              context.firedEvents.add(`PROVIDER_CONNECTED:${event.name}`)
            }
          }]
        },
        PROVIDER_DISCONNECTED: {
          actions: [({ context, event }) => {
            if (event.type === 'PROVIDER_DISCONNECTED') {
              context.readyServices.delete(event.name)
            }
          }]
        },
        CUSTOM: {
          actions: ['recordCustomEvent']
        },
        APP_LOADED: {
          target: 'running',
          actions: [
            { type: 'recordEvent' },
            { type: 'setPhase', params: { phase: 'running' } }
          ]
        }
      },
      states: {
        core: {
          always: {
            guard: 'corePluginsReady',
            target: 'services',
            actions: [{ type: 'setPhase', params: { phase: 'coreReady' } }]
          }
        },
        services: {
          always: {
            guard: 'servicePluginsReady',
            target: 'ui',
            actions: [{ type: 'setPhase', params: { phase: 'servicesReady' } }]
          }
        },
        ui: {
          always: {
            guard: 'uiPluginsReady',
            target: 'tools',
            actions: [{ type: 'setPhase', params: { phase: 'uiReady' } }]
          }
        },
        tools: {
          always: {
            guard: 'toolPluginsReady',
            target: 'ready',
            actions: [{ type: 'setPhase', params: { phase: 'toolsReady' } }]
          }
        },
        ready: {
          type: 'final'
        }
      },
      onDone: {
        target: 'running',
        actions: [{ type: 'setPhase', params: { phase: 'running' } }]
      }
    },

    running: {
      on: {
        PLUGIN_ACTIVATED: {
          actions: ['addActivatedPlugin']
        },
        PLUGIN_DEACTIVATED: {
          actions: ['removeActivatedPlugin']
        },
        WORKSPACE_INITIALIZED: {
          actions: ['recordEvent']
        },
        EDITOR_MOUNTED: {
          actions: ['recordEvent']
        },
        WORKSPACE_PLUGINS_ACTIVATED: {
          actions: ['recordEvent']
        },
        CACHE_READY: {
          actions: ['recordEvent']
        },
        CUSTOM: {
          actions: ['recordCustomEvent']
        }
      }
    },

    degraded: {
      on: {
        PLUGIN_ACTIVATED: {
          actions: ['addActivatedPlugin']
        },
        CUSTOM: {
          actions: ['recordCustomEvent']
        }
      }
    }
  }
})

// ─── AppLifecycle Facade ─────────────────────────────────────────────

/**
 * High-level facade that bundles the XState machine (phase tracking)
 * with the EventGuard (prerequisite combinators).
 *
 * Usage:
 *   const lifecycle = new AppLifecycle()
 *   lifecycle.when(all('EDITOR_MOUNTED', 'WORKSPACE_INITIALIZED'), () => { ... })
 *   lifecycle.send({ type: 'PLUGIN_ACTIVATED', name: 'editor' })
 *   await lifecycle.waitFor(all('EDITOR_MOUNTED'))
 */
export class AppLifecycle {
  private actor: AnyActorRef
  private guard: EventGuard
  private listeners: Array<(state: string) => void> = []
  private debug: boolean

  constructor(options?: { debug?: boolean }) {
    this.debug = options?.debug ?? false
    this.guard = new EventGuard({ debug: this.debug, label: 'Lifecycle' })

    const inspectFn = this.debug
      ? (inspectionEvent: any) => {
        if (inspectionEvent.type === '@xstate.event') {
          console.log(
            '%c[Lifecycle] event %c%s',
            'color:#8be9fd', 'color:#50fa7b;font-weight:bold',
            JSON.stringify(inspectionEvent.event)
          )
        } else if (inspectionEvent.type === '@xstate.snapshot') {
          const ctx = inspectionEvent.snapshot?.context
          console.log(
            '%c[Lifecycle] → phase %c%s %c| state %c%s %c| plugins %c%d',
            'color:#8be9fd',
            'color:#ff79c6;font-weight:bold', ctx?.currentPhase,
            'color:#8be9fd',
            'color:#f1fa8c', JSON.stringify(inspectionEvent.snapshot?.value),
            'color:#8be9fd',
            'color:#ffb86c', ctx?.activatedPlugins?.size ?? 0
          )
        }
      }
      : undefined

    this.actor = createActor(appLifecycleMachine, {
      inspect: inspectFn
    })

    // Sync machine state changes to listeners
    this.actor.subscribe((snapshot) => {
      const phase = snapshot.context.currentPhase
      for (const listener of this.listeners) {
        try {
          listener(phase)
        } catch (e) {
          if (this.debug) console.error('[AppLifecycle] Listener error:', e)
        }
      }
    })

    this.actor.start()
  }

  /**
   * Send an event to both the XState machine and the EventGuard.
   * This is the single entry point for all lifecycle events.
   */
  send(event: LifecycleEvent): void {
    // Send to XState machine for phase tracking
    this.actor.send(event)

    // Fire corresponding event IDs on the EventGuard
    switch (event.type) {
    case 'PLUGIN_ACTIVATED':
      this.guard.fire(`PLUGIN_ACTIVATED:${event.name}`)
      this.guard.fire('PLUGIN_ACTIVATED') // generic
      break
    case 'PLUGIN_DEACTIVATED':
      this.guard.fire(`PLUGIN_DEACTIVATED:${event.name}`)
      break
    case 'PLUGIN_ACTIVATION_FAILED':
      this.guard.fire(`PLUGIN_ACTIVATION_FAILED:${event.name}`)
      break
    case 'PROVIDER_CONNECTED':
      this.guard.fire(`PROVIDER_CONNECTED:${event.name}`)
      break
    case 'PROVIDER_DISCONNECTED':
      this.guard.fire(`PROVIDER_DISCONNECTED:${event.name}`)
      break
    case 'CUSTOM':
      this.guard.fire(`CUSTOM:${event.id}`)
      break
    default:
      this.guard.fire(event.type)
      break
    }
  }

  // ─── EventGuard delegated API ────────────────────────────────────

  /** Register a callback when condition is met. Returns unsubscribe fn. */
  when(...args: Parameters<EventGuard['when']>): ReturnType<EventGuard['when']> {
    return this.guard.when(...args)
  }

  /** Promise that resolves when condition is met */
  waitFor(...args: Parameters<EventGuard['waitFor']>): ReturnType<EventGuard['waitFor']> {
    return this.guard.waitFor(...args)
  }

  /** Synchronous check if a specific event has fired */
  has(eventId: string): boolean {
    return this.guard.has(eventId)
  }

  /** Get all fired event IDs */
  getFiredEvents(): string[] {
    return this.guard.getFiredEvents()
  }

  // ─── Machine state queries ───────────────────────────────────────

  /** Get the current boot phase */
  getPhase(): string {
    return this.actor.getSnapshot().context.currentPhase
  }

  /** Get the full XState state value */
  getStateValue(): string {
    const val = this.actor.getSnapshot().value
    if (typeof val === 'string') return val
    return JSON.stringify(val)
  }

  /** Get the set of activated plugin names */
  getActivatedPlugins(): string[] {
    return [...this.actor.getSnapshot().context.activatedPlugins]
  }

  /** Get plugins that failed to activate */
  getFailedPlugins(): Record<string, string> {
    const map = this.actor.getSnapshot().context.failedPlugins
    const result: Record<string, string> = {}
    map.forEach((v, k) => { result[k] = v })
    return result
  }

  /** Subscribe to phase changes */
  onPhaseChange(listener: (phase: string) => void): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener)
    }
  }

  /** Stop the machine (cleanup) */
  stop(): void {
    this.actor.stop()
    this.listeners = []
  }
}
