/**
 * User Events - Authentication, user menu, cloud workspaces, walkthrough, notification, and feedback tracking
 *
 * Covers all user-lifecycle and engagement events:
 * - Auth: login, logout, provider selection
 * - User menu: dropdown actions (clone, gist, github, bug report, feature request, docs, theme)
 * - Cloud workspaces: save, backup, restore, enable, encryption, autosave
 * - Walkthrough: start, complete, search
 * - Notifications: open, action, dismiss, mark read
 * - Feedback: open panel, close panel
 */

import { MatomoEventBase } from '../core/base-types';

// ================== AUTH EVENTS ==================

export interface AuthEvent extends MatomoEventBase {
  category: 'auth';
  action:
    | 'loginStart'       // User clicked a provider button in login modal
    | 'loginSuccess'     // Auth completed successfully (emitted from auth-context)
    | 'loginFailed'      // Auth failed
    | 'logout'           // User logged out
    | 'openLoginModal'   // Sign In button clicked
    | 'closeLoginModal'; // Login modal dismissed
}

// ================== USER MENU EVENTS ==================

export interface UserMenuEvent extends MatomoEventBase {
  category: 'userMenu';
  action:
    | 'openDropdown'       // User dropdown opened
    | 'cloneGitRepository' // Clone action
    | 'publishToGist'      // Publish to Gist action
    | 'connectGitHub'      // Connect GitHub account
    | 'disconnectGitHub'   // Disconnect GitHub account
    | 'manageAccounts'     // Manage Accounts clicked
    | 'reportBug'          // Report a Bug link
    | 'requestFeature'     // Request a Feature link
    | 'documentation'      // Documentation link
    | 'themeToggle'        // Dark/Light mode toggle
    | 'signOut'            // Sign Out button
    | 'badgeClick';        // Feature badge clicked (e.g., beta info modal)
}

// ================== CLOUD WORKSPACE EVENTS ==================

export interface CloudWorkspaceEvent extends MatomoEventBase {
  category: 'cloudWorkspace';
  action:
    | 'saveToCloud'          // Save workspace to cloud
    | 'createBackup'         // Create manual backup
    | 'restoreAutosave'      // Restore from autosave
    | 'restoreBackup'        // Restore a specific backup
    | 'deleteBackup'         // Delete a backup
    | 'downloadBackup'       // Download a backup
    | 'linkToCurrentUser'    // Link workspace to current user
    | 'enableCloud'          // Enable cloud for workspace
    | 'toggleAutosave'       // Toggle autosave on/off
    | 'toggleEncryption'     // Toggle encryption
    | 'setPassphrase'        // Set encryption passphrase
    | 'refreshWorkspaces'    // Refresh remote workspaces list
    | 'expandWorkspace';     // Expand remote workspace in list
}

// ================== WALKTHROUGH EVENTS ==================

export interface WalkthroughEvent extends MatomoEventBase {
  category: 'walkthrough';
  action:
    | 'start'       // Walkthrough started
    | 'completed'   // Walkthrough completed
    | 'search';     // Walkthrough search used
}

// ================== NOTIFICATION EVENTS ==================

export interface NotificationEvent extends MatomoEventBase {
  category: 'notification';
  action:
    | 'openDropdown'     // Notification bell clicked / dropdown opened
    | 'markAsRead'       // Single notification marked as read
    | 'markAllAsRead'    // Mark all as read
    | 'dismiss'          // Notification dismissed
    | 'actionClick'      // Notification action button clicked
    | 'legacyAction';    // Legacy action URL followed
}

// ================== FEEDBACK EVENTS ==================

export interface FeedbackEvent extends MatomoEventBase {
  category: 'feedback';
  action:
    | 'openPanel'   // Feedback panel/form opened
    | 'closePanel'; // Feedback panel closed
}
