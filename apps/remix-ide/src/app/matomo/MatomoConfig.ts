/**
 * Matomo Configuration Constants
 *
 * Single source of truth for Matomo site IDs and configuration
 */

import { MatomoConfig } from './MatomoManager';

// ================ DEVELOPER CONFIGURATION ================
/**
 * Enable Matomo tracking on localhost for development and testing
 *
 * USAGE:
 * - Set to `true` to enable Matomo on localhost/127.0.0.1 during development
 * - Set to `false` (default) to disable Matomo on localhost (prevents CI test pollution)
 *
 * ALTERNATIVES:
 * - You can also enable Matomo temporarily by setting localStorage.setItem('showMatomo', 'true') in browser console
 * - The localStorage method is temporary (cleared on browser restart)
 * - This config flag is permanent until you change it back
 *
 * IMPORTANT:
 * - CircleCI tests automatically disable this through environment isolation
 * - Production domains (remix.ethereum.org, etc.) are unaffected by this setting
 * - Only affects localhost and 127.0.0.1 domains
 */
export const ENABLE_MATOMO_LOCALHOST = false;

// Type for domain-specific custom dimensions
export interface DomainCustomDimensions {
  trackingMode: number; // Dimension ID for 'anon'/'cookie' tracking mode
  clickAction: number; // Dimension ID for 'true'/'false' click tracking
  isBot: number; // Dimension ID for 'human'/'bot' detection
}

// Type for domain keys (single source of truth)
export type MatomotDomain = 'alpha.remix.live' | 'beta.remix.live' | 'remix.ethereum.org' | 'localhost' | '127.0.0.1';

// Type for site ID configuration
export type SiteIdConfig = Record<MatomotDomain, number>;

// Type for bot site ID configuration (allows null for same-as-human)
export type BotSiteIdConfig = Record<MatomotDomain, number | null>;

// Type for custom dimensions configuration (enforces all domains have entries)
export type CustomDimensionsConfig = Record<MatomotDomain, DomainCustomDimensions>;

// Type for bot custom dimensions configuration (allows null for same-as-human)
export type BotCustomDimensionsConfig = Record<MatomotDomain, DomainCustomDimensions | null>;

// Single source of truth for Matomo site ids (matches loader.js.txt)
export const MATOMO_DOMAINS: SiteIdConfig = {
  'alpha.remix.live': 1,
  'beta.remix.live': 2,
  'remix.ethereum.org': 3,
  'localhost': 5,
  '127.0.0.1': 5
};

// Bot tracking site IDs (separate databases to avoid polluting human analytics)
// Set to null to use same site ID for bots (they'll be filtered via isBot dimension)
export const MATOMO_BOT_SITE_IDS: BotSiteIdConfig = {
  'alpha.remix.live': null, // TODO: Create bot tracking site in Matomo (e.g., site ID 10)
  'beta.remix.live': null, // TODO: Create bot tracking site in Matomo (e.g., site ID 11)
  'remix.ethereum.org': 8, // TODO: Create bot tracking site in Matomo (e.g., site ID 12)
  'localhost': 7, // Keep bots in same localhost site for testing (E2E tests need cookies)
  '127.0.0.1': 7 // Keep bots in same localhost site for testing (E2E tests need cookies)
};

