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
  category: 'Workspace';
  action: 
    | 'switchWorkspace'
    | 'GIT'
    | 'createWorkspace';
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







