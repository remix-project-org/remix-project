/**
 * ImportHandlerRegistry
 *
 * Manages a collection of import handlers and executes them in priority order.
 */

import { IImportHandler, ImportHandlerContext, ImportHandlerResult } from './import-handler-interface'
import { Logger } from '../utils/logger'

export class ImportHandlerRegistry {
  private handlers: IImportHandler[] = []
  private logger: Logger

  constructor(debug: boolean = false) {
    this.logger = new Logger(undefined, debug)
  }

  /**
   * Register a new import handler
   */
  register(handler: IImportHandler): void {
    this.handlers.push(handler)
    // Sort by priority (descending)
    this.handlers.sort((a, b) => {
      const priorityA = a.getPriority?.() ?? 0
      const priorityB = b.getPriority?.() ?? 0
      return priorityB - priorityA
    })
    this.log(`Registered handler for pattern: ${handler.getPattern()} (priority: ${handler.getPriority?.() ?? 0})`)
  }

  /**
   * Unregister a handler
   */
  unregister(handler: IImportHandler): void {
    const index = this.handlers.indexOf(handler)
    if (index !== -1) {
      this.handlers.splice(index, 1)
      this.log(`Unregistered handler for pattern: ${handler.getPattern()}`)
    }
  }

  /**
   * Clear all handlers
   */
  clear(): void {
    this.handlers = []
    this.log('Cleared all handlers')
  }

  /**
   * Try to handle an import with registered handlers
   * Returns the result from the first handler that can handle it
   */
  async tryHandle(context: ImportHandlerContext): Promise<ImportHandlerResult | null> {
    const { importPath } = context

    for (const handler of this.handlers) {
      if (handler.canHandle(importPath)) {
        this.log(`🎯 Handler matched for "${importPath}": ${handler.getPattern()}`)

        try {
          const result = await handler.handle(context)

          if (result.handled) {
            this.log(`✅ Handler successfully processed "${importPath}"`)
            return result
          } else {
            this.log(`⏭️  Handler declined to process "${importPath}"`)
          }
        } catch (err) {
          this.log(`❌ Handler failed for "${importPath}":`, err)
          // Continue to next handler
        }
      }
    }

    return null
  }

  /**
   * Get all registered handlers
   */
  getHandlers(): ReadonlyArray<IImportHandler> {
    return this.handlers
  }

  private log(message: string, ...args: any[]): void {
    this.logger.logIf('importHandlerRegistry', `[ImportHandlerRegistry] ${message}`, ...args)
  }
}
