/**
 * DappPathHelper - Centralized path management for workspace and inline mode DApps
 *
 * This utility class encapsulates all path resolution logic for DApps, eliminating
 * the need for scattered conditional checks throughout the codebase.
 *
 */
export class DappPathHelper {
  readonly targetMode: 'workspace' | 'inline';
  readonly sourceRoot: '/' | '/frontend';
  readonly configPath: 'dapp.config.json' | 'frontend/dapp.config.json';
  readonly previewPath: 'preview.png' | 'frontend/preview.png';

  constructor(targetMode: 'workspace' | 'inline') {
    this.targetMode = targetMode;
    this.sourceRoot = targetMode === 'inline' ? '/frontend' : '/';
    this.configPath = targetMode === 'inline' ? 'frontend/dapp.config.json' : 'dapp.config.json';
    this.previewPath = targetMode === 'inline' ? 'frontend/preview.png' : 'preview.png';
  }

  /**
   * Create a DappPathHelper from a DappConfig object or inline mode flag
   */
  static from(config: any): DappPathHelper {
    const mode = DappPathHelper.detectMode(config);
    return new DappPathHelper(mode);
  }

  /**
   * Detect whether a DApp is in workspace or inline mode
   */
  static detectMode(config: any): 'workspace' | 'inline' {
    if (!config) return 'workspace';

    // Check explicit inlineMode flag
    if (config.inlineMode === true) return 'inline';

    // Check slug pattern (inline slugs start with 'inline-')
    if (config.slug?.startsWith('inline-')) return 'inline';

    return 'workspace';
  }

  /**
   * Check if a workspace name or slug indicates inline mode
   */
  static isInlineSlug(workspaceOrSlug: string): boolean {
    return workspaceOrSlug.startsWith('inline-');
  }

  /**
   * Resolve a relative file path to its absolute location based on mode
   * @param relativePath Path relative to source root (e.g., 'src/App.jsx', 'index.html')
   * @returns Absolute path (e.g., '/frontend/src/App.jsx' or '/src/App.jsx')
   */
  resolveFilePath(relativePath: string): string {
    // Remove all leading slashes to ensure clean concatenation
    const cleanPath = relativePath.replace(/^\/+/, '');

    // For inline mode, we need to add a separator between sourceRoot and cleanPath
    // For workspace mode, sourceRoot already ends with '/', so no separator needed
    if (this.targetMode === 'inline') {
      return `${this.sourceRoot}/${cleanPath}`;
    } else {
      return `${this.sourceRoot}${cleanPath}`;
    }
  }

  /**
   * Get all possible path variations for a file (useful for file existence checks)
   * @param filename Filename to check (e.g., 'index.html')
   * @returns Array of possible paths in order of preference
   */
  getPathVariations(filename: string): string[] {
    if (this.targetMode === 'inline') {
      return [
        `/frontend/${filename}`,
        `frontend/${filename}`,
      ];
    } else {
      return [
        `/${filename}`,
        filename,
      ];
    }
  }

  /**
   * Get the base path for esbuild/bundler (without leading slash)
   * Used by InBrowserVite
   */
  getBasePath(): string | undefined {
    return this.targetMode === 'inline' ? '/frontend' : undefined;
  }

  /**
   * Get the entry point path for bundling
   * @param filename Entry file name (default: 'src/main.jsx')
   */
  getEntryPoint(filename: string = 'src/main.jsx'): string {
    return this.resolveFilePath(filename);
  }

  /**
   * Resolve a file path for writing (prepends sourceRoot if not already present)
   * Useful for saveGeneratedFiles operations
   */
  resolveWritePath(filePath: string): string {
    // If already has the correct prefix, return as-is
    if (this.targetMode === 'inline' && filePath.startsWith('frontend/')) {
      return filePath;
    }
    if (this.targetMode === 'workspace' && !filePath.startsWith('frontend/')) {
      return filePath;
    }

    // Otherwise, apply the correct prefix
    const cleanPath = filePath.replace(/^(frontend\/|\/)/, '');
    return this.targetMode === 'inline'
      ? `frontend/${cleanPath}`
      : cleanPath;
  }
}
