/**
 * Cloud storage module — barrel export.
 */
export { S3Client } from './s3-client'
export { CloudSyncEngine, cloudSyncEngine } from './cloud-sync-engine'
export { CloudProvider, useCloudState } from './cloud-context'
export { cloudStore, useCloudStore } from './cloud-store'
export {
  setCloudPlugin,
  setCreateDefaultCloudWorkspaceFn,
  cloudLocalKey,
  enterCloudProvider,
  exitCloudProvider,
  isCloudProvider,
  getWorkspaceProvider,
  switchToCloudWorkspace,
  renameCloudWorkspaceAction,
  deleteCloudWorkspaceAction,
  refreshCloudWorkspaces,
  startFileChangeTracking,
  enableCloud,
  disableCloud,
} from './cloud-workspace-actions'
export {
  enableCloudFSObserver,
  disableCloudFSObserver,
  onCloudFSWrite,
  clearCloudFSListeners,
  isCloudFSObserverActive,
  extractCloudWorkspaceUuid,
  extractRelativePath,
} from './cloud-fs-observer'
export type { FSWriteOperation } from './cloud-fs-observer'
export {
  fetchSTSToken,
  fetchWorkspaceSTS,
  listCloudWorkspaces,
  createCloudWorkspace,
  getCloudWorkspace,
  updateCloudWorkspace,
  deleteCloudWorkspace,
  verifyManifest,
  VersionConflictException,
} from './cloud-workspace-api'
export { packWorkspace, unpackWorkspace, WORKSPACE_ZIP_KEY } from './cloud-workspace-zip'
export { CloudMigrationDialog } from './cloud-migration-dialog'
export {
  discoverLocalWorkspaces,
  buildMigrationItems,
  migrateWorkspace,
  migrateWorkspaces,
  hasPendingMigrations,
  dismissMigration,
  clearMigrationDismissal,
} from './cloud-migration'
export type {
  LocalWorkspaceInfo,
  MigrationStatus,
  MigrationItem,
  MigrationProgressCallback,
} from './cloud-migration'
export type {
  STSToken,
  CloudWorkspace,
  CloudState,
  CloudMode,
  WorkspaceSyncStatus,
  FileChangeRecord,
  S3Object,
  WorkspaceMapping,
  FileSyncStatus,
  VersionConflictError,
  SyncManifest,
  SyncManifestEntry,
  ManifestVerifyRequest,
  ManifestVerifyResponse,
  ManifestFileDiff,
} from './types'
