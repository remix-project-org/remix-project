// InBrowserVite - Class-based esbuild builder for in-browser bundling
// Extracted from BrowserVite.tsx to provide a reusable, non-React API

export interface BuildResult {
  js: string;
  success: boolean;
  error?: string;
}

let globalInitPromise: Promise<void> | null = null;
let globalEsbuild: any = null;

export class InBrowserVite {
  private esbuild: any = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  private async ensureEsbuildLoaded(): Promise<void> {
    if ((window as any).esbuild) {
      return;
    }

    const existingScript = document.querySelector('script[src*="esbuild-wasm"]');

    if (existingScript) {
      const maxRetries = 100;
      for (let i = 0; i < maxRetries; i++) {
        if ((window as any).esbuild) {
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      console.warn('[InBrowserVite] Timeout waiting for existing script tag. Trying dynamic injection.');
    }

    return new Promise((resolve, reject) => {
      if ((window as any).esbuild) return resolve();

      const script = document.createElement('script');
      script.src = "https://unpkg.com/esbuild-wasm@0.25.12/lib/browser.min.js";
      script.async = true;
      script.onload = () => {
        if ((window as any).esbuild) {
            resolve();
        } else {
            reject(new Error('Script loaded but window.esbuild is missing'));
        }
      };
      script.onerror = () => reject(new Error('Failed to load esbuild-wasm script from CDN'));
      document.head.appendChild(script);
    });
  }

  /**
   * Initialize esbuild-wasm. This is async and should be called before build.
   * Subsequent calls return the same initialization promise.
   */
  async initialize(): Promise<void> {
    if (this.initialized && this.esbuild) {
        return;
    }

    if (globalInitPromise) {
      await globalInitPromise;
      this.esbuild = globalEsbuild;
      this.initialized = true;
      return;
    }

    globalInitPromise = (async () => {
      try {
        await this.ensureEsbuildLoaded();
        
        const esbuild = (window as any).esbuild;
        
        try {
            await esbuild.initialize({
                wasmURL: "https://unpkg.com/esbuild-wasm@0.25.12/esbuild.wasm",
                worker: true,
            });
        } catch (initErr: any) {
            if (!initErr.message.includes('initialize') && !initErr.message.includes('already')) {
                throw initErr;
            }
        }
        
        console.log('[InBrowserVite-LOG] ✅ esbuild initialized ');
        globalEsbuild = esbuild;

      } catch (err) {
        globalInitPromise = null;
        console.error(err);
        throw new Error(`esbuild initialization failed: ${err.message}`);
      }
    })();

    await globalInitPromise;
    this.esbuild = globalEsbuild;
    this.initialized = true;
  }

  /**
   * Check if esbuild is initialized and ready
   */
  isReady(): boolean {
    return this.initialized && this.esbuild !== null;
  }

  /**
   * Build the entry point with the given virtual filesystem
   * @param files Map of file paths to their contents
   * @param entry Entry point path (default: auto-detect)
   * @returns BuildResult with js output or error
   */
  async build(files: Map<string, string>, entry?: string): Promise<BuildResult> {
    if (!this.isReady()) {
      try {
        await this.initialize();
      } catch (e: any) {
        return {
          js: '',
          success: false,
          error: `Auto-initialization failed: ${e.message}`,
        };
      }
    }

    try {
      // Log available files for debugging
      console.log('[InBrowserVite] Available files:', Array.from(files.keys()));

      // Auto-detect entry point if not provided or if it's an HTML file
      let actualEntry = entry;
      if (!actualEntry || !this.isBuildableEntry(actualEntry)) {
        actualEntry = this.findEntryPoint(files);
        if (!actualEntry) {
          return {
            js: '',
            success: false,
            error: 'No valid JavaScript/TypeScript entry point found. Please provide a .js, .jsx, .ts, or .tsx file.',
          };
        }
      }

      console.log('[InBrowserVite] Using entry point:', actualEntry);

      const plugin = this.makePlugin(files);
      const result = await this.esbuild.build({
        entryPoints: [actualEntry],
        bundle: true,
        write: false,
        format: 'esm',
        plugins: [plugin],
        define: { 'process.env.NODE_ENV': '"production"' },
        loader: {
          '.js': 'jsx',
          '.jsx': 'jsx',
          '.ts': 'tsx',
          '.tsx': 'tsx',
          '.json': 'json',
        },
      });

      const js = result.outputFiles[0].text;
      return {
        js,
        success: true,
      };
    } catch (err) {
      return {
        js: '',
        success: false,
        error: err.message || err.toString(),
      };
    }
  }

  /**
   * Find a valid entry point from the files map
   */
  private findEntryPoint(files: Map<string, string>): string | null {
    // Common entry point patterns in order of preference
    const patterns = [
      '/src/main.jsx',
      '/src/main.js',
      '/src/index.jsx',
      '/src/index.js',
      '/main.jsx',
      '/main.js',
      '/index.jsx',
      '/index.js',
      '/src/App.jsx',
      '/src/App.js',
      '/App.jsx',
      '/App.js',
    ];

    // Check common patterns first
    for (const pattern of patterns) {
      if (files.has(pattern)) {
        return pattern;
      }
    }

    // Find any buildable file
    for (const [path] of files) {
      if (this.isBuildableEntry(path)) {
        return path;
      }
    }

    return null;
  }

  /**
   * Create esbuild plugin that resolves bare imports to esm.sh and loads files from in-memory map
   */
  private makePlugin(map: Map<string, string>) {
    return {
      name: 'virtual-fs-and-cdn',
      setup: (build: any) => {
        // resolve absolute paths (starting with /)
        build.onResolve({ filter: /^\/.*/ }, (args: any) => {
          return { path: args.path, namespace: 'local' };
        });

        // resolve relative paths (starting with ./ or ../)
        build.onResolve({ filter: /^\.\.?\/.*/ }, (args: any) => {
          // Resolve relative to the importer
          const importerDir = args.importer ? args.importer.substring(0, args.importer.lastIndexOf('/')) : '';
          let resolvedPath = this.resolvePath(importerDir, args.path);
          return { path: resolvedPath, namespace: 'local' };
        });

        // resolve bare specifiers (like react, app.jsx)
        build.onResolve({ filter: /^[^./].*/ }, (args: any) => {
          // if it's an absolute URL, set namespace to external
          if (args.path.startsWith('http')) {
            return { path: args.path, namespace: 'external' };
          }

          // Check if this bare specifier exists as a local file
          // Try common locations (with and without leading slash)
          const possiblePaths = [
            args.path,                    // bare: app.jsx
            `/${args.path}`,              // absolute: /app.jsx
            `/src/${args.path}`,          // src directory: /src/app.jsx
            `src/${args.path}`,           // src directory (no leading slash)
            args.importer ? `${args.importer.substring(0, args.importer.lastIndexOf('/'))}/${args.path}` : null,
          ].filter(Boolean);

          for (const testPath of possiblePaths) {
            if (map.has(testPath)) {
              // Normalize to absolute path with leading slash
              const normalizedPath = testPath.startsWith('/') ? testPath : `/${testPath}`;
              console.log(`[InBrowserVite] Resolved '${args.path}' to local file '${normalizedPath}'`);
              return { path: normalizedPath, namespace: 'local' };
            }
          }

          const cdnPath = `https://esm.sh/${args.path}`;
          
          return { path: cdnPath, external: true };
        });

        build.onLoad({ filter: /\.css$/, namespace: 'local' }, async (args: any) => {
          
          const pathsToTry = [
            args.path,
            args.path.startsWith('/') ? args.path.substring(1) : `/${args.path}`,
          ];

          for (const testPath of pathsToTry) {
            if (map.has(testPath)) {
              const cssContent = map.get(testPath);
              const escapedCss = JSON.stringify(cssContent);
              
              const jsContent = `
                try {
                  const css = ${escapedCss};
                  if (typeof css === 'string' && css.trim().length > 0) {
                    const style = document.createElement('style');
                    style.type = 'text/css';
                    style.appendChild(document.createTextNode(css));
                    document.head.appendChild(style);
                  }
                } catch (e) {
                  console.error('Failed to inject CSS for ${args.path}', e);
                }
              `;
              
              return { contents: jsContent, loader: 'js' }; 
            }
          }
          return { contents: `throw new Error('File not found: ${args.path}')`, loader: 'js' };
        });

        // load local files
        build.onLoad({ filter: /.*/, namespace: 'local' }, async (args: any) => {
          if (args.path.endsWith('.css')) return;

          const pathsToTry = [
            args.path,
            args.path.startsWith('/') ? args.path.substring(1) : `/${args.path}`,
          ];

          for (const testPath of pathsToTry) {
            if (map.has(testPath)) {
              const contents = map.get(testPath);
              const loader = this.guessLoader(args.path);
              return { contents, loader };
            }
          }

          return { contents: `throw new Error('File not found in virtual filesystem: ${args.path}')`, loader: 'js' };
        });

      }
    };
  }

  /**
   * Resolve a relative path against a base directory
   */
  private resolvePath(base: string, relative: string): string {
    // Normalize base to always be a directory path
    if (!base) base = '/';
    if (!base.startsWith('/')) base = '/' + base;
    if (!base.endsWith('/')) base = base + '/';

    // Handle different relative patterns
    const parts = base.split('/').filter(Boolean);
    const relativeParts = relative.split('/');

    for (const part of relativeParts) {
      if (part === '..') {
        parts.pop();
      } else if (part !== '.') {
        parts.push(part);
      }
    }

    return '/' + parts.join('/');
  }

  /**
   * Guess the appropriate esbuild loader based on file extension
   */
  private guessLoader(path: string): string {
    if (path.endsWith('.ts')) return 'ts';
    if (path.endsWith('.tsx')) return 'tsx';
    if (path.endsWith('.jsx')) return 'jsx';
    if (path.endsWith('.css')) return 'js';
    if (path.endsWith('.json')) return 'json';
    if (path.endsWith('.html')) return 'text'; // HTML files as text, not code
    // Default to 'jsx' for .js, .mjs and other files to support JSX syntax
    return 'jsx';
  }

  /**
   * Check if a file path is a buildable entry point
   */
  private isBuildableEntry(path: string): boolean {
    const ext = path.toLowerCase();
    return ext.endsWith('.js') ||
           ext.endsWith('.jsx') ||
           ext.endsWith('.ts') ||
           ext.endsWith('.tsx') ||
           ext.endsWith('.mjs');
  }
}
