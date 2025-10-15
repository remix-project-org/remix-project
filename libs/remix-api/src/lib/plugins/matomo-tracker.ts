/**
 * Type-safe Matomo tracking helper utility
 * 
 * This utility provides compile-time type safety for Matomo tracking calls
 * by bypassing loose plugin API typing and enforcing MatomoEvent types.
 * 
 * Usage:
 *   import { trackMatomoEvent } from '@remix-api';
 *   
 *   // Instead of: plugin.call('matomo', 'trackEvent', 'category', 'action', 'name')
 *   trackMatomoEvent(plugin, { category: 'homeTab', action: 'WORKSPACE_LOADED', name: 'workspaceName', isClick: false });
 * 
 *   // Instead of: await api.call('matomo', 'trackEvent', 'ai', 'chat', 'user-input')
 *   await trackMatomoEvent(api, { category: 'ai', action: 'CHAT', name: 'user-input', isClick: false });
 */

import { MatomoEvent } from './matomo-events';

/**
 * Type definition for any plugin-like object with a call method
 */
export interface PluginLike {
  call: (pluginName: string, method: string, ...args: any[]) => any;
}

/**
 * Type-safe synchronous Matomo tracking function
 * 
 * @param plugin - Any plugin-like object with a call method
 * @param event - Type-safe MatomoEvent object with category, action, name, and value
 */
export function trackMatomoEvent(plugin: PluginLike, event: MatomoEvent): void {
  if (!plugin || typeof plugin.call !== 'function') {
    console.warn('trackMatomoEvent: Invalid plugin provided');
    return;
  }

  if (!event || typeof event !== 'object' || !event.category || !event.action) {
    console.warn('trackMatomoEvent: Invalid MatomoEvent provided', event);
    return;
  }

  // Use the plugin's call method but with type-safe parameters
  plugin.call('matomo', 'trackEvent', event);
}

/**
 * Type-safe asynchronous Matomo tracking function
 * 
 * @param plugin - Any plugin-like object with a call method
 * @param event - Type-safe MatomoEvent object with category, action, name, and value
 * @returns Promise that resolves when tracking is complete
 */
export async function trackMatomoEventAsync(plugin: PluginLike, event: MatomoEvent): Promise<void> {
  if (!plugin || typeof plugin.call !== 'function') {
    console.warn('trackMatomoEventAsync: Invalid plugin provided');
    return;
  }

  if (!event || typeof event !== 'object' || !event.category || !event.action) {
    console.warn('trackMatomoEventAsync: Invalid MatomoEvent provided', event);
    return;
  }

  // Use the plugin's call method but with type-safe parameters
  await plugin.call('matomo', 'trackEvent', event);
}

/**
 * Type-safe Matomo tracking class for stateful usage
 * 
 * Useful when you want to maintain a reference to the plugin
 * and make multiple tracking calls.
 */
export class MatomoTracker {
  constructor(private plugin: PluginLike) {
    if (!plugin || typeof plugin.call !== 'function') {
      throw new Error('MatomoTracker: Invalid plugin provided');
    }
  }

  /**
   * Track a MatomoEvent synchronously
   */
  track(event: MatomoEvent): void {
    trackMatomoEvent(this.plugin, event);
  }

  /**
   * Track a MatomoEvent asynchronously
   */
  async trackAsync(event: MatomoEvent): Promise<void> {
    await trackMatomoEventAsync(this.plugin, event);
  }

  /**
   * Create a scoped tracker for a specific event category
   * This provides additional type safety by constraining to specific event builders
   */
  createCategoryTracker<T extends Record<string, (...args: any[]) => MatomoEvent>>(
    eventBuilders: T
  ): CategoryTracker<T> {
    return new CategoryTracker(this.plugin, eventBuilders);
  }
}

/**
 * Category-specific tracker that constrains to specific event builders
 */
export class CategoryTracker<T extends Record<string, (...args: any[]) => MatomoEvent>> {
  constructor(
    private plugin: PluginLike,
    private eventBuilders: T
  ) {}

  /**
   * Track using a specific event builder method
   */
  track<K extends keyof T>(
    builderMethod: K,
    ...args: T[K] extends (...args: infer P) => any ? P : never
  ): void {
    const event = this.eventBuilders[builderMethod](...args);
    trackMatomoEvent(this.plugin, event);
  }

  /**
   * Track using a specific event builder method asynchronously
   */
  async trackAsync<K extends keyof T>(
    builderMethod: K,
    ...args: T[K] extends (...args: infer P) => any ? P : never
  ): Promise<void> {
    const event = this.eventBuilders[builderMethod](...args);
    await trackMatomoEventAsync(this.plugin, event);
  }
}

/**
 * Convenience function to create a MatomoTracker instance
 */
export function createMatomoTracker(plugin: PluginLike): MatomoTracker {
  return new MatomoTracker(plugin);
}