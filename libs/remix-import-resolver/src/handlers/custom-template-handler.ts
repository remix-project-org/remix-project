/**
 * Example: Custom Import Handler
 *
 * This demonstrates how to create a custom handler for specific import patterns.
 * For example, a handler that generates boilerplate test files on-the-fly.
 */

import { ImportHandler, ImportHandlerContext, ImportHandlerResult } from './import-handler-interface'
import type { IOAdapter } from '../adapters/io-adapter'
import { Logger } from '../utils/logger'

export interface CustomTemplateHandlerConfig {
  io: IOAdapter
  /** Template content generator function */
  templateGenerator: (importPath: string, context: ImportHandlerContext) => Promise<string> | string
  debug?: boolean
}

/**
 * Example handler that generates files from templates based on naming patterns
 */
export class CustomTemplateHandler extends ImportHandler {
  private config: CustomTemplateHandlerConfig
  private logger: Logger

  constructor(pattern: string | RegExp, config: CustomTemplateHandlerConfig) {
    super(pattern)
    this.config = config
    this.logger = new Logger(undefined, config.debug || false)
  }

  async handle(context: ImportHandlerContext): Promise<ImportHandlerResult> {
    try {
      const content = await this.config.templateGenerator(context.importPath, context)

      // Determine where to save
      const targetPath = context.targetPath || `.deps/custom/${context.importPath}`

      // Save the generated content
      await this.config.io.writeFile(targetPath, content)

      this.log(`✅ Generated and saved: ${targetPath}`)

      return {
        handled: true,
        content,
        resolvedPath: targetPath
      }
    } catch (err) {
      this.log(`❌ Failed to generate template:`, err)
      return { handled: false }
    }
  }

  private log(message: string, ...args: any[]): void {
    this.logger.logIf('handlers', `[CustomTemplateHandler] ${message}`, ...args)
  }
}
