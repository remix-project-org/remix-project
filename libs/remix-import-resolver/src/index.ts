// Thin, Node-focused entry for import resolving & flattening
// Primary exports live in this package; ImportResolver is consumed from remix-solidity.

export type { IOAdapter } from './adapters/io-adapter'
export { NodeIOAdapter } from './adapters/node-io-adapter'
export { RemixPluginAdapter } from './adapters/remix-plugin-adapter'
export type { IImportResolver } from './resolvers/import-resolver-interface'

export { ImportResolver } from './resolvers/import-resolver'
export { DependencyResolver } from './resolvers/dependency-resolver'
export type { CompilerInputDepedencyResolver } from './resolvers/dependency-resolver'

export { SourceFlattener } from './cli/source-flattener'
export type { FlattenOptions, FlattenResult } from './cli/source-flattener'

// Resolution Index System
export type { IResolutionIndex } from './resolution-index/base-resolution-index'
export { BaseResolutionIndex } from './resolution-index/base-resolution-index'
export { FileResolutionIndex } from './resolution-index/file-resolution-index'
export { ResolutionIndex } from './resolution-index/resolution-index'

// Import Handler System
export type {
  IImportHandler,
  ImportHandlerContext,
  ImportHandlerResult
} from './handlers/import-handler-interface'
export { ImportHandler } from './handlers/import-handler-interface'
export { ImportHandlerRegistry } from './handlers/import-handler-registry'
export { RemixTestLibsHandler } from './handlers/remix-test-libs-handler'
export { CustomTemplateHandler } from './handlers/custom-template-handler'

export { parseRemappingsFileContent, normalizeRemappings } from './utils/remappings'

// Utils exposed for advanced usage/testing
export { PackageVersionResolver } from './utils/package-version-resolver'
export type { ResolvedVersion } from './utils/package-version-resolver'

// Version Resolution Strategy System
export type {
  IVersionResolutionStrategy,
  VersionResolutionContext
} from './utils/version-resolution-strategies'
export {
  BaseVersionStrategy,
  WorkspaceResolutionStrategy,
  ParentDependencyStrategy,
  LockFileStrategy,
  NpmFetchStrategy
} from './utils/version-resolution-strategies'

export { ConflictChecker } from './utils/conflict-checker'
export type { ConflictCheckerDeps } from './utils/conflict-checker'
export { PackageMapper } from './utils/package-mapper'
export type { PackageMapperDeps } from './utils/package-mapper'
export { Logger } from './utils/logger'
export { WarningSystem } from './utils/warning-system'
export { DependencyStore } from './utils/dependency-store'
export {
  normalizeGithubBlobUrl,
  normalizeRawGithubUrl,
  rewriteNpmCdnUrl,
  normalizeIpfsUrl,
  normalizeSwarmUrl
} from './utils/url-normalizer'
export { toHttpUrl } from './utils/to-http-url'

// Type-safe path types and common interfaces
export type {
  ImportPath,
  LocalPath,
  ResolvedPath,
  VersionedPackage,
  PackageName,
  SemVerString,
  PackageJson,
  PartialPackageJson,
  FileResolutionResult,
  VersionResolutionResult,
  ResolutionMapping,
  LogFunction,
  DeepReadonly,
  StringRecord
} from './types'
export {
  asImportPath,
  asLocalPath,
  asResolvedPath,
  asVersionedPackage,
  asPackageName,
  asSemVer,
  toRawPath
} from './types'
