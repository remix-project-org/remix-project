/**
 * File Events - File explorer and workspace management tracking events
 *
 * This file contains all file management related Matomo events.
 */

import { MatomoEventBase } from '../core/base-types';

export interface FileExplorerEvent extends MatomoEventBase {
  category: 'fileExplorer';
  action:
    | 'contextMenu'
    | 'createMenuButtonOpen'
    | 'createBlankFile'
    | 'createNewFile'
    | 'createNewFolder'
    | 'createNewWorkspace'
    | 'uploadFolder'
    | 'importFromIpfs'
    | 'importFromLocalFileSystem'
    | 'importFromHttps'
    | 'workspaceMenu'
    | 'fileAction'
    | 'deleteKey'
    | 'osxDeleteKey'
    | 'f2ToRename'
    | 'copyCombo'
    | 'cutCombo'
    | 'pasteCombo';
}

export interface WorkspaceEvent extends MatomoEventBase {
  category: 'workspace';
  action:
    | 'switchWorkspace'
    | 'template'
    | 'GIT';
}

export interface StorageEvent extends MatomoEventBase {
  category: 'Storage';
  action:
    | 'activate'
    | 'error';
}

export interface BackupEvent extends MatomoEventBase {
  category: 'Backup';
  action:
    | 'create'
    | 'restore'
    | 'error'
    | 'download'
    | 'userActivate';
}

export interface WorkspaceStorageEvent extends MatomoEventBase {
  category: 'WorkspaceStorage';
  action:
    | 'workspaceSize'      // Total size of a workspace (KB)
    | 'nodeModulesSize'    // Size of node_modules folder (KB)
    | 'gitSize'            // Size of .git folder (KB)
    | 'totalStorageSize';  // Total storage size across all workspaces (KB)
}







