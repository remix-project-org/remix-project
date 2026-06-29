export interface IImportResolver {
  resolveAndSave(url: string): Promise<string>
  saveResolutionsToIndex(): Promise<void>
  getTargetFile(): string

  // Optional methods that may be implemented by specific resolvers
  setCacheEnabled?(enabled: boolean): void
  ensurePackageContextLoaded?(context: string): Promise<void>
}

/**
 * Type guard to check if resolver has setCacheEnabled method.
 */
export function hasCacheControl(resolver: IImportResolver): resolver is IImportResolver & { setCacheEnabled: (enabled: boolean) => void } {
  return 'setCacheEnabled' in resolver && typeof resolver.setCacheEnabled === 'function'
}

/**
 * Type guard to check if resolver has ensurePackageContextLoaded method.
 */
export function hasPackageContextLoading(resolver: IImportResolver): resolver is IImportResolver & { ensurePackageContextLoaded: (context: string) => Promise<void> } {
  return 'ensurePackageContextLoaded' in resolver && typeof resolver.ensurePackageContextLoaded === 'function'
}