/**
 * Tracking Function Factory
 *
 * Creates a standardized tracking function that works with MatomoManager
 */

import { MatomoEvent, MatomoEventBase } from '@remix-api';
import { MatomoManager } from '../matomo/MatomoManager';

export type TrackingFunction = (
  event: MatomoEvent
) => void;

/**
 * Create a tracking function that properly delegates to MatomoManager
 * Value can be either string or number as per Matomo API specification
 */
export function createTrackingFunction(matomoManager: MatomoManager): TrackingFunction {
  return (event: MatomoEvent) => {
    // Pass the event directly to MatomoManager without converting value
    // Matomo API accepts both string and number for the value parameter
    matomoManager.trackEvent?.(event);
  };
}