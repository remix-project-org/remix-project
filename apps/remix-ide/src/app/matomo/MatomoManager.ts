/**
 * MatomoManager - A comprehensive Matomo Analytics management class
 * TypeScript version with async/await patterns and strong typing
 *
 * Features:
 * - Multiple initialization patterns (consent-based, anonymous, immediate)
 * - Detailed logging and debugging capabilities
 * - Mode switching with proper state management
 * - Cookie and consent lifecycle management
 * - Event interception and monitoring
 *
 * Usage:
 *   const matomo = new MatomoManager({
 *     trackerUrl: 'https://your-matomo.com/matomo.php',
 *     siteId: 1,
 *     debug: true
 *   });
 *
 *   await matomo.initialize('cookie-consent');
 *   await matomo.switchMode('anonymous');
 *   matomo.trackEvent('test', 'action', 'label');
 */

import { MatomoEvent } from '@remix-api';
import { getDomainCustomDimensions, DomainCustomDimensions, ENABLE_MATOMO_LOCALHOST, getSiteIdForTracking } from './MatomoConfig';
import { BotDetector, BotDetectionResult } from './BotDetector';

// ================== TYPE DEFINITIONS ==================

export interface MatomoConfig {
  trackerUrl: string;
  siteId?: number;
  debug?: boolean;
  customDimensions?: Record<number, string>;
  onStateChange?: StateChangeHandler | null;
  logPrefix?: string;
  scriptTimeout?: number;
  retryAttempts?: number;
  matomoDomains?: Record<string, number>;
  mouseTrackingDelay?: number; // ms to wait for mouse movements before initializing (default: 2000)
  waitForMouseTracking?: boolean; // Whether to delay init for mouse tracking (default: true)
}

export interface MatomoState {
  initialized: boolean;
  scriptLoaded: boolean;
  currentMode: InitializationPattern | null;
  consentGiven: boolean;
  lastEventId: number;
  loadingPromise: Promise<void> | null;
}

export interface MatomoStatus {
  matomoLoaded: boolean;
  paqLength: number;
  paqType: 'array' | 'object' | 'undefined';
  cookieCount: number;
  cookies: string[];
}

export interface MatomoTracker {
  getTrackerUrl(): string;
  getSiteId(): number | string;
  trackEvent(eventObj: MatomoEvent): void;
  trackEvent(category: string, action: string, name?: string, value?: string | number): void;
  trackPageView(title?: string): void;
  trackSiteSearch(keyword: string, category?: string, count?: number): void;
  trackGoal(goalId: number, value?: number): void;
  trackLink(url: string, linkType: string): void;
  trackDownload(url: string): void;
  [key: string]: any; // Allow dynamic method calls
}

export interface MatomoDiagnostics {
  config: MatomoConfig;
  state: MatomoState;
  status: MatomoStatus;
  tracker: {
    url: string;
    siteId: number | string;
  } | null;
  plugins: string[];
  userAgent: string;
  timestamp: string;
}

export type InitializationPattern = 'cookie-consent' | 'anonymous' | 'immediate' | 'no-consent';
export type TrackingMode = 'cookie' | 'anonymous';
export type MatomoCommand = [string, ...any[]];
export type LogLevel = 'log' | 'debug' | 'warn' | 'error';

export interface InitializationOptions {
  trackingMode?: boolean;
  timeout?: number;
  [key: string]: any;
}

export interface ModeSwitchOptions {
  forgetConsent?: boolean;
  deleteCookies?: boolean;
  setDimension?: boolean;
  [key: string]: any;
}

export interface PluginLoadOptions {
  timeout?: number;
  retryAttempts?: number;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  initFunction?: string; // Name of the global init function to call after loading
}

export interface DebugPluginE2EHelpers {
  getEvents: () => any[];
  getLatestEvent: () => any;
  getEventsByCategory: (category: string) => any[];
  getEventsByAction: (action: string) => any[];
  getPageViews: () => any[];
  getVisitorIds: () => any[];
  getDimensions: () => Record<string, any>;
  clearData: () => void;
  waitForEvent: (category?: string, action?: string, timeout?: number) => Promise<any>;
}

export interface EventData {
  eventId: number;
  category: string;
  action: string;
  name?: string;
  value?: number;
}

export interface LogData {
  message: string;
  data?: any;
  timestamp: string;
}

export type StateChangeHandler = (event: string, data: any, state: MatomoState & MatomoStatus) => void;
export type EventListener<T = any> = (data: T) => void;

// Global _paq interface
declare global {
  interface Window {
    _paq: any;
    _matomoManagerInstance?: MatomoManager;
    Matomo?: {
      getTracker(): MatomoTracker;
    };
    Piwik?: {
      getTracker(): MatomoTracker;
    };
  }
}

// ================== MATOMO MANAGER INTERFACE ==================

export interface IMatomoManager {
  // Initialization methods
  initialize(pattern?: InitializationPattern, options?: InitializationOptions): Promise<void>;

  // Mode switching and consent management
  switchMode(mode: TrackingMode, options?: ModeSwitchOptions & { processQueue?: boolean }): Promise<void>;
  giveConsent(options?: { processQueue?: boolean }): Promise<void>;
  revokeConsent(): Promise<void>;

  // Tracking methods - both type-safe and legacy signatures supported
  trackEvent(event: MatomoEvent): number;
  trackEvent(category: string, action: string, name?: string, value?: string | number): number;
  trackPageView(title?: string): void;
  setCustomDimension(id: number, value: string): void;

  // State and status methods
  getState(): MatomoState & MatomoStatus;
  getStatus(): MatomoStatus;
  isMatomoLoaded(): boolean;
  getMatomoCookies(): string[];
  deleteMatomoCookies(): Promise<void>;

  // Consent dialog logic
  shouldShowConsentDialog(configApi?: any): boolean;

  // Script loading
  loadScript(): Promise<void>;
  waitForLoad(timeout?: number): Promise<void>;

  // Plugin loading
  loadPlugin(src: string, options?: PluginLoadOptions): Promise<void>;
  loadDebugPlugin(): Promise<void>;
  loadDebugPluginForE2E(): Promise<DebugPluginE2EHelpers>;
  getLoadedPlugins(): string[];
  isPluginLoaded(src: string): boolean;

  // Queue management
  getQueueStatus(): { queueLength: number; initialized: boolean; commands: MatomoCommand[] };
  processPreInitQueue(): Promise<void>;
  clearPreInitQueue(): number;

  // Utility and diagnostic methods
  getDiagnostics(): MatomoDiagnostics;

  // Bot detection methods
  getBotDetectionResult(): BotDetectionResult | null;
  isBot(): boolean;
  getBotType(): string;
  getBotConfidence(): 'high' | 'medium' | 'low' | null;
  reset(): Promise<void>;

  // Event system
  on<T = any>(event: string, callback: EventListener<T>): void;
  off<T = any>(event: string, callback: EventListener<T>): void;
}

// ================== MAIN CLASS ==================

export class MatomoManager implements IMatomoManager {
  private readonly config: Required<MatomoConfig>;
  private state: MatomoState;
  private readonly eventQueue: MatomoCommand[];
  private readonly listeners: Map<string, EventListener[]>;
  private readonly preInitQueue: MatomoCommand[] = [];
  private readonly loadedPlugins: Set<string> = new Set();
  private originalPaqPush: ((...args: any[]) => void) | null = null;
  private customDimensions: DomainCustomDimensions;
  private botDetectionResult: BotDetectionResult | null = null;

  constructor(config: MatomoConfig) {
    this.config = {
      debug: false,
      customDimensions: {},
      onStateChange: null,
      logPrefix: '[MATOMO]',
      scriptTimeout: 10000,
      retryAttempts: 3,
      matomoDomains: {},
      siteId: 0, // Default fallback, will be derived if not explicitly set
      mouseTrackingDelay: 2000, // Wait 2 seconds for mouse movements
      waitForMouseTracking: true, // Enable mouse tracking delay by default
      ...config
    };

    this.state = {
      initialized: false,
      scriptLoaded: false,
      currentMode: null,
      consentGiven: false,
      lastEventId: 0,
      loadingPromise: null
    };

    this.eventQueue = [];
    this.listeners = new Map();

    // Derive siteId from matomoDomains if not explicitly provided or is default
    // (moved after listeners initialization so logging works)
    if (!config.siteId || config.siteId === 0) {
      this.config.siteId = this.deriveSiteId();
    }

    // Initialize domain-specific custom dimensions
    this.customDimensions = getDomainCustomDimensions();

    // Start mouse tracking immediately (but don't analyze yet)
    if (this.config.waitForMouseTracking) {
      BotDetector.startMouseTracking();
      this.log('Mouse tracking started - will analyze before initialization');
    }

    // Perform initial bot detection (without mouse data)
    this.botDetectionResult = BotDetector.detect(false); // Don't include mouse tracking yet
    this.log('Initial bot detection result (without mouse):', this.botDetectionResult);

    this.setupPaqInterception();
    this.log('MatomoManager initialized', this.config);
    this.log('Custom dimensions for domain:', this.customDimensions);
  }

  // ================== SITE ID DERIVATION ==================

  /**
   * Derive siteId from matomoDomains based on current hostname
   * Falls back to electron detection or returns 0 if no match
   */
  private deriveSiteId(): number {
    const hostname = window.location.hostname;
    const domains = this.config.matomoDomains || {};

    // Check if current hostname has a matching site ID
    if (domains[hostname]) {
      this.log(`Derived siteId ${domains[hostname]} from hostname: ${hostname}`);
      return domains[hostname];
    }

    // Check for electron environment
    const isElectron = (window as any).electronAPI !== undefined;
    if (isElectron && domains['localhost']) {
      this.log(`Derived siteId ${domains['localhost']} for electron environment`);
      return domains['localhost'];
    }

    this.log(`No siteId found for hostname: ${hostname}, using fallback: 0`);
    return 0;
  }

  // ================== LOGGING & DEBUGGING ==================

  private log(message: string, data?: any): void {
    if (!this.config.debug) return;

    const timestamp = new Date().toLocaleTimeString();
    const fullMessage = `${this.config.logPrefix} [${timestamp}] ${message}`;

    if (data) {
      console.log(fullMessage, data);
    } else {
      console.log(fullMessage);
    }

    this.emit('log', { message, data, timestamp });
  }

  private setupPaqInterception(): void {
    this.log('Setting up _paq interception');
    if (typeof window === 'undefined') return;

    window._paq = window._paq || [];

    // Check for any existing tracking events and queue them
    const existingEvents = window._paq.filter(cmd => this.isTrackingCommand(cmd));
    if (existingEvents.length > 0) {
      this.log(`🟡 Found ${existingEvents.length} existing tracking events, moving to queue`);
      existingEvents.forEach(cmd => {
        this.preInitQueue.push(cmd as MatomoCommand);
      });

      // Remove tracking events from _paq, keep only config events
      window._paq = window._paq.filter(cmd => !this.isTrackingCommand(cmd));
      this.log(`📋 Cleaned _paq array: ${window._paq.length} config commands remaining`);
    }

    // Store original push for later restoration
    this.originalPaqPush = Array.prototype.push;
    const self = this;

    window._paq.push = function(...args: MatomoCommand[]): number {
      // Process each argument
      const commandsToQueue: MatomoCommand[] = [];
      const commandsToPush: MatomoCommand[] = [];

      args.forEach((arg, index) => {
        if (Array.isArray(arg)) {
          self.log(`_paq.push[${index}]: [${arg.map(item =>
            typeof item === 'string' ? `"${item}"` : item
          ).join(', ')}]`);
        } else {
          self.log(`_paq.push[${index}]: ${JSON.stringify(arg)}`);
        }

        // Queue tracking events if not initialized yet
        if (!self.state.initialized && self.isTrackingCommand(arg)) {
          self.log(`🟡 QUEUING pre-init tracking command: ${JSON.stringify(arg)}`);
          self.preInitQueue.push(arg as MatomoCommand);
          commandsToQueue.push(arg as MatomoCommand);
          self.emit('command-queued', arg);
          // DO NOT add to commandsToPush - this prevents it from reaching _paq
        } else {
          // Either not a tracking command or we're initialized
          commandsToPush.push(arg as MatomoCommand);
        }
      });

      // Only push non-queued commands to _paq
      if (commandsToPush.length > 0) {
        self.emit('paq-command', commandsToPush);
        const result = self.originalPaqPush!.apply(this, commandsToPush);
        self.log(`📋 Added ${commandsToPush.length} commands to _paq (length now: ${this.length})`);
        return result;
      }

      // If we only queued commands, don't modify _paq at all
      if (commandsToQueue.length > 0) {
        self.log(`📋 Queued ${commandsToQueue.length} commands, _paq unchanged (length: ${this.length})`);
      }

      // Return current length (unchanged)
      return this.length;
    };
  }

  /**
   * Check if a command is a tracking command that should be queued
   */
  private isTrackingCommand(command: any): boolean {
    if (!Array.isArray(command) || command.length === 0) return false;

    const trackingCommands = [
      'trackEvent',
      'trackPageView',
      'trackSiteSearch',
      'trackGoal',
      'trackLink',
      'trackDownload'
    ];

    return trackingCommands.includes(command[0]);
  }

  // ================== INITIALIZATION PATTERNS ==================

  /**
   * Initialize Matomo with different patterns
   */
  async initialize(pattern: InitializationPattern = 'cookie-consent', options: InitializationOptions = {}): Promise<void> {
    if (this.state.initialized) {
      this.log('Already initialized, skipping');
      return;
    }

    // For localhost/127.0.0.1, only initialize Matomo when explicitly requested
    // This prevents CircleCI tests from flooding the localhost Matomo domain
    const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    if (isLocalhost) {
      // Check developer flag first, then localStorage as fallback
      const showMatomo = ENABLE_MATOMO_LOCALHOST || (typeof localStorage !== 'undefined' && localStorage.getItem('showMatomo') === 'true');
      if (!showMatomo) {
        this.log('Skipping Matomo initialization on localhost - set ENABLE_MATOMO_LOCALHOST=true in MatomoConfig.ts or localStorage.setItem("showMatomo", "true") to enable');
        return;
      }
    }

    // Prevent multiple simultaneous initializations
    if (this.state.loadingPromise) {
      this.log('Initialization already in progress, waiting...');
      return this.state.loadingPromise;
    }

    this.state.loadingPromise = this.performInitialization(pattern, options);

    try {
      await this.state.loadingPromise;
    } finally {
      this.state.loadingPromise = null;
    }
  }

  private async performInitialization(pattern: InitializationPattern, options: InitializationOptions): Promise<void> {
    this.log(`=== INITIALIZING MATOMO: ${pattern.toUpperCase()} ===`);
    this.log(`📋 _paq array before init: ${window._paq.length} commands`);
    this.log(`📋 Pre-init queue before init: ${this.preInitQueue.length} commands`);

    // Wait for mouse tracking to gather data
    if (this.config.waitForMouseTracking) {
      await this.waitForMouseData();
    }

    // Determine site ID based on bot detection
    const isBot = this.botDetectionResult?.isBot || false;
    const siteId = getSiteIdForTracking(isBot);

    if (siteId !== this.config.siteId) {
      this.log(`🤖 Bot detected - routing to bot tracking site ID: ${siteId} (human site ID: ${this.config.siteId})`);

      // Update custom dimensions if bot site has different dimension IDs
      const botDimensions = getDomainCustomDimensions(true);
      if (botDimensions !== this.customDimensions) {
        this.customDimensions = botDimensions;
        this.log('🔄 Updated to bot-specific custom dimensions:', botDimensions);
      }
    }

    // Basic setup
    this.log('Setting tracker URL and site ID');
    window._paq.push(['setTrackerUrl', this.config.trackerUrl]);
    window._paq.push(['setSiteId', siteId]); // Use bot site ID if configured

    // Apply pattern-specific configuration
    await this.applyInitializationPattern(pattern, options);

    // Common setup
    this.log('Enabling standard features');
    window._paq.push(['enableJSErrorTracking']);
    window._paq.push(['enableLinkTracking']);

    // Set custom dimensions
    for (const [id, value] of Object.entries(this.config.customDimensions)) {
      this.log(`Setting custom dimension ${id}: ${value}`);
      window._paq.push(['setCustomDimension', parseInt(id), value]);
    }

    // Set bot detection dimension
    if (this.botDetectionResult) {
      const botTypeValue = this.botDetectionResult.isBot
        ? this.botDetectionResult.botType || 'unknown-bot'
        : 'human';
      this.log(`Setting bot detection dimension ${this.customDimensions.isBot}: ${botTypeValue} (confidence: ${this.botDetectionResult.confidence})`);
      window._paq.push(['setCustomDimension', this.customDimensions.isBot, botTypeValue]);

      // Log bot detection reasons in debug mode
      if (this.botDetectionResult.reasons.length > 0) {
        this.log('Bot detection reasons:', this.botDetectionResult.reasons);
      }
    }

    // Mark as initialized BEFORE adding trackPageView to prevent it from being queued
    this.state.initialized = true;
    this.state.currentMode = pattern;

    // Set E2E marker for bot detection completion
    this.setE2EStateMarker('matomo-bot-detection-complete');

    // Set trackingMode dimension before bot detection event based on pattern
    // This ensures the bot detection event has proper tracking mode metadata
    if (pattern === 'anonymous') {
      window._paq.push(['setCustomDimension', this.customDimensions.trackingMode, 'anon']);
      this.log('Set trackingMode dimension: anon');
    } else if (pattern === 'immediate') {
      window._paq.push(['setCustomDimension', this.customDimensions.trackingMode, 'cookie']);
      this.log('Set trackingMode dimension: cookie (immediate consent)');
    } else if (pattern === 'cookie-consent') {
      // For cookie-consent mode, we'll set dimension to 'cookie' after consent is given
      // For now, set to 'pending' to indicate consent not yet given
      window._paq.push(['setCustomDimension', this.customDimensions.trackingMode, 'pending']);
      this.log('Set trackingMode dimension: pending (awaiting consent)');
    }
    // no-consent mode doesn't set dimension explicitly

    // Send bot detection event to Matomo for analytics
    if (this.botDetectionResult) {
      this.trackBotDetectionEvent(this.botDetectionResult);
    }

    // Initial page view (now that we're initialized, this won't be queued)
    this.log('Sending initial page view');
    window._paq.push(['trackPageView']);

    this.log(`📋 _paq array before script load: ${window._paq.length} commands`);

    // Load script
    await this.loadScript();

    this.log(`=== INITIALIZATION COMPLETE: ${pattern} ===`);
    this.log(`📋 _paq array after init: ${window._paq.length} commands`);
    this.log(`📋 Pre-init queue contains ${this.preInitQueue.length} commands (use processPreInitQueue() to flush)`);

    // Set E2E marker for complete initialization
    this.setE2EStateMarker('matomo-initialized');

    this.emit('initialized', { pattern, options });
  }

  /**
   * Track bot detection result as a Matomo event
   * This sends detection details to Matomo for analysis
   */
  private trackBotDetectionEvent(detection: BotDetectionResult): void {
    const category = 'bot-detection';
    const action = detection.isBot ? 'bot-detected' : 'human-detected';

    // Name: Primary detection reason (most important one)
    let name = '';
    if (detection.isBot && detection.reasons.length > 0) {
      // Extract the key detection method from first reason
      const firstReason = detection.reasons[0];
      if (firstReason.includes('navigator.webdriver')) {
        name = 'webdriver-flag';
      } else if (firstReason.includes('User agent')) {
        name = 'user-agent-pattern';
      } else if (firstReason.includes('headless')) {
        name = 'headless-browser';
      } else if (firstReason.includes('Browser automation')) {
        name = 'automation-detected';
      } else if (firstReason.includes('missing features')) {
        name = 'missing-features';
      } else if (firstReason.includes('Behavioral signals')) {
        name = 'behavioral-signals';
      } else if (firstReason.includes('Mouse')) {
        name = 'mouse-patterns';
      } else {
        name = 'other-detection';
      }
    } else if (!detection.isBot) {
      // For humans, indicate detection method
      if (detection.mouseAnalysis?.humanLikelihood === 'high') {
        name = 'human-mouse-confirmed';
      } else if (detection.mouseAnalysis?.humanLikelihood === 'medium') {
        name = 'human-mouse-likely';
      } else {
        name = 'human-no-bot-signals';
      }
    }

    // Value: encode detection confidence + number of detection signals
    // High confidence = 100, Medium = 50, Low = 10
    // Add number of reasons as bonus (capped at 9)
    const baseConfidence = detection.confidence === 'high' ? 100 :
      detection.confidence === 'medium' ? 50 : 10;
    const reasonCount = Math.min(detection.reasons.length, 9);
    const value = baseConfidence + reasonCount;

    // Track the event
    window._paq.push([
      'trackEvent',
      category,
      action,
      name,
      value
    ]);

    this.log(`📊 Bot detection event tracked: ${action} → ${name} (confidence: ${detection.confidence}, reasons: ${detection.reasons.length}, value: ${value})`);

    // Log all reasons for debugging
    if (this.config.debug && detection.reasons.length > 0) {
      this.log(`   Detection reasons:`);
      detection.reasons.forEach((reason, i) => {
        this.log(`     ${i + 1}. ${reason}`);
      });
    }

    // Log mouse analysis if available
    if (detection.mouseAnalysis) {
      this.log(`   Mouse: ${detection.mouseAnalysis.movements} movements, likelihood: ${detection.mouseAnalysis.humanLikelihood}`);
    }
  }

  /**
   * Wait for mouse tracking data before initializing Matomo
   * This ensures we have accurate human/bot detection before sending any events
   */
  private async waitForMouseData(): Promise<void> {
    const delay = this.config.mouseTrackingDelay || 2000;
    this.log(`⏳ Waiting ${delay}ms for mouse movements to determine human/bot status...`);

    // Wait for the configured delay
    await new Promise(resolve => setTimeout(resolve, delay));

    // Re-run bot detection with mouse tracking data
    this.botDetectionResult = BotDetector.detect(true); // Include mouse analysis
    this.log('✅ Bot detection complete with mouse data:', this.botDetectionResult);

    if (this.botDetectionResult.mouseAnalysis) {
      this.log('🖱️ Mouse analysis:', {
        movements: this.botDetectionResult.mouseAnalysis.movements,
        humanLikelihood: this.botDetectionResult.mouseAnalysis.humanLikelihood,
        suspiciousPatterns: this.botDetectionResult.mouseAnalysis.suspiciousPatterns
      });
    }
  }

  private async applyInitializationPattern(pattern: InitializationPattern, options: InitializationOptions): Promise<void> {
    switch (pattern) {
    case 'cookie-consent':
      await this.initializeCookieConsent(options);
      break;
    case 'anonymous':
      await this.initializeAnonymous(options);
      break;
    case 'immediate':
      await this.initializeImmediate(options);
      break;
    case 'no-consent':
      await this.initializeNoConsent(options);
      break;
    default:
      throw new Error(`Unknown initialization pattern: ${pattern}`);
    }
  }

  private async initializeCookieConsent(options: InitializationOptions = {}): Promise<void> {
    this.log('Pattern: Cookie consent required');
    window._paq.push(['requireCookieConsent']);
    this.state.consentGiven = false;
  }

  private async initializeAnonymous(options: InitializationOptions = {}): Promise<void> {
    this.log('Pattern: Anonymous mode (no cookies)');
    window._paq.push(['disableCookies']);
    window._paq.push(['disableBrowserFeatureDetection']);
    if (options.trackingMode !== false) {
      window._paq.push(['setCustomDimension', this.customDimensions.trackingMode, 'anon']);
    }
  }

  private async initializeImmediate(options: InitializationOptions = {}): Promise<void> {
    this.log('Pattern: Immediate consent (cookies enabled)');
    window._paq.push(['requireCookieConsent']);
    window._paq.push(['rememberConsentGiven']);
    if (options.trackingMode !== false) {
      window._paq.push(['setCustomDimension', this.customDimensions.trackingMode, 'cookie']);
    }
    this.state.consentGiven = true;
  }

  private async initializeNoConsent(options: InitializationOptions = {}): Promise<void> {
    this.log('Pattern: No consent management (cookies auto-enabled)');
    // No consent calls - Matomo will create cookies automatically
  }

  // ================== MODE SWITCHING ==================

  /**
   * Switch between tracking modes
   */
  async switchMode(mode: TrackingMode, options: ModeSwitchOptions & { processQueue?: boolean } = {}): Promise<void> {
    if (!this.state.initialized) {
      throw new Error('MatomoManager must be initialized before switching modes');
    }

    this.log(`=== SWITCHING TO ${mode.toUpperCase()} MODE ===`);

    const wasMatomoLoaded = this.isMatomoLoaded();
    this.log(`Matomo loaded: ${wasMatomoLoaded}`);

    try {
      switch (mode) {
      case 'cookie':
        await this.switchToCookieMode(wasMatomoLoaded, options);
        break;
      case 'anonymous':
        await this.switchToAnonymousMode(wasMatomoLoaded, options);
        break;
      default:
        throw new Error(`Unknown mode: ${mode}`);
      }

      this.state.currentMode = mode as InitializationPattern;
      this.log(`=== MODE SWITCH COMPLETE: ${mode} ===`);

      // Auto-process queue when switching modes (final decision)
      if (options.processQueue !== false && this.preInitQueue.length > 0) {
        this.log(`🔄 Auto-processing queue after mode switch to ${mode}`);
        await this.flushPreInitQueue();
      }

      this.emit('mode-switched', { mode, options, wasMatomoLoaded });
    } catch (error) {
      this.log(`Error switching to ${mode} mode:`, error);
      this.emit('mode-switch-error', { mode, options, error });
      throw error;
    }
  }

