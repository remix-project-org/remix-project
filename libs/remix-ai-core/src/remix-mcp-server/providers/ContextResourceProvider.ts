/**
 * Context Resource Provider - Provides comprehensive IDE context for AI assistants
 * This resource is automatically included with every request to give AI full context
 */

import { Plugin } from '@remixproject/engine';
import { IMCPResource, IMCPResourceContent } from '../../types/mcp';
import { BaseResourceProvider } from '../registry/RemixResourceProviderRegistry';
import { ResourceCategory } from '../types/mcpResources';

export class ContextResourceProvider extends BaseResourceProvider {
  name = 'context';
  description = 'Provides comprehensive IDE context including editor state, file tree, git status, and diagnostics';

  constructor(private _plugin: Plugin) {
    super();
  }

  async getResources(_plugin: Plugin): Promise<IMCPResource[]> {
    const resources: IMCPResource[] = [];

    // Main context resource - always available
    resources.push(
      this.createResource(
        'context://workspace',
        'Workspace Context',
        'Complete IDE context including files, editor state, git status, and diagnostics',
        'application/json',
        {
          category: ResourceCategory.CONFIGURATION,
          tags: ['context', 'workspace', 'editor', 'git', 'diagnostics'],
          priority: 10 // High priority - should be included first
        }
      )
    );

    // Individual context components
    resources.push(
      this.createResource(
        'context://file-tree',
        'File Tree',
        'Project file structure and hierarchy',
        'application/json',
        {
          category: ResourceCategory.PROJECT_FILES,
          tags: ['files', 'structure', 'tree'],
          priority: 9
        }
      )
    );

    resources.push(
      this.createResource(
        'context://editor-state',
        'Editor State',
        'Current editor state including open files, cursor position, and selection',
        'application/json',
        {
          category: ResourceCategory.CONFIGURATION,
          tags: ['editor', 'cursor', 'selection', 'files'],
          priority: 9
        }
      )
    );

    resources.push(
      this.createResource(
        'context://git-status',
        'Git Status',
        'Recent git changes and current branch information',
        'application/json',
        {
          category: ResourceCategory.CONFIGURATION,
          tags: ['git', 'version-control', 'changes'],
          priority: 8
        }
      )
    );

    resources.push(
      this.createResource(
        'context://diagnostics',
        'Diagnostics',
        'LSP diagnostics, compiler errors, and warnings',
        'application/json',
        {
          category: ResourceCategory.ANALYSIS_REPORTS,
          tags: ['diagnostics', 'errors', 'warnings', 'lsp'],
          priority: 9
        }
      )
    );

    resources.push(
      this.createResource(
        'context://terminal-output',
        'Terminal Output',
        'Recent terminal output and command history',
        'application/json',
        {
          category: ResourceCategory.CONFIGURATION,
          tags: ['terminal', 'output', 'console'],
          priority: 7
        }
      )
    );

    return resources;
  }

  async getResourceContent(uri: string, _plugin: Plugin): Promise<IMCPResourceContent> {
    if (uri === 'context://workspace') {
      return this.getWorkspaceContext();
    }

    if (uri === 'context://file-tree') {
      return this.getFileTree();
    }

    if (uri === 'context://editor-state') {
      return this.getEditorState();
    }

    if (uri === 'context://git-status') {
      return this.getGitStatus();
    }

    if (uri === 'context://diagnostics') {
      return this.getDiagnostics();
    }

    if (uri === 'context://terminal-output') {
      return this.getTerminalOutput();
    }

    throw new Error(`Unsupported context URI: ${uri}`);
  }

  canHandle(uri: string): boolean {
    return uri.startsWith('context://');
  }

  /**
   * Gather comprehensive workspace context
   */
  private async getWorkspaceContext(): Promise<IMCPResourceContent> {
    try {
      const context = {
        timestamp: new Date().toISOString(),
        fileTree: await this.collectFileTree(),
        editorState: await this.collectEditorState(),
        gitStatus: await this.collectGitStatus(),
        diagnostics: await this.collectDiagnostics(),
        terminalOutput: await this.collectTerminalOutput(),
        workspace: {
          name: await this.getWorkspaceName(),
          path: await this.getWorkspacePath()
        }
      };

      console.log('Workspace context returned:', context)
      return this.createJsonContent('context://workspace', context);
    } catch (error) {
      return this.createTextContent('context://workspace', `Error gathering context: ${error.message}`);
    }
  }

