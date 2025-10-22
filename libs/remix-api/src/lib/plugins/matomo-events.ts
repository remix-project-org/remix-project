/**
 * Matomo Analytics Events - Quick Reference
 * 
 * @example Usage
 * ```ts
 * import { trackMatomoEvent } from '@remix-api'
 * 
 * trackMatomoEvent(plugin, { category: 'ai', action: 'remixAI', name: 'code_generation', isClick: true })
 * trackMatomoEvent(plugin, { category: 'udapp', action: 'DeployAndPublish', name: 'mainnet', isClick: true })
 * ```
 * 
 * @example Common Events
 * ```ts
 * // AI
 * { category: 'ai', action: 'remixAI', isClick: true }, { category: 'ai', action: 'explainFunction', isClick: true }
 * 
 * // Contracts  
 * { category: 'udapp', action: 'DeployAndPublish', isClick: true }, { category: 'udapp', action: 'sendTransactionFromGui', isClick: true }
 * 
 * // Editor
 * { category: 'editor', action: 'save', isClick: true }, { category: 'editor', action: 'format', isClick: true }
 * 
 * // Files
 * { category: 'fileExplorer', action: 'contextMenu', isClick: true }, { category: 'workspace', action: 'create', isClick: true }
 * ```
 * 
 * @example Add New Event
 * ```ts
 * // In ./matomo/events/[category]-events.ts:
 * export interface MyEvent extends MatomoEventBase {
 *   category: 'myCategory'
 *   action: 'myAction'
 * }
 * 
 * export const MyEvents = {
 *   myAction: (name?: string): MyEvent => ({
 *     category: 'myCategory',
 *     action: 'myAction',
 *     name,
 *     isClick: true
 *   })
 * }
 * ```
 */

// Re-export everything from the modular system
export * from './matomo';