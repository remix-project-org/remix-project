/**
 * RemixTestLibsHandler
 *
 * Handles special imports for Remix testing libraries:
 * - remix_tests.sol
 * - remix_accounts.sol
 *
 * These files are generated dynamically by calling the solidityUnitTesting plugin
 * or can be provided directly if running in a non-plugin context.
 */

import { ImportHandler, ImportHandlerContext, ImportHandlerResult } from './import-handler-interface'
import type { Plugin } from '@remixproject/engine'
import type { IOAdapter } from '../adapters/io-adapter'
import { Logger } from '../utils/logger'
import type { PluginLike } from '../types'

export interface RemixTestLibsHandlerConfig {
  /** Remix plugin API for calling solidityUnitTesting.createTestLibs() */
  pluginApi?: Plugin | PluginLike
  /** IO adapter for checking file existence */
  io: IOAdapter
  /** Optional: Direct content providers if not using plugin */
  testLibContent?: string
  accountsLibContent?: string
  /** Debug logging */
  debug?: boolean
}

export class RemixTestLibsHandler extends ImportHandler {
  private config: RemixTestLibsHandlerConfig
  private logger: Logger

  constructor(config: RemixTestLibsHandlerConfig) {
    // Match both 'remix_tests.sol' and 'remix_accounts.sol'
    super(/^remix_(tests|accounts)\.sol$/)
    this.config = config
    // Cast to Plugin for Logger - PluginLike is compatible with Plugin interface
    this.logger = new Logger(config.pluginApi as Plugin | undefined, config.debug || false)
  }

  getPriority(): number {
    // High priority - should run before general resolution
    return 100
  }

  async handle(context: ImportHandlerContext): Promise<ImportHandlerResult> {
    const { importPath } = context
    const fileName = importPath.split('/').pop() || importPath

    // Check if file already exists
    const expectedPath = `.deps/remix-tests/${fileName}`
    try {
      if (await this.config.io.exists(expectedPath)) {
        const content = await this.config.io.readFile(expectedPath)
        this.log(`📚 Using existing ${fileName} from ${expectedPath}`)
        return {
          handled: true,
          content,
          resolvedPath: expectedPath
        }
      }
    } catch (err) {
      this.log(`ℹ️  ${fileName} not found at ${expectedPath}, will generate`)
    }

    // Try plugin API first
    if (this.config.pluginApi) {
      try {
        await this.config.pluginApi.call('solidityUnitTesting', 'createTestLibs')
        this.log(`✅ Called solidityUnitTesting.createTestLibs() for ${fileName}`)

        // Now read the generated file
        if (await this.config.io.exists(expectedPath)) {
          const content = await this.config.io.readFile(expectedPath)
          return {
            handled: true,
            content,
            resolvedPath: expectedPath
          }
        }
      } catch (err) {
        this.log(`⚠️  Failed to call solidityUnitTesting.createTestLibs():`, err)
      }
    }

    // Fallback to provided content
    if (fileName === 'remix_tests.sol' && this.config.testLibContent) {
      await this.config.io.writeFile(expectedPath, this.config.testLibContent)
      return {
        handled: true,
        content: this.config.testLibContent,
        resolvedPath: expectedPath
      }
    }

    if (fileName === 'remix_accounts.sol' && this.config.accountsLibContent) {
      await this.config.io.writeFile(expectedPath, this.config.accountsLibContent)
      return {
        handled: true,
        content: this.config.accountsLibContent,
        resolvedPath: expectedPath
      }
    }

    // Could not resolve
    this.log(`❌ Could not resolve ${fileName} - no plugin or content available`)
    return { handled: false }
  }

  private log(message: string, ...args: any[]): void {
    this.logger.logIf('handlers', `[RemixTestLibsHandler] ${message}`, ...args)
  }
}