  /**
   * Get file tree structure
   */
  private async getFileTree(): Promise<IMCPResourceContent> {
    try {
      const fileTree = await this.collectFileTree();
      return this.createJsonContent('context://file-tree', {
        timestamp: new Date().toISOString(),
        tree: fileTree
      });
    } catch (error) {
      return this.createTextContent('context://file-tree', `Error getting file tree: ${error.message}`);
    }
  }

  /**
   * Get current editor state
   */
  private async getEditorState(): Promise<IMCPResourceContent> {
    try {
      const editorState = await this.collectEditorState();
      return this.createJsonContent('context://editor-state', {
        timestamp: new Date().toISOString(),
        ...editorState
      });
    } catch (error) {
      return this.createTextContent('context://editor-state', `Error getting editor state: ${error.message}`);
    }
  }

  /**
   * Get git status
   */
  private async getGitStatus(): Promise<IMCPResourceContent> {
    try {
      const gitStatus = await this.collectGitStatus();
      return this.createJsonContent('context://git-status', {
        timestamp: new Date().toISOString(),
        ...gitStatus
      });
    } catch (error) {
      return this.createTextContent('context://git-status', `Error getting git status: ${error.message}`);
    }
  }

  /**
   * Get diagnostics
   */
  private async getDiagnostics(): Promise<IMCPResourceContent> {
    try {
      const diagnostics = await this.collectDiagnostics();
      return this.createJsonContent('context://diagnostics', {
        timestamp: new Date().toISOString(),
        ...diagnostics
      });
    } catch (error) {
      return this.createTextContent('context://diagnostics', `Error getting diagnostics: ${error.message}`);
    }
  }

  /**
   * Get terminal output
   */
  private async getTerminalOutput(): Promise<IMCPResourceContent> {
    try {
      const terminalOutput = await this.collectTerminalOutput();
      return this.createJsonContent('context://terminal-output', {
        timestamp: new Date().toISOString(),
        ...terminalOutput
      });
    } catch (error) {
      return this.createTextContent('context://terminal-output', `Error getting terminal output: ${error.message}`);
    }
  }

  /**
   * Collect file tree structure
   */
  private async collectFileTree(): Promise<any> {
    try {
      const tree = await this.buildTree('', 3); // Max depth of 3
      return tree;
    } catch (error) {
      console.warn('Failed to collect file tree:', error);
      return { error: error.message };
    }
  }

  /**
   * Build directory tree recursively
   */
  private async buildTree(path: string, maxDepth: number): Promise<any> {
    if (maxDepth <= 0) return { truncated: true };

    try {
      const exists = await this._plugin.call('fileManager', 'exists', path);
      if (!exists) return null;

      const isDir = await this._plugin.call('fileManager', 'isDirectory', path);

      if (isDir) {
        const files = await this._plugin.call('fileManager', 'readdir', path);
        const fileList = Array.isArray(files) ? files : Object.keys(files);

        const children = [];
        for (const file of fileList.slice(0, 50)) { // Limit to 50 items per directory
          if (!file.startsWith('.') && !file.includes('node_modules') && !file.includes('.git')) {
            const child = await this.buildTree(file, maxDepth - 1);
            if (child) children.push({ name: file.split('/').pop(), ...child });
          }
        }

        return { type: 'directory', children };
      } else {
        return { type: 'file', extension: path.split('.').pop() };
      }
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Collect editor state
   */
  private async collectEditorState(): Promise<any> {
    try {
      const state: any = {
        openFiles: [],
        currentFile: null,
        cursorPosition: null,
        selectedText: null,
      };

      try {
        const currentFile = await this._plugin.call('fileManager', 'getCurrentFile');
        state.currentFile = currentFile;

        // Get selected text from editor
        try {
          const selection = await this._plugin.call('editor', 'getSelection');
          if (selection) {
            state.selectedText = selection;
          }
        } catch (error) {
          // Selection not available
        }

        // Get cursor position (character offset)
        try {
          const cursorPosition = await this._plugin.call('editor', 'getCursorPosition');
          if (cursorPosition !== null && cursorPosition !== undefined) {
            state.cursorPosition = cursorPosition;
          }
        } catch (error) {
          // Cursor position not available
        }

        // Get cursor line number
        try {
          const lineNumber = await this._plugin.call('editor', 'getCurrentLineNumber');
          if (lineNumber !== null && lineNumber !== undefined) {
            state.lineNumber = lineNumber;
          }
        } catch (error) {
          // Line number not available
        }
      } catch (error) {
      }

      try {
        const openedFiles = await this._plugin.call('fileManager', 'getOpenedFiles');
        state.openFiles = openedFiles || [];
      } catch (error) {
        // Open files not available
      }

      return state;
    } catch (error) {
      console.warn('Failed to collect editor state:', error);
      return { error: error.message };
    }
  }

  /**
   * Collect git status
   */
  private async collectGitStatus(): Promise<any> {
    try {
      const gitStatus: any = {
        available: false,
        branch: null,
        modified: [],
        staged: [],
        untracked: []
      };

      try {
        // Try to get git status from dGitProvider
        const status = await this._plugin.call('dGitProvider', 'status', {});
        if (status) {
          gitStatus.available = true;
          gitStatus.modified = status.modified || [];
          gitStatus.staged = status.staged || [];
          gitStatus.untracked = status.not_added || [];

          // Get current branch
          try {
            const branch = await this._plugin.call('dGitProvider', 'currentbranch');
            gitStatus.branch = branch?.name || branch || null;
          } catch (error) {
            // Branch info not available
          }

          // Get recent commits (last 5)
          try {
            const log = await this._plugin.call('dGitProvider', 'log', { ref: 'HEAD' });
            if (log && Array.isArray(log)) {
              gitStatus.recentCommits = log.slice(0, 5).map((commit: any) => ({
                hash: commit.oid?.slice(0, 7),
                message: commit.commit?.message,
                author: commit.commit?.author?.name,
                date: commit.commit?.author?.timestamp
              }));
            }
          } catch (error) {
            // Log not available
          }
        }
      } catch (error) {
        // Git not available
      }

      return gitStatus;
    } catch (error) {
      console.warn('Failed to collect git status:', error);
      return { error: error.message };
    }
  }

  /**
   * Collect diagnostics (errors, warnings)
   */
  private async collectDiagnostics(): Promise<any> {
    try {
      const diagnostics: any = {
        compilation: [],
        analysis: [],
        total: 0
      };

      // Get compilation errors
      try {
        const lastCompilationResult = await this._plugin.call('solidity' as any, 'getCompilationResult')
        if (lastCompilationResult?.errors) {
          diagnostics.compilation = lastCompilationResult.errors.map((error: any) => ({
            severity: error.severity,
            type: error.type,
            message: error.message,
            formattedMessage: error.formattedMessage,
            sourceLocation: error.sourceLocation
          }));
        }
      } catch (error) {}
      diagnostics.total = diagnostics.compilation.length

      return diagnostics;
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Collect recent terminal output
   */
  private async collectTerminalOutput(): Promise<any> {
    try {
      const terminal: any = {
        recent: [],
        available: false
      };

      try {
        // Try to get terminal logs
        const logs = await this._plugin.call('terminal', 'getLogs');
        if (logs && Array.isArray(logs)) {
          terminal.available = true;
          // Get last 20 log entries
          terminal.recent = logs.slice(-20).map((log: any) => ({
            type: log.type || 'log',
            value: log.value || log.message || log,
            timestamp: log.timestamp || new Date().toISOString()
          }));
        }
      } catch (error) {
        // Terminal logs not available
      }

      return terminal;
    } catch (error) {
      console.warn('Failed to collect terminal output:', error);
      return { error: error.message };
    }
  }

  /**
   * Get workspace name
   */
  private async getWorkspaceName(): Promise<string> {
    try {
      const workspace = await this._plugin.call('filePanel', 'getCurrentWorkspace');
      return workspace?.name || 'default';
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Get workspace path
   */
  private async getWorkspacePath(): Promise<string> {
    return '/';
  }
}
