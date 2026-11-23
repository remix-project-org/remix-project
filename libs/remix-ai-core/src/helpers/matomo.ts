import { remixAILogger } from './logger';

/**
 * Sends a Matomo event through the IDE's MatomoManager instance, when there is
 * one. Tracking never throws: a failure here must not break the caller.
 * `value` is Matomo's numeric eventValue (e.g. a chain id); leave it out when
 * there is nothing to send.
 */
export function trackMatomoEvent(category: string, action: string, name: string, value?: number) {
  try {
    if (typeof window !== 'undefined' && (window as any)._matomoManagerInstance) {
      const matomoInstance = (window as any)._matomoManagerInstance;
      if (typeof matomoInstance.trackEvent === 'function') {
        if (value === undefined) matomoInstance.trackEvent(category, action, name);
        else matomoInstance.trackEvent(category, action, name, value);
      }
    }
  } catch (error) {
    // Silent fail for tracking
    remixAILogger.debug('Matomo tracking failed:', error);
  }
}
