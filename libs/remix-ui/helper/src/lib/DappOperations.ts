import { DappPathHelper } from './DappPathHelper';
import { v4 as uuidv4 } from 'uuid';

/**
 * DappOperations - High-level abstraction for DApp file operations
 *
 * Handles all file I/O, config management, and workspace operations for DApps.
 * Works seamlessly in both workspace and inline modes - callers don't need
 * to check the mode or handle paths differently.
 *
 */
export class DappOperations {
  private pathHelper: DappPathHelper;
  private plugin: any;
  private workspaceName: string;
  private id: string;
  private slug: string;

  constructor(mode: 'workspace' | 'inline', workspaceName: string, plugin: any, contractName?: string) {
    this.pathHelper = new DappPathHelper(mode);
    this.workspaceName = workspaceName;
    this.plugin = plugin;

    // Generate UUID and slug based on mode
    this.id = uuidv4();
    const shortId = this.id.slice(0, 6);

    if (mode === 'inline') {
      // Inline mode: slug = inline-{contractName}-{shortId}
      const safeName = (contractName || 'dapp').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      this.slug = `inline-${safeName}-${shortId}`;
    } else {
      // Workspace mode: slug = {contractName}-{shortId}
      const safeName = (contractName || 'dapp').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      this.slug = `${safeName}-${shortId}`;
    }
  }

  /**
   * Create DappOperations instance with auto-detected mode
   * @param slugOrWorkspace Workspace name or slug (inline slugs start with 'inline-')
   * @param plugin Remix plugin instance
   */
  static from(slugOrWorkspace: string, plugin: any): DappOperations {
    const mode = DappPathHelper.isInlineSlug(slugOrWorkspace) ? 'inline' : 'workspace';
    return new DappOperations(mode, slugOrWorkspace, plugin);
  }

  /**
   * Read the DApp config file
   */
  async readConfig(): Promise<any> {
    const content = await this.plugin.call('fileManager', 'readFile', this.pathHelper.configPath);
    return JSON.parse(content);
  }

  /**
   * Write the DApp config file
   */
  async writeConfig(config: any): Promise<void> {
    await this.plugin.call('fileManager', 'writeFile', this.pathHelper.configPath, JSON.stringify(config, null, 2));
  }

  /**
   * Update specific fields in the config
   */
  async updateConfig(updates: Partial<any>): Promise<void> {
    const config = await this.readConfig();
    const updated = { ...config, ...updates };
    await this.writeConfig(updated);
  }

  /**
   * Read a file from the DApp (path relative to source root)
   * @param relativePath Path like 'src/App.jsx' or 'index.html'
   */
  async readFile(relativePath: string): Promise<string> {
    const fullPath = this.pathHelper.resolveFilePath(relativePath);
    return await this.plugin.call('fileManager', 'readFile', fullPath);
  }

  /**
   * Write a file to the DApp (path relative to source root)
   * @param relativePath Path like 'src/App.jsx' or 'index.html'
   * @param content File content
   */
  async writeFile(relativePath: string, content: string): Promise<void> {
    const fullPath = this.pathHelper.resolveFilePath(relativePath);

    // Ensure parent directories exist
    await this.ensureParentDir(fullPath);

    await this.plugin.call('fileManager', 'writeFile', fullPath, content);
  }

  /**
   * Check if a file exists
   */
  async fileExists(relativePath: string): Promise<boolean> {
    const fullPath = this.pathHelper.resolveFilePath(relativePath);
    try {
      await this.plugin.call('fileManager', 'readFile', fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read directory contents
   * @param relativePath Path relative to source root (e.g., 'src')
   */
  async readDir(relativePath: string = ''): Promise<any> {
    const fullPath = relativePath ? this.pathHelper.resolveFilePath(relativePath) : this.pathHelper.sourceRoot;
    return await this.plugin.call('fileManager', 'readdir', fullPath);
  }

  /**
   * Ensure base directory exists (for inline mode, creates /frontend)
   */
  async ensureBaseDir(): Promise<void> {
    if (this.pathHelper.targetMode === 'inline') {
      const baseDir = this.pathHelper.sourceRoot.substring(1); // Remove leading /
      try {
        await this.plugin.call('fileManager', 'mkdir', baseDir);
      } catch (e) {
        // Directory may already exist
      }
    }
    // Workspace mode: base is workspace root, always exists
  }

  /**
   * Switch to DApp workspace (no-op for inline mode)
   */
  async switchToWorkspace(): Promise<void> {
    if (this.pathHelper.targetMode === 'workspace') {
      const currentWs = await this.plugin.call('filePanel', 'getCurrentWorkspace');
      if (currentWs?.name !== this.workspaceName) {
        console.log(`[DappOperations] Switching to workspace: ${this.workspaceName}`);
        await this.plugin.call('filePanel', 'switchToWorkspace', {
          name: this.workspaceName,
          isLocalhost: false
        });
        await new Promise(r => setTimeout(r, 500));
      }
    }
    // Inline mode: no workspace switch needed
  }

  /**
   * Create a directory (path relative to source root)
   */
  async mkdir(relativePath: string): Promise<void> {
    const fullPath = this.pathHelper.resolveFilePath(relativePath);
    const dirPath = fullPath.startsWith('/') ? fullPath.substring(1) : fullPath;
    try {
      await this.plugin.call('fileManager', 'mkdir', dirPath);
    } catch (e) {
      // May already exist
    }
  }

  /**
   * Ensure parent directories exist for a file path
   */
  private async ensureParentDir(fullPath: string): Promise<void> {
    const parts = fullPath.split('/').filter(Boolean);
    if (parts.length <= 1) return; // Root level file

    // Build up directory path incrementally
    let currentPath = '';
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath += (currentPath ? '/' : '') + parts[i];
      try {
        await this.plugin.call('fileManager', 'mkdir', currentPath);
      } catch (e) {
        // Directory may already exist
      }
    }
  }

  /**
   * Get all path variations for a file (useful for existence checks)
   */
  getPathVariations(filename: string): string[] {
    return this.pathHelper.getPathVariations(filename);
  }

  /**
   * Get the entry point path for bundling
   * @param filename Entry file name (default: 'src/main.jsx')
   */
  getEntryPoint(filename: string = 'src/main.jsx'): string {
    return this.pathHelper.getEntryPoint(filename);
  }

  /**
   * Get the current mode
   */
  getMode(): 'workspace' | 'inline' {
    return this.pathHelper.targetMode;
  }

  /**
   * Get the unique UUID for this DApp
   */
  getId(): string {
    return this.id;
  }

  /**
   * Get the DApp slug (human-readable identifier)
   */
  getSlug(): string {
    return this.slug;
  }

  /**
   * Get the workspace name (actual workspace, not the slug)
   */
  getWorkspaceName(): string {
    return this.workspaceName;
  }

  /**
   * Get the source root path
   */
  getSourceRoot(): string {
    return this.pathHelper.sourceRoot;
  }

  /**
   * Get config file path
   */
  getConfigPath(): string {
    return this.pathHelper.configPath;
  }

  /**
   * Check if this is an inline mode DApp
   */
  isInline(): boolean {
    return this.pathHelper.targetMode === 'inline';
  }

  /**
   * Resolve a relative path to absolute
   */
  resolvePath(relativePath: string): string {
    return this.pathHelper.resolveFilePath(relativePath);
  }
}
