/**
 * Nudge Events - Contextual feature discovery tracking events
 *
 * This file contains all nudge-related Matomo events including
 * nudge triggers, dismissals, and CTA interactions.
 */

import { MatomoEventBase } from '../core/base-types';

export interface NudgeEvent extends MatomoEventBase {
  category: 'nudge';
  action:
    | 'triggered'
    | 'dismissed'
    | 'dismissedPermanent'
    | 'ctaClicked';
}