  private async switchToCookieMode(wasMatomoLoaded: boolean, options: ModeSwitchOptions): Promise<void> {
    if (!wasMatomoLoaded) {
      this.log('Matomo not loaded - queuing cookie mode setup');
      window._paq.push(['requireCookieConsent']);
    } else {
      this.log('Matomo loaded - applying cookie mode immediately');
      window._paq.push(['requireCookieConsent']);
    }

    window._paq.push(['rememberConsentGiven']);
    window._paq.push(['enableBrowserFeatureDetection']);

    if (options.setDimension !== false) {
      window._paq.push(['setCustomDimension', this.customDimensions.trackingMode, 'cookie']);
    }

    window._paq.push(['trackEvent', 'mode_switch', 'cookie_mode', 'enabled']);
    this.state.consentGiven = true;
  }

  private async switchToAnonymousMode(wasMatomoLoaded: boolean, options: ModeSwitchOptions): Promise<void> {
    if (options.forgetConsent && wasMatomoLoaded) {
      this.log('WARNING: Using forgetCookieConsentGiven on loaded Matomo may break tracking');
      window._paq.push(['forgetCookieConsentGiven']);
    }

    // BUG FIX: Always set consentGiven to false when switching to anonymous mode
    // Anonymous mode means no cookies, which means no consent for cookie tracking
    this.state.consentGiven = false;
    this.log('Consent state set to false (anonymous mode = no cookie consent)');

    if (options.deleteCookies !== false) {
      await this.deleteMatomoCookies();
    }

    window._paq.push(['disableCookies']);
    window._paq.push(['disableBrowserFeatureDetection']);

    if (options.setDimension !== false) {
      window._paq.push(['setCustomDimension', this.customDimensions.trackingMode, 'anon']);
    }

    window._paq.push(['trackEvent', 'mode_switch', 'anonymous_mode', 'enabled']);
  }

  // ================== CONSENT MANAGEMENT ==================

  async giveConsent(options: { processQueue?: boolean } = {}): Promise<void> {
    this.log('=== GIVING CONSENT ===');
    window._paq.push(['rememberConsentGiven']);

    // Update trackingMode dimension from 'pending' to 'cookie' when consent given
    window._paq.push(['setCustomDimension', this.customDimensions.trackingMode, 'cookie']);
    this.log('Updated trackingMode dimension: cookie (consent given)');

    this.state.consentGiven = true;
    this.emit('consent-given');

    // Automatically process queue when giving consent (final decision)
    if (options.processQueue !== false && this.preInitQueue.length > 0) {
      this.log('🔄 Auto-processing queue after consent given');
      await this.flushPreInitQueue();
    }
  }

  async revokeConsent(): Promise<void> {
    this.log('=== REVOKING CONSENT ===');
    this.log('WARNING: This will stop tracking until consent is given again');
    window._paq.push(['forgetCookieConsentGiven']);
    this.state.consentGiven = false;
    this.emit('consent-revoked');

    // Don't process queue when revoking - user doesn't want tracking
    if (this.preInitQueue.length > 0) {
      this.log(`📋 Queue contains ${this.preInitQueue.length} commands (not processed due to consent revocation)`);
    }
  }

  // ================== TRACKING METHODS ==================

  // Support both type-safe MatomoEvent objects and legacy signatures temporarily
  trackEvent(event: MatomoEvent): number;
  trackEvent(category: string, action: string, name?: string, value?: string | number): number;
  trackEvent(eventObjOrCategory: MatomoEvent | string, action?: string, name?: string, value?: string | number): number {
    const eventId = ++this.state.lastEventId;

    // If first parameter is a MatomoEvent object, use type-safe approach
    if (typeof eventObjOrCategory === 'object' && eventObjOrCategory !== null && 'category' in eventObjOrCategory) {
      const { category, action: eventAction, name: eventName, value: eventValue, isClick } = eventObjOrCategory;
      this.log(`Tracking type-safe event ${eventId}: ${category} / ${eventAction} / ${eventName} / ${eventValue} / isClick: ${isClick}`);

      // Set custom action dimension for click tracking
      if (isClick !== undefined) {
        window._paq.push(['setCustomDimension', this.customDimensions.clickAction, isClick ? 'true' : 'false']);
      }

      const matomoEvent: MatomoCommand = ['trackEvent', category, eventAction];
      if (eventName !== undefined) matomoEvent.push(eventName);
      if (eventValue !== undefined) matomoEvent.push(eventValue);

      window._paq.push(matomoEvent);
      this.emit('event-tracked', { eventId, category, action: eventAction, name: eventName, value: eventValue, isClick });

      return eventId;
    }

    // Legacy string-based approach - no isClick dimension set
    const category = eventObjOrCategory as string;
    this.log(`Tracking legacy event ${eventId}: ${category} / ${action} / ${name} / ${value} (⚠️ no click dimension)`);

    const matomoEvent: MatomoCommand = ['trackEvent', category, action!];
    if (name !== undefined) matomoEvent.push(name);
    if (value !== undefined) matomoEvent.push(value);

    window._paq.push(matomoEvent);
    this.emit('event-tracked', { eventId, category, action, name, value });

    return eventId;
  }

  trackPageView(title?: string): void {
    this.log(`Tracking page view: ${title || 'default'}`);
    const pageView: MatomoCommand = ['trackPageView'];
    if (title) pageView.push(title);

    window._paq.push(pageView);
    this.emit('page-view-tracked', { title });
  }

  setCustomDimension(id: number, value: string): void {
    this.log(`Setting custom dimension ${id}: ${value}`);
    window._paq.push(['setCustomDimension', id, value]);
    this.emit('custom-dimension-set', { id, value });
  }

  // ================== STATE MANAGEMENT ==================

  getState(): MatomoState & MatomoStatus {
    return {
      ...this.state,
      ...this.getStatus()
    };
  }

  getStatus(): MatomoStatus {
    return {
      matomoLoaded: this.isMatomoLoaded(),
      paqLength: window._paq ? window._paq.length : 0,
      paqType: window._paq ? (Array.isArray(window._paq) ? 'array' : 'object') : 'undefined',
      cookieCount: this.getMatomoCookies().length,
      cookies: this.getMatomoCookies()
    };
  }

  isMatomoLoaded(): boolean {
    return typeof window !== 'undefined' &&
           (typeof window.Matomo !== 'undefined' || typeof window.Piwik !== 'undefined');
  }

  getMatomoCookies(): string[] {
    if (typeof document === 'undefined') return [];

    try {
      return document.cookie
        .split(';')
        .map(cookie => cookie.trim())
        .filter(cookie => cookie.startsWith('_pk_') || cookie.startsWith('mtm_'));
    } catch (e) {
      return [];
    }
  }

  async deleteMatomoCookies(): Promise<void> {
    if (typeof document === 'undefined') return;

    this.log('Deleting Matomo cookies');
    const cookies = document.cookie.split(';');

    const deletionPromises: Promise<void>[] = [];

    for (const cookie of cookies) {
      const eqPos = cookie.indexOf('=');
      const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();

      if (name.startsWith('_pk_') || name.startsWith('mtm_')) {
        // Delete for multiple domain/path combinations
        const deletions = [
          `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`,
          `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${window.location.hostname}`,
          `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.${window.location.hostname}`
        ];

        deletions.forEach(deletion => {
          document.cookie = deletion;
        });

        this.log(`Deleted cookie: ${name}`);

        // Add a small delay to ensure cookie deletion is processed
        deletionPromises.push(new Promise(resolve => setTimeout(resolve, 10)));
      }
    }

    await Promise.all(deletionPromises);
  }

  // ================== SCRIPT LOADING ==================

  async loadScript(): Promise<void> {
    if (this.state.scriptLoaded) {
      this.log('Script already loaded');
      return;
    }

    if (typeof document === 'undefined') {
      throw new Error('Cannot load script: document is not available');
    }

    const existingScript = document.querySelector('script[src*="matomo.js"]');
    if (existingScript) {
      this.log('Script element already exists');
      this.state.scriptLoaded = true;
      return;
    }

    return this.loadScriptWithRetry();
  }

  private async loadScriptWithRetry(attempt: number = 1): Promise<void> {
    try {
      await this.doLoadScript();
    } catch (error) {
      if (attempt < this.config.retryAttempts) {
        this.log(`Script loading failed (attempt ${attempt}), retrying...`, error);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        return this.loadScriptWithRetry(attempt + 1);
      } else {
        this.log('Script loading failed after all retries', error);
        throw error;
      }
    }
  }

  private async doLoadScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.log('Loading Matomo script');
      const script = document.createElement('script');
      script.async = true;
      script.src = this.config.trackerUrl.replace('/matomo.php', '/matomo.js');

      const timeout = setTimeout(() => {
        script.remove();
        reject(new Error(`Script loading timeout after ${this.config.scriptTimeout}ms`));
      }, this.config.scriptTimeout);

      script.onload = () => {
        clearTimeout(timeout);
        this.log('Matomo script loaded successfully');
        this.state.scriptLoaded = true;
        this.emit('script-loaded');
        resolve();
      };

      script.onerror = (error) => {
        clearTimeout(timeout);
        script.remove();
        this.log('Failed to load Matomo script', error);
        this.emit('script-error', error);
        reject(new Error('Failed to load Matomo script'));
      };

      document.head.appendChild(script);
    });
  }

  // ================== PLUGIN LOADING ==================

  /**
   * Load a Matomo plugin script
   */
  async loadPlugin(src: string, options: PluginLoadOptions = {}): Promise<void> {
    const {
      timeout = this.config.scriptTimeout,
      retryAttempts = this.config.retryAttempts,
      onLoad,
      onError,
      initFunction
    } = options;

    // Check if plugin is already loaded
    if (this.loadedPlugins.has(src)) {
      this.log(`Plugin already loaded: ${src}`);
      return;
    }

    if (typeof document === 'undefined') {
      throw new Error('Cannot load plugin: document is not available');
    }

    // Check if script element already exists
    const existingScript = document.querySelector(`script[src="${src}"]`);
    if (existingScript) {
      this.log(`Plugin script already exists: ${src}`);
      this.loadedPlugins.add(src);
      return;
    }

    return this.loadPluginWithRetry(src, options, 1);
  }

  /**
   * Load the Matomo debug plugin specifically
   */
  async loadDebugPlugin(): Promise<void> {
    const src = 'assets/js/matomo-debug-plugin.js';

    return this.loadPlugin(src, {
      initFunction: 'initMatomoDebugPlugin',
      onLoad: () => {
        this.log('Debug plugin loaded and initialized');
        this.emit('debug-plugin-loaded');
      },
      onError: (error) => {
        this.log('Debug plugin failed to load:', error);
        this.emit('debug-plugin-error', error);
      }
    });
  }

  /**
   * Load debug plugin specifically for E2E testing with enhanced helpers
   * Returns easy-to-use helper functions for test assertions
   */
  async loadDebugPluginForE2E(): Promise<DebugPluginE2EHelpers> {
    await this.loadDebugPlugin();

    // Wait a bit for plugin to be fully registered
    await new Promise(resolve => setTimeout(resolve, 100));

    const helpers: DebugPluginE2EHelpers = {
      getEvents: () => (window as any).__getMatomoEvents?.() || [],
      getLatestEvent: () => (window as any).__getLatestMatomoEvent?.() || null,
      getEventsByCategory: (category: string) => (window as any).__getMatomoEventsByCategory?.(category) || [],
      getEventsByAction: (action: string) => (window as any).__getMatomoEventsByAction?.(action) || [],
      getPageViews: () => (window as any).__getMatomoPageViews?.() || [],
      getVisitorIds: () => (window as any).__getLatestVisitorId?.() || null,
      getDimensions: () => (window as any).__getMatomoDimensions?.() || {},
      clearData: () => (window as any).__clearMatomoDebugData?.(),

      waitForEvent: async (category?: string, action?: string, timeout = 5000): Promise<any> => {
        const startTime = Date.now();

        return new Promise((resolve, reject) => {
          const checkForEvent = () => {
            const events = helpers.getEvents();

            let matchingEvent = null;
            if (category && action) {
              matchingEvent = events.find(e => e.category === category && e.action === action);
            } else if (category) {
              matchingEvent = events.find(e => e.category === category);
            } else if (action) {
              matchingEvent = events.find(e => e.action === action);
            } else {
              matchingEvent = events[events.length - 1]; // Latest event
            }

            if (matchingEvent) {
              resolve(matchingEvent);
              return;
            }

            if (Date.now() - startTime > timeout) {
              reject(new Error(`Timeout waiting for event${category ? ` category=${category}` : ''}${action ? ` action=${action}` : ''}`));
              return;
            }

            setTimeout(checkForEvent, 100);
          };

          checkForEvent();
        });
      }
    };

    this.log('Debug plugin loaded for E2E testing with enhanced helpers');

    // Set E2E marker for debug plugin loaded
    this.setE2EStateMarker('matomo-debug-plugin-loaded');

    this.emit('debug-plugin-e2e-ready', helpers);

    return helpers;
  }

  /**
   * Get list of loaded plugins
   */
  getLoadedPlugins(): string[] {
    return Array.from(this.loadedPlugins);
  }

  /**
   * Check if a specific plugin is loaded
   */
  isPluginLoaded(src: string): boolean {
    return this.loadedPlugins.has(src);
  }

  private async loadPluginWithRetry(src: string, options: PluginLoadOptions, attempt: number): Promise<void> {
    const retryAttempts = options.retryAttempts || this.config.retryAttempts;

    try {
      await this.doLoadPlugin(src, options);
      this.loadedPlugins.add(src);
    } catch (error) {
      if (attempt < retryAttempts) {
        this.log(`Plugin loading failed (attempt ${attempt}), retrying...`, error);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        return this.loadPluginWithRetry(src, options, attempt + 1);
      } else {
        this.log(`Plugin loading failed after all retries: ${src}`, error);
        if (options.onError) {
          options.onError(error instanceof Error ? error : new Error(String(error)));
        }
        throw error;
      }
    }
  }

  private async doLoadPlugin(src: string, options: PluginLoadOptions): Promise<void> {
    const timeout = options.timeout || this.config.scriptTimeout;

    return new Promise((resolve, reject) => {
      this.log(`Loading plugin: ${src}`);

      const script = document.createElement('script');
      script.async = true;
      script.src = src;

      const timeoutId = setTimeout(() => {
        script.remove();
        reject(new Error(`Plugin loading timeout after ${timeout}ms: ${src}`));
      }, timeout);

      script.onload = () => {
        clearTimeout(timeoutId);
        this.log(`Plugin script loaded: ${src}`);

        // Call initialization function if specified
        if (options.initFunction && typeof (window as any)[options.initFunction] === 'function') {
          try {
            (window as any)[options.initFunction]();
            this.log(`Plugin initialized: ${options.initFunction}`);
          } catch (initError) {
            this.log(`Plugin initialization failed: ${options.initFunction}`, initError);
          }
        }

        if (options.onLoad) {
          options.onLoad();
        }

        this.emit('plugin-loaded', { src, options });
        resolve();
      };

      script.onerror = (error) => {
        clearTimeout(timeoutId);
        script.remove();
        const errorMessage = `Failed to load plugin: ${src}`;
        this.log(errorMessage, error);
        const pluginError = new Error(errorMessage);

        if (options.onError) {
          options.onError(pluginError);
        }

        this.emit('plugin-error', { src, error: pluginError });
        reject(pluginError);
      };

      document.head.appendChild(script);
    });
  }

  // ================== RESET & CLEANUP ==================

  async reset(): Promise<void> {
    this.log('=== RESETTING MATOMO ===');

    // Delete cookies
    await this.deleteMatomoCookies();

    // Clear pre-init queue
    const queuedCommands = this.clearPreInitQueue();

    // Clear _paq array
    if (window._paq && Array.isArray(window._paq)) {
      window._paq.length = 0;
      this.log('_paq array cleared');
    }

    // Remove scripts
    if (typeof document !== 'undefined') {
      const scripts = document.querySelectorAll('script[src*="matomo.js"]');
      scripts.forEach(script => {
        script.remove();
        this.log('Matomo script removed');
      });
    }

    // Reset state
    this.state = {
      initialized: false,
      scriptLoaded: false,
      currentMode: null,
      consentGiven: false,
      lastEventId: 0,
      loadingPromise: null
    };

    this.log(`=== RESET COMPLETE (cleared ${queuedCommands} queued commands) ===`);
    this.emit('reset');
  }

  // ================== EVENT SYSTEM ==================

  on<T = any>(event: string, callback: EventListener<T>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  off<T = any>(event: string, callback: EventListener<T>): void {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event)!;
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any = null): void {
    if (this.listeners.has(event)) {
      this.listeners.get(event)!.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }

    // Call global state change handler if configured
    if (this.config.onStateChange &&
        ['initialized', 'mode-switched', 'consent-given', 'consent-revoked'].includes(event)) {
      try {
        this.config.onStateChange(event, data, this.getState());
      } catch (error) {
        console.error('Error in onStateChange handler:', error);
      }
    }
  }

  // ================== UTILITY METHODS ==================

  /**
   * Get detailed diagnostic information
   */
  getDiagnostics(): MatomoDiagnostics {
    const state = this.getState();
    let tracker: { url: string; siteId: number | string } | null = null;

    if (this.isMatomoLoaded() && window.Matomo) {
      try {
        const matomoTracker = window.Matomo.getTracker();
        tracker = {
          url: matomoTracker.getTrackerUrl(),
          siteId: matomoTracker.getSiteId(),
        };
      } catch (error) {
        this.log('Error getting tracker info:', error);
      }
    }

    return {
      config: this.config,
      state,
      status: this.getStatus(),
      tracker,
      plugins: this.getLoadedPlugins(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.substring(0, 100) : 'N/A',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Determines whether the Matomo consent dialog should be shown
   * Based on existing configuration and consent expiration
   */
  shouldShowConsentDialog(configApi?: any): boolean {
    try {
      // Use domains from constructor config or fallback to empty object
      const matomoDomains = this.config.matomoDomains || {};

      const isElectron = (window as any).electronAPI !== undefined;
      const isSupported = matomoDomains[window.location.hostname] || isElectron;

      if (!isSupported) {
        return false;
      }

      // For localhost/127.0.0.1, only enable Matomo when explicitly requested
      // This prevents CircleCI tests from flooding the localhost Matomo domain
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (isLocalhost) {
        // Check developer flag first, then localStorage as fallback
        const showMatomo = ENABLE_MATOMO_LOCALHOST || localStorage.getItem('showMatomo') === 'true';
        if (!showMatomo) {
          return false;
        }
      }

      // Check current configuration
      if (!configApi) {
        return true; // No config API means we need to show dialog
      }

      const hasExistingConfig = configApi.exists('settings/matomo-perf-analytics');
      const currentSetting = configApi.get('settings/matomo-perf-analytics');

      // If no existing config, show dialog
      if (!hasExistingConfig) {
        return true;
      }

      // Check if consent has expired (6 months)
      const lastConsentCheck = window.localStorage.getItem('matomo-analytics-consent');
      if (!lastConsentCheck) {
        return true; // No consent timestamp means we need to ask
      }

      const consentDate = new Date(Number(lastConsentCheck));
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const consentExpired = consentDate < sixMonthsAgo;

      // Only renew consent if user had disabled analytics and consent has expired
      return currentSetting === false && consentExpired;

    } catch (error) {
      this.log('Error in shouldShowConsentDialog:', error);
      return false; // Fail safely
    }
  }

  /**
   * Get queue status
   */
  getQueueStatus(): {
    queueLength: number;
    initialized: boolean;
    commands: MatomoCommand[];
    } {
    return {
      queueLength: this.preInitQueue.length,
      initialized: this.state.initialized,
      commands: [...this.preInitQueue]
    };
  }

  /**
   * Process the pre-init queue manually
   * Call this when you've made a final decision about consent/mode
   */
  async processPreInitQueue(): Promise<void> {
    if (!this.state.initialized) {
      throw new Error('Cannot process queue before initialization');
    }
    return this.flushPreInitQueue();
  }

  /**
   * Execute a queued command using the appropriate MatomoManager method
   */
  private executeQueuedCommand(command: MatomoCommand): void {
    const [commandName, ...args] = command;

    switch (commandName) {
    case 'trackEvent': {
      const [category, action, name, value] = args;
      this.trackEvent(category, action, name, value);
      break;
    }
    case 'trackPageView': {
      const [title] = args;
      this.trackPageView(title);
      break;
    }
    case 'setCustomDimension': {
      const [id, dimValue] = args;
      this.setCustomDimension(id, dimValue);
      break;
    }
    case 'trackSiteSearch':
    case 'trackGoal':
    case 'trackLink':
    case 'trackDownload':
      // For other tracking commands, fall back to _paq
      this.log(`📋 Using _paq for ${commandName} command: ${JSON.stringify(command)}`);
      this.originalPaqPush?.call(window._paq, command);
      break;
    default:
      this.log(`⚠️ Unknown queued command: ${commandName}, using _paq fallback`);
      this.originalPaqPush?.call(window._paq, command);
      break;
    }
  }

  /**
   * Internal method to actually flush the queue
   */
  private async flushPreInitQueue(): Promise<void> {
    if (this.preInitQueue.length === 0) {
      this.log('No pre-init commands to process');
      return;
    }

    this.log(`🔄 PROCESSING ${this.preInitQueue.length} QUEUED COMMANDS`);
    this.log(`📋 _paq array length before processing: ${window._paq.length}`);

    // Wait a short moment for Matomo to fully initialize
    await new Promise(resolve => setTimeout(resolve, 100));

    // Process each queued command
    for (const [index, command] of this.preInitQueue.entries()) {
      this.log(`📤 Processing queued command ${index + 1}/${this.preInitQueue.length}: ${JSON.stringify(command)}`);

      // Check current mode and consent state before processing
      const currentMode = this.state.currentMode;
      const consentGiven = this.state.consentGiven;

      // Skip tracking events if in consent-required mode without consent
      if (this.isTrackingCommand(command) &&
          (currentMode === 'cookie-consent' && !consentGiven)) {
        this.log(`🚫 Skipping tracking command in ${currentMode} mode without consent: ${JSON.stringify(command)}`);
        continue;
      }

      // Use appropriate MatomoManager method instead of bypassing to _paq
      this.executeQueuedCommand(command);

      this.log(`📋 _paq length after processing command: ${window._paq.length}`);

      // Small delay between commands to avoid overwhelming
      if (index < this.preInitQueue.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    this.log(`✅ PROCESSED ALL ${this.preInitQueue.length} QUEUED COMMANDS`);
    this.log(`📋 Final _paq array length: ${window._paq.length}`);
    this.emit('pre-init-queue-processed', {
      commandsProcessed: this.preInitQueue.length,
      commands: [...this.preInitQueue]
    });

    // Clear the queue
    this.preInitQueue.length = 0;
  }

  /**
   * Clear the pre-init queue without processing
   */
  clearPreInitQueue(): number {
    const cleared = this.preInitQueue.length;
    this.preInitQueue.length = 0;
    this.log(`🗑️ Cleared ${cleared} queued commands`);
    this.emit('pre-init-queue-cleared', { commandsCleared: cleared });
    return cleared;
  }

  /**
   * Wait for Matomo to be loaded
   */
  async waitForLoad(timeout: number = 5000): Promise<void> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkLoaded = () => {
        if (this.isMatomoLoaded()) {
          resolve();
        } else if (Date.now() - startTime > timeout) {
          reject(new Error(`Matomo not loaded after ${timeout}ms`));
        } else {
          setTimeout(checkLoaded, 100);
        }
      };

      checkLoaded();
    });
  }

  // ================== BOT DETECTION METHODS ==================

  /**
   * Get full bot detection result with details
   */
  getBotDetectionResult(): BotDetectionResult | null {
    return this.botDetectionResult;
  }

  /**
   * Check if current visitor is detected as a bot
   */
  isBot(): boolean {
    return this.botDetectionResult?.isBot || false;
  }

  /**
   * Get the type of bot detected (or 'human' if not a bot)
   */
  getBotType(): string {
    if (!this.botDetectionResult?.isBot) {
      return 'human';
    }
    return this.botDetectionResult.botType || 'unknown-bot';
  }

  /**
   * Get confidence level of bot detection
   */
  getBotConfidence(): 'high' | 'medium' | 'low' | null {
    return this.botDetectionResult?.confidence || null;
  }

  // ================== E2E TESTING HELPERS ==================

  /**
   * Set E2E state marker on DOM for reliable test assertions
   * Similar to 'compilerloaded' pattern - creates empty div with data-id
   *
   * @param markerId - Unique identifier for the state (e.g., 'matomo-initialized')
   */
  private setE2EStateMarker(markerId: string): void {
    // Remove any existing marker with this ID
    const existing = document.querySelector(`[data-id="${markerId}"]`);
    if (existing) {
      existing.remove();
    }

    // Create new marker element
    const marker = document.createElement('div');
    marker.setAttribute('data-id', markerId);
    marker.style.display = 'none';
    document.body.appendChild(marker);

    this.log(`🧪 E2E marker set: ${markerId}`);
  }
}

// Default export for convenience
export default MatomoManager;