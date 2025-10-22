/**
 * Plugin Events - Plugin management and interaction tracking events
 * 
 * This file contains all plugin-related Matomo events.
 */

import { MatomoEventBase } from '../core/base-types';

export interface PluginEvent extends MatomoEventBase {
  category: 'plugin';
  action: 
    | 'activate'
    | 'activated'
    | 'deactivate'
    | 'install'
    | 'error'
    | 'contractFlattener';
}

export interface ManagerEvent extends MatomoEventBase {
  category: 'manager';
  action: 
    | 'activate'
    | 'deactivate'
    | 'toggle';
}

export interface PluginManagerEvent extends MatomoEventBase {
  category: 'pluginManager';
  action: 
    | 'activate'
    | 'deactivate';
}

export interface PluginPanelEvent extends MatomoEventBase {
  category: 'pluginPanel';
  action: 
    | 'toggle'
    | 'open'
    | 'close'
    | 'pinToRight'
    | 'pinToLeft';
}

export interface AppEvent extends MatomoEventBase {
  category: 'App';
  action: 
    | 'queryParams-activated'
    | 'loaded'
    | 'error'
    | 'PreloadError'
    | 'queryParams-calls';
}

export interface MigrateEvent extends MatomoEventBase {
  category: 'Migrate';
  action: 
    | 'start'
    | 'complete'
    | 'error'
    | 'result';
}

export interface MatomoEvent_Core extends MatomoEventBase {
  category: 'Matomo';
  action: 
    | 'showConsentDialog'
    | 'consentAccepted'
    | 'consentRejected'
    | 'trackingEnabled'
    | 'trackingDisabled';
}

export interface MatomoManagerEvent extends MatomoEventBase {
  category: 'MatomoManager';
  action: 
    | 'initialize'
    | 'switchMode'
    | 'trackEvent'
    | 'error'
    | 'showConsentDialog';
}













