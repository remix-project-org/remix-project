import { IFilePanel } from '@remixproject/plugin-api'
import { StatusEvents } from '@remixproject/plugin-utils'
import { MatomoEvent } from './matomo-events'

// Import types from MatomoManager
export type InitializationPattern = 'cookie-consent' | 'anonymous' | 'immediate' | 'no-consent';

export interface InitializationOptions {
  trackingMode?: boolean;
  timeout?: number;
  [key: string]: any;
}

export type TrackingMode = 'cookie' | 'anonymous';

export interface ModeSwitchOptions {
  forgetConsent?: boolean;
  deleteCookies?: boolean;
  setDimension?: boolean;
  processQueue?: boolean;
  [key: string]: any;
}

export interface MatomoCommand extends Array<any> {
  0: string; // Command name
}

export interface MatomoState {
  initialized: boolean;
  scriptLoaded: boolean;
  currentMode: string | null;
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

export interface MatomoDiagnostics {
  config: any;
  state: MatomoState;
  status: MatomoStatus;
  tracker: {
    url: string;
    siteId: number | string;
  } | null;
  userAgent: string;
  timestamp: string;
}

export interface IMatomoApi {
    events: {
        'matomo-initialized': (data: any) => void;
        'matomo-consent-changed': (data: any) => void;
        'matomo-mode-switched': (data: any) => void;
    } & StatusEvents
    methods: {
        // Type-safe tracking method
        track: (event: MatomoEvent) => void;
        
        // Direct access to full interface
        getManager: () => any;
        getMatomoManager: () => any;
        
        // Initialization methods
        initialize: (pattern?: InitializationPattern, options?: InitializationOptions) => Promise<void>;
        loadScript: () => Promise<void>;
        waitForLoad: (timeout?: number) => Promise<void>;
        
        // Mode switching & consent management
        switchMode: (mode: TrackingMode, options?: ModeSwitchOptions) => Promise<void>;
        giveConsent: (options?: { processQueue?: boolean }) => Promise<void>;
        revokeConsent: () => Promise<void>;
        
        // Tracking methods
        trackEvent: (event: MatomoEvent) => number;
        trackPageView: (title?: string) => void;
        setCustomDimension: (id: number, value: string) => void;
        
        // State and status methods
        getState: () => MatomoState & MatomoStatus;
        getStatus: () => MatomoStatus;
        isMatomoLoaded: () => boolean;
        getMatomoCookies: () => string[];
        deleteMatomoCookies: () => Promise<void>;
        
        // Queue management
        getQueueStatus: () => { queueLength: number; initialized: boolean; commands: MatomoCommand[] };
        processPreInitQueue: () => Promise<void>;
        clearPreInitQueue: () => number;
        
        // Utility and diagnostic methods
        getDiagnostics: () => MatomoDiagnostics;
        reset: () => Promise<void>;
        
        // Event system (renamed to avoid Plugin conflicts)
        addMatomoListener: <T = any>(event: string, callback: (data: T) => void) => void;
        removeMatomoListener: <T = any>(event: string, callback: (data: T) => void) => void;
    }
}
