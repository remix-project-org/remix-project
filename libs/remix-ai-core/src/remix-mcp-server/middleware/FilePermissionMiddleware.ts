/**
 * File Permission Middleware
 * Manages user permissions for file write operations
 */

import { Plugin } from '@remixproject/engine';
import { MCPConfigManager } from '../config/MCPConfigManager';
import { BaseMiddleware } from './BaseMiddleware';

export interface FilePermissionResult {
  allowed: boolean;
  reason?: string;
}

export class FilePermissionMiddleware extends BaseMiddleware {
  constructor(configManager: MCPConfigManager) {
    super(configManager);
  }

  /**
   * Check if file write is allowed for the given file path
   * This is the main entry point for permission checking
   */
  async checkFileWritePermission(
    filePath: string,
    plugin: Plugin
  ): Promise<FilePermissionResult> {
    try {
      const permissions = this.configManager.getFileWritePermission();
      console.log('[FilePermissionMiddleware] Checking file permission for:', filePath);
      console.log('[FilePermissionMiddleware] Current permissions from config:', JSON.stringify(permissions, null, 2));

      // Check current mode
      switch (permissions.mode) {
      case 'allow-all':
        return { allowed: true };

      case 'deny-all':
        return {
          allowed: false,
          reason: 'File writes disabled by user preference'
        };

      case 'allow-specific':
        if (permissions.allowedFiles?.includes(filePath)) {
          return { allowed: true };
        }
        return await this.promptUserPermission(filePath, plugin);

      case 'ask':
      default:
        // Show modal and get user choice
        return await this.promptUserPermission(filePath, plugin);
      }
    } catch (error) {
      console.error('[FilePermissionMiddleware] Error checking permission:', error);
      return {
        allowed: false,
        reason: 'Permission check failed'
      };
    }
  }

  private async promptUserPermission(
    filePath: string,
    plugin: Plugin
  ): Promise<FilePermissionResult> {
    try {
      // First modal: Allow or Deny?
      const allowWrite = await this.showFirstModal(filePath, plugin);

      console.log('[FilePermissionMiddleware] First modal result:', allowWrite);

      if (!allowWrite) {
        // User denied the write - set mode to deny-all
        await this.configManager.setFileWritePermission('deny-all');
        this.showToast(plugin, 'File writing disabled for this project');
        return {
          allowed: false,
          reason: 'User denied file write operation'
        };
      }

      // Add delay to ensure first modal is fully dismissed
      await new Promise(resolve => setTimeout(resolve, 300));
      const scope = await this.showSecondModal(plugin);

      console.log('[FilePermissionMiddleware] Second modal result:', scope);

      if (scope === 'all') {
        // User chose "All Files in Project"
        await this.configManager.setFileWritePermission('allow-all');
        this.showToast(plugin, 'File writing enabled for this project');
        return { allowed: true };
      } else {
        // User chose "Just This File" or dismissed second modal (default to specific)
        await this.configManager.setFileWritePermission('allow-specific', filePath);
        const fileName = filePath.split('/').pop() || filePath;
        this.showToast(plugin, `Permission granted for ${fileName}`);
        return { allowed: true };
      }
    } catch (error) {
      console.error('[FilePermissionMiddleware] Error prompting user:', error);
      return {
        allowed: false,
        reason: 'Permission prompt failed'
      };
    }
  }

  /**
   * Show first modal: Allow or Deny this file write?
   */
  private async showFirstModal(filePath: string, plugin: Plugin): Promise<boolean> {
    try {
      console.log('[FilePermissionMiddleware] Showing first modal for file:', filePath);

      const result = await plugin.call('notification', 'modal', {
        id: 'mcp_file_write_permission_initial',
        title: 'File Write Permission Required',
        message: `The AI assistant wants to write to:\n\n${filePath}\n\nDo you want to allow this file write operation?`,
        okLabel: 'Allow',
        cancelLabel: 'Deny',
        hideFn: () => {
          console.log('[FilePermissionMiddleware] First modal hidden');
        }
      });

      console.log('[FilePermissionMiddleware] First modal raw result:', result);
      return result === true;
    } catch (error) {
      console.error('[FilePermissionMiddleware] Error showing first modal:', error);
      return false;
    }
  }

  private async showSecondModal(plugin: Plugin): Promise<'specific' | 'all'> {
    try {
      console.log('[FilePermissionMiddleware] Showing second modal');

      const result = await plugin.call('notification', 'modal', {
        id: 'mcp_file_write_permission_scope',
        title: 'Permission Scope',
        message: 'How would you like to handle future file write requests?\n\n• Just This File: Only allow this specific file\n• All Files: Allow all file writes in this project',
        okLabel: 'Just This File',
        cancelLabel: 'All Files in Project',
        hideFn: () => {
          console.log('[FilePermissionMiddleware] Second modal hidden');
        }
      });

      console.log('[FilePermissionMiddleware] Second modal raw result:', result);

      try {
        await plugin.call('notification', 'hideModal');
      } catch (hideError) {
        console.log('[FilePermissionMiddleware] Modal hide not available (this is normal)');
      }

      const scope = result === true ? 'specific' : 'all';
      console.log('[FilePermissionMiddleware] Returning scope:', scope);
      return scope;
    } catch (error) {
      console.error('[FilePermissionMiddleware] Error showing second modal:', error);
      // Default to specific on error
      return 'specific';
    }
  }

  /**
   * Show a toast notification to the user
   */
  private showToast(plugin: Plugin, message: string): void {
    try {
      plugin.call('notification', 'toast', message);
    } catch (error) {
      console.error('[FilePermissionMiddleware] Error showing toast:', error);
    }
  }
}