// Domain-specific custom dimension IDs for HUMAN traffic
// These IDs must match what's configured in each Matomo site
export const MATOMO_CUSTOM_DIMENSIONS: CustomDimensionsConfig = {
  // Production domains
  'alpha.remix.live': {
    trackingMode: 1, // Dimension for 'anon'/'cookie' tracking mode
    clickAction: 2, // Dimension for 'true'/'false' click tracking
    isBot: 3 // Dimension for 'human'/'bot'/'automation' detection
  },
  'beta.remix.live': {
    trackingMode: 1, // Dimension for 'anon'/'cookie' tracking mode
    clickAction: 2, // Dimension for 'true'/'false' click tracking
    isBot: 3 // Dimension for 'human'/'bot'/'automation' detection
  },
  'remix.ethereum.org': {
    trackingMode: 1, // Dimension for 'anon'/'cookie' tracking mode
    clickAction: 2, // Dimension for 'true'/'false' click tracking
    isBot: 3 // Dimension for 'human'/'bot'/'automation' detection
  },
  // Development domains
  localhost: {
    trackingMode: 1, // Dimension for 'anon'/'cookie' tracking mode
    clickAction: 3, // Dimension for 'true'/'false' click tracking
    isBot: 4 // Dimension for 'human'/'bot'/'automation' detection
  },
  '127.0.0.1': {
    trackingMode: 1, // Dimension for 'anon'/'cookie' tracking mode
    clickAction: 3, // Dimension for 'true'/'false' click tracking
    isBot: 4 // Dimension for 'human'/'bot'/'automation' detection
  }
};

// Domain-specific custom dimension IDs for BOT traffic (when using separate bot sites)
// These IDs must match what's configured in the bot tracking sites
// Set to null to use the same dimension IDs as human sites
export const MATOMO_BOT_CUSTOM_DIMENSIONS: BotCustomDimensionsConfig = {
  'alpha.remix.live': null, // TODO: Configure if bot site has different dimension IDs
  'beta.remix.live': null, // TODO: Configure if bot site has different dimension IDs
  'remix.ethereum.org': {
    trackingMode: 1,
    clickAction: 3,
    isBot: 2
  },
  'localhost': {
    trackingMode: 1,
    clickAction: 3,
    isBot: 2
  },
  '127.0.0.1': {
    trackingMode: 1,
    clickAction: 3,
    isBot: 2
  }
};

/**
 * Get the appropriate site ID for the current domain and bot status
 *
 * @param isBot - Whether the visitor is detected as a bot
 * @returns Site ID to use for tracking
 */
export function getSiteIdForTracking(isBot: boolean): number {
  const hostname = window.location.hostname;

  // If bot and bot site ID is configured, use it
  if (isBot && MATOMO_BOT_SITE_IDS[hostname] !== null && MATOMO_BOT_SITE_IDS[hostname] !== undefined) {
    return MATOMO_BOT_SITE_IDS[hostname];
  }

  // Otherwise use normal site ID
  return MATOMO_DOMAINS[hostname] || MATOMO_DOMAINS['localhost'];
}

/**
 * Get custom dimensions configuration for current domain
 *
 * @param isBot - Whether the visitor is detected as a bot (to use bot-specific dimensions if configured)
 */
export function getDomainCustomDimensions(isBot: boolean = false): DomainCustomDimensions {
  const hostname = window.location.hostname;

  // If bot and bot-specific dimensions are configured, use them
  if (isBot && MATOMO_BOT_CUSTOM_DIMENSIONS[hostname] !== null && MATOMO_BOT_CUSTOM_DIMENSIONS[hostname] !== undefined) {
    return MATOMO_BOT_CUSTOM_DIMENSIONS[hostname];
  }

  // Return dimensions for current domain
  if (MATOMO_CUSTOM_DIMENSIONS[hostname]) {
    return MATOMO_CUSTOM_DIMENSIONS[hostname];
  }

  // Fallback to localhost if domain not found
  console.warn(`No custom dimensions found for domain: ${hostname}, using localhost fallback`);
  return MATOMO_CUSTOM_DIMENSIONS['localhost'];
}

/**
 * Create default Matomo configuration
 */
export function createMatomoConfig(): MatomoConfig {
  return {
    trackerUrl: 'https://matomo.remix.live/matomo/matomo.php',
    // siteId will be auto-derived from matomoDomains based on current hostname
    debug: false,
    matomoDomains: MATOMO_DOMAINS,
    scriptTimeout: 10000,
    onStateChange: (event, data, state) => {
      // hook into state changes if needed
    }
  };
}