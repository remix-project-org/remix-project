/**
 * UI Events - User interface and navigation tracking events
 * 
 * This file contains UI-related events like home tab, topbar, and navigation.
 */

import { MatomoEventBase } from '../core/base-types';

export interface HomeTabEvent extends MatomoEventBase {
  category: 'hometab';
  action: 
    | 'header'
    | 'filesSection'
    | 'scamAlert'
    | 'switchTo'
    | 'titleCard'
    | 'recentWorkspacesCard'
    | 'featuredPluginsToggle'
    | 'featuredPluginsActionClick'
    | 'updatesActionClick'
    | 'homeGetStarted'
    | 'startLearnEthTutorial'
    | 'featuredSection';
}

export interface TopbarEvent extends MatomoEventBase {
  category: 'topbar';
  action: 
    | 'GIT'
    | 'header';
}

export interface LayoutEvent extends MatomoEventBase {
  category: 'layout';
  action: 
    | 'pinToRight'
    | 'pinToLeft';
}

export interface SettingsEvent extends MatomoEventBase {
  category: 'settings';
  action: 
    | 'change';
}

export interface ThemeEvent extends MatomoEventBase {
  category: 'theme';
  action: 
    | 'switchThemeTo';
}

export interface LocaleEvent extends MatomoEventBase {
  category: 'locale';
  action: 
    | 'switchTo';
}

export interface LandingPageEvent extends MatomoEventBase {
  category: 'landingPage';
  action: 
    | 'welcome'
    | 'getStarted'
    | 'tutorial'
    | 'documentation'
    | 'templates'
    | 'MatomoAIModal';
}















