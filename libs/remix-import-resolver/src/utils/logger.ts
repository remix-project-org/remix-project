import type { Plugin } from '@remixproject/engine'

export type TerminalLogType = 'info' | 'warn' | 'error'

/**
 * Debug configuration for resolver components.
 * Set specific categories to true to enable logging for that component.
 */
export interface ResolverDebugConfig {
  enabled?: boolean // Master switch - if false, all logging disabled
  dependencyResolver?: boolean // DependencyResolver logs
  importResolver?: boolean // ImportResolver logs
  contentFetcher?: boolean // ContentFetcher logs
  packageVersionResolver?: boolean // PackageVersionResolver logs
  resolutionIndex?: boolean // ResolutionIndex logs
  fileResolutionIndex?: boolean // FileResolutionIndex logs
  importHandlerRegistry?: boolean // ImportHandlerRegistry logs
  handlers?: boolean // Import handler logs (remix-test-libs, custom-template)
  sourceFlattener?: boolean // SourceFlattener logs
  warningSystem?: boolean // WarningSystem logs
}

export class Logger {
  private debugConfig: ResolverDebugConfig

  constructor(private pluginApi?: Plugin, debug: boolean | ResolverDebugConfig = false) {
    // Handle both boolean (backwards compat) and object debug config
    if (typeof debug === 'boolean') {
      this.debugConfig = {
        enabled: debug,
        dependencyResolver: debug,
        importResolver: debug,
        contentFetcher: debug,
        packageVersionResolver: debug,
        resolutionIndex: debug,
        fileResolutionIndex: debug,
        importHandlerRegistry: debug,
        handlers: debug,
        sourceFlattener: debug,
        warningSystem: debug
      }
    } else {
      this.debugConfig = {
        enabled: debug.enabled ?? false,
        dependencyResolver: debug.dependencyResolver ?? debug.enabled ?? false,
        importResolver: debug.importResolver ?? debug.enabled ?? false,
        contentFetcher: debug.contentFetcher ?? debug.enabled ?? false,
        packageVersionResolver: debug.packageVersionResolver ?? debug.enabled ?? false,
        resolutionIndex: debug.resolutionIndex ?? debug.enabled ?? false,
        fileResolutionIndex: debug.fileResolutionIndex ?? debug.enabled ?? false,
        importHandlerRegistry: debug.importHandlerRegistry ?? debug.enabled ?? false,
        handlers: debug.handlers ?? debug.enabled ?? false,
        sourceFlattener: debug.sourceFlattener ?? debug.enabled ?? false,
        warningSystem: debug.warningSystem ?? debug.enabled ?? false
      }
    }
  }

  log(message: string, ...args: any[]) {
    if (this.debugConfig.enabled) console.log(message, ...args)
  }

  warn(message: string, ...args: any[]) {
    if (this.debugConfig.enabled) console.warn(message, ...args)
  }

  error(message: string, ...args: any[]) {
    console.error(message, ...args)
  }

  logIf(category: keyof ResolverDebugConfig, message: string, ...args: any[]) {
    if (!this.debugConfig.enabled) return
    if (this.debugConfig[category]) console.log(message, ...args)
  }

  warnIf(category: keyof ResolverDebugConfig, message: string, ...args: any[]) {
    if (!this.debugConfig.enabled) return
    if (this.debugConfig[category]) console.warn(message, ...args)
  }

  async terminal(type: TerminalLogType, value: string) {
    try {
      if (this.pluginApi) {
        await this.pluginApi.call('terminal', 'log', { type, value })
        return
      }
    } catch {}
    if (type === 'error') console.error(value)
    else if (type === 'warn') console.warn(value)
    else console.log(value)
  }

  isEnabled(category?: keyof ResolverDebugConfig): boolean {
    if (!this.debugConfig.enabled) return false
    if (!category) return true
    return this.debugConfig[category] || false
  }
}
