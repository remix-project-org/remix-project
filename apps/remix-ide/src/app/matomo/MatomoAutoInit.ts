/**
 * MatomoAutoInit - Handles automatic Matomo initialization based on existing user settings
 *
 * This module provides automatic initialization of Matomo tracking when users have
 * previously made consent choices, eliminating the need to show consent dialogs
 * for returning users while respecting their privacy preferences.
 */

import { MatomoManager } from './MatomoManager';

import Config from '../../config';
import { Registry } from '@remix-project/remix-lib';
import { Storage } from '@remix-project/remix-lib';

export interface MatomoAutoInitOptions {
  matomoManager: MatomoManager;
  debug?: boolean;
}

/**
 * Setup configuration and registry, then automatically initialize Matomo if user has existing settings
 *
 * @param options Configuration object containing MatomoManager instance
 * @returns Promise<boolean> - true if auto-initialization occurred, false otherwise
 */
export async function autoInitializeMatomo(options: MatomoAutoInitOptions): Promise<boolean> {
  const { matomoManager, debug = false } = options;

  const log = (message: string, ...args: any[]) => {
    if (debug) {
      console.log(`[Matomo][AutoInit] ${message}`, ...args);
    }
  };

  // Setup configuration and registry
  let config: any;
  try {
    const configStorage = new Storage('config-v0.8:')
    config = new Config(configStorage)
    Registry.getInstance().put({ api: config, name: 'config' })
    log('Config setup completed');
  } catch (e) {
    log('Config setup failed:', e);
  }

  try {
    // Check if we should show the consent dialog
    const shouldShowDialog = matomoManager.shouldShowConsentDialog(config);

    if (!shouldShowDialog && config) {
      // User has made their choice before, initialize automatically
      const perfAnalyticsEnabled = config.get('settings/matomo-perf-analytics');
      log('Auto-initializing with existing settings, perf analytics:', perfAnalyticsEnabled);

      if (perfAnalyticsEnabled === true) {
        // User enabled performance analytics = cookie mode
        await matomoManager.initialize('immediate');
        log('Auto-initialized with immediate (cookie) mode');

        // Process any queued tracking events
        await matomoManager.processPreInitQueue();
        log('Pre-init queue processed');

        return true;

      } else if (perfAnalyticsEnabled === false) {
        // User disabled performance analytics = anonymous mode
        await matomoManager.initialize('anonymous');
        log('Auto-initialized with anonymous mode');

        // Process any queued tracking events
        await matomoManager.processPreInitQueue();
        log('Pre-init queue processed');

        return true;
      } else {
        log('No valid perf analytics setting found, skipping auto-initialization');
        return false;
      }

    } else if (shouldShowDialog) {
      log('Consent dialog will be shown, skipping auto-initialization');
      return false;

    } else {
      log('No config available, skipping auto-initialization');
      return false;
    }

  } catch (error) {
    console.warn('[Matomo][AutoInit] Error during auto-initialization:', error);
    return false;
  }
}

/**
 * Get the current tracking mode based on existing configuration
 * Useful for determining user's previous choice without initializing
 */
export function getCurrentTrackingMode(config?: any): 'cookie' | 'anonymous' | 'none' {
  if (!config) {
    return 'none';
  }

  try {
    const perfAnalyticsEnabled = config.get('settings/matomo-perf-analytics');

    if (perfAnalyticsEnabled === true) {
      return 'cookie';
    } else if (perfAnalyticsEnabled === false) {
      return 'anonymous';
    } else {
      return 'none';
    }
  } catch (error) {
    console.warn('[Matomo][AutoInit] Error reading tracking mode:', error);
    return 'none';
  }
}

/**
 * Check if user has made a previous tracking choice
 */
export function hasExistingTrackingChoice(config?: any): boolean {
  if (!config) {
    return false;
  }

  try {
    const perfAnalyticsSetting = config.get('settings/matomo-perf-analytics');
    return typeof perfAnalyticsSetting === 'boolean';
  } catch (error) {
    return false;
  }
}