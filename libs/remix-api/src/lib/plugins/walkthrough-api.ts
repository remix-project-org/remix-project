import { StatusEvents } from "@remixproject/plugin-utils"

/**
 * A single step in a walkthrough tour.
 * Plugins provide these via the API to define guided tours.
 */
export interface WalkthroughStep {
  /** CSS selector for the element to highlight */
  targetSelector: string
  /** Title shown in the popover */
  title: string
  /** Description / body content (supports HTML) */
  content: string
  /** Popover placement relative to the target element */
  placement?: 'top' | 'bottom' | 'left' | 'right'
  /** CSS selector of an element to click before this step is shown */
  clickSelector?: string
  /** Delay in ms after clicking before showing the step (default: 500) */
  clickDelay?: number
  /** Optional: execute one or more plugin calls before showing this step */
  preAction?: {
    plugin: string
    method: string
    args?: any[]
  } | {
    plugin: string
    method: string
    args?: any[]
  }[]

}

/**
 * A complete walkthrough definition.
 * Plugins register these and they can be started by ID.
 */
export interface WalkthroughDefinition {
  /** Unique identifier for the walkthrough (slug for API walkthroughs) */
  id: string
  /** Numeric ID from the backend API — used for /complete endpoint */
  apiId?: number
  /** Display name shown in the walkthrough list */
  name: string
  /** Short description of what this walkthrough covers */
  description: string
  /** The plugin that registered this walkthrough */
  sourcePlugin?: string
  /** Ordered list of steps */
  steps: WalkthroughStep[]
  /** Whether the user has completed this walkthrough */
  completed?: boolean
  /** ISO timestamp of when the user completed this walkthrough */
  completedAt?: string | null
  /** Sort priority (higher = more important) */
  priority?: number
}

// ---- API response shapes (snake_case from backend) ----

/** Raw step shape from the API (snake_case) */
export interface ApiWalkthroughStep {
  sort_order: number
  target_selector: string
  title: string
  content: string
  placement: 'top' | 'bottom' | 'left' | 'right' | null
  click_selector: string | null
  click_delay: number | null
  pre_action: { plugin: string; method: string; args?: any[] } | null
}

/** Raw walkthrough shape from the API (snake_case) */
export interface ApiWalkthrough {
  id: number
  slug: string
  name: string
  description: string | null
  source_plugin: string | null
  priority: number
  completed: boolean
  completed_at: string | null
  steps: ApiWalkthroughStep[]
}

/** Shape of GET /walkthroughs response */
export interface ApiWalkthroughsResponse {
  walkthroughs: ApiWalkthrough[]
  count: number
}

export interface IWalkthroughApi {
  events: {
    /** Emitted when a walkthrough tour starts */
    walkthroughStarted: (walkthroughId: string) => void
    /** Emitted when a walkthrough tour completes */
    walkthroughCompleted: (walkthroughId: string) => void
    /** Emitted when the user moves to a new step */
    stepChanged: (walkthroughId: string, stepIndex: number) => void
    /** Emitted when the list of available walkthroughs changes */
    walkthroughsChanged: () => void
  } & StatusEvents
  methods: {
    /** Register a walkthrough definition. Other plugins call this to add their tours. */
    registerWalkthrough: (walkthrough: WalkthroughDefinition) => Promise<void>
    /** Unregister a walkthrough by ID */
    unregisterWalkthrough: (walkthroughId: string) => Promise<void>
    /** Start a registered walkthrough by its ID */
    start: (walkthroughId: string) => Promise<void>
    /** Start an ad-hoc walkthrough with inline steps (no registration needed) */
    startSteps: (steps: WalkthroughStep[]) => Promise<void>
    /** Get all registered walkthrough definitions */
    getWalkthroughs: () => Promise<WalkthroughDefinition[]>
    /** Stop the currently active walkthrough */
    stop: () => Promise<void>
    /** Fetch and register walkthroughs from the notification service API */
    fetchFromApi: (url?: string) => Promise<void>
    /** Mark a walkthrough as completed (calls the backend) */
    markCompleted: (walkthroughId: string) => Promise<void>
  }
}
