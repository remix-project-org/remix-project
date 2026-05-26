/**
 * Help Events - Help plugin and guide modal tracking events
 *
 * This file contains all help-related Matomo events including
 * modal opens, closes, topic card clicks, CTA actions, and external links.
 */

import { MatomoEventBase } from '../core/base-types';

export interface HelpEvent extends MatomoEventBase {
  category: 'help';
  action:
    | 'modalOpened'
    | 'modalClosed'
    | 'topicCardClicked'
    | 'ctaAction'
    | 'reelFeatureClicked'
    | 'reelDismissed'
    | 'betaFeatureClicked'
    | 'betaFeedbackClicked'
    | 'betaLinkClicked'
    | 'betaFarewellClosed'
    | 'betaFarewellSurveyOpened'
    | 'betaFarewellDismissed';
}
