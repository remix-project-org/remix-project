/**
 * [Type Definition]
 * Represents a single library file (.d.ts) to be added to the Monaco editor.
 * filePath: The virtual path (e.g., 'file:///node_modules/...')
 * content: The actual text content of the .d.ts file.
 */
type Library = { filePath: string; content: string }

/**
 * [Type Definition]
 * Defines the minimum required fields from a package.json for type loading.
 */
type PackageJson = {
  name?: string
  version?: string
  types?: string
  typings?: string
  exports?: string | Record<string, any>
}

type ResolveResult = { finalUrl: string; content: string }

/**
 * [Type Definition]
 * A cache map used to prevent duplicate network requests.
 * Key: The Request URL.
 * Value: The Promise of the request result. This allows concurrent requests
 * for the same URL to share the same Promise (Deduplication).
 */
type FetchCache = Map<string, Promise<string | null>>

const CDN_BASE = 'https://cdn.jsdelivr.net/npm/'
const VIRTUAL_BASE = 'file:///node_modules/'

// Regex to find import/export/require statements.
// Note: Currently optimized for single lines. Use [\s\S]*? if multi-line support is needed.
const IMPORT_ANY_RE = /(?:import|export)\s+[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g

// Regex to find triple-slash directives like /// <reference path="..." />
const TRIPLE_SLASH_REF_RE = /\/\/\/\s*<reference\s+path=["']([^"']+)["']\s*\/>/g

// Checks if a path is relative ('./', '../', '/').
function isRelative(p: string): boolean {
  return p.startsWith('./') || p.startsWith('../') || p.startsWith('/')
}

// Extracts the base package name (e.g., 'viem/chains' -> 'viem', '@scope/pkg/sub' -> '@scope/pkg').
function normalizeBareSpecifier(p: string): string {
  if (!p) return p
  if (p.startsWith('@')) return p.split('/').slice(0, 2).join('/')
  return p.split('/')[0]
}

// Generates the @types scoped name (includes logic to prevent infinite recursion).
// e.g., 'react' -> '@types/react', '@scope/pkg' -> '@types/scope__pkg'
function toTypesScopedName(pkg: string): string {
  if (pkg.startsWith('@types/')) return pkg
  if (pkg.startsWith('@')) return '@types/' + pkg.slice(1).replace('/', '__')
  return '@types/' + pkg
}

// Converts a CDN URL to a virtual file system path used by the Monaco editor.
function toVirtual(url: string): string {
  return url.replace(CDN_BASE, VIRTUAL_BASE)
}

// Removes file extensions (.d.ts, .ts, .js) from a URL.
function stripJsLike(url: string): string {
  return url.replace(/\.d\.[mc]?ts$/, '').replace(/\.[mc]?ts$/, '').replace(/\.[mc]?js$/, '')
}

// Utility function to fetch JSON data.
async function fetchJson<T = any>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json()
}

/**
 * Guesses a list of potential TypeScript Definition file (.d.ts) paths from a given JS-like file path.
 * e.g., 'index.js' -> ['index.d.ts', 'index.ts', 'index/index.d.ts', 'index/index.ts']
 */
function guessDtsFromJs(jsPath: string): string[] {
  const base = stripJsLike(jsPath)
  return [`${base}.d.ts`, `${base}.ts`, `${base}/index.d.ts`, `${base}/index.ts`]
}

/**
 * Parses 'exports', 'types', or 'typings' fields in package.json to map subpaths
 * to their corresponding entry point URLs.
 */
function buildExportTypeMap(pkgName: string, pkgJson: PackageJson): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  const base = `${CDN_BASE}${pkgName}/`

  // Helper: Validates the path and adds it to the map.
  const push = (subpath: string, relPath: string | undefined) => {

    if (typeof relPath !== 'string' || !relPath) {
      console.warn(`[DIAG-PUSH-ERROR] Invalid path pushed for subpath '${subpath}' in package '${pkgName}'. Type: ${typeof relPath}, Value: ${relPath}`)
      return
    }

    try {
      new URL(relPath, base)
    } catch (e) {
      console.warn(`[DIAG-PUSH-SKIP] Invalid relative path skipped: ${relPath}`)
      return
    }

    if (/\.d\.[mc]?ts$/.test(relPath)) {
      // If it's already a declaration file, use as is.
      map[subpath] = [new URL(relPath, base).href]
    } else {
      // If it's a JS file, guess the .d.ts location.
      map[subpath] = guessDtsFromJs(relPath).map(a => new URL(a, base).href)
    }
  }

  if (pkgJson.exports) {
    const exports = pkgJson.exports as Record<string, any>

    if (exports.types) {
      push('.', exports.types)
      return map
    }

    if (typeof exports === 'object') {
      for (const [subpath, condition] of Object.entries(exports)) {
        if (typeof condition === 'object' && condition !== null) {
          if (condition.types) {
            push(subpath, condition.types)
          } else {
            let fallbackPath = condition.import || condition.default

            if (typeof fallbackPath === 'object' && fallbackPath !== null) {
              if (typeof fallbackPath.default === 'string') {
                fallbackPath = fallbackPath.default
              } else {
                fallbackPath = undefined
              }
            }

            push(subpath, fallbackPath)
          }
        } else if (typeof condition === 'string') {
          push(subpath, condition)
        }
      }
    }
  }

  // Fallback to 'types' or 'typings' if 'exports' didn't yield results.
  if (Object.keys(map).length === 0) {
    if (pkgJson.types || pkgJson.typings) {
      const entryPath = pkgJson.types || pkgJson.typings
      if (typeof entryPath === 'string') {
        push('.', entryPath)
      }
    }

    if (Object.keys(map).length === 0) {
      // Final fallback: assume index.d.ts at root.
      push('.', 'index.d.ts')
    }
  }

  return map
}

/**
 * [Core Logic]
 * Iterates through a list of candidate URLs to fetch file content.
 * - Uses 'fetchCache' to prevent duplicate network requests.
 * - If a request is already in progress, it reuses the existing Promise.
 * - Returns the content of the first successful (200 OK) request.
 */
async function tryFetchOne(urls: string[], fetchCache: FetchCache): Promise<ResolveResult | null> {
  const uniqueUrls = [...new Set(urls)]

  for (const u of uniqueUrls) {
    let fetchPromise = fetchCache.get(u)

    // If not in cache, start a new request
    if (!fetchPromise) {
      fetchPromise = (async () => {
        try {
          const res = await fetch(u)
          if (res.ok) return await res.text()
          return null
        } catch (e) {
          return null
        }
      })();
      // Store the Promise itself in the cache to handle race conditions
      fetchCache.set(u, fetchPromise)
    }

    // Wait for the result (reuses existing promise if available)
    const content = await fetchPromise
    if (content !== null) {
      return { finalUrl: u, content }
    }
  }
  return null
}

/**
 * [Recursive Crawler]
 * Parses the content of a type definition file (.d.ts) to find imports/exports and references,
 * then recursively loads them.
 * - Uses 'visited' set to prevent circular dependency loops.
 * - Passes 'fetchCache' down to all recursive calls to optimize network usage.
 */
async function crawl(
  entryUrl: string,
  pkgName: string,
  visited: Set<string>,
  fetchCache: FetchCache,
  enqueuePackage: (name: string) => void
): Promise<Library[]> {
  if (visited.has(entryUrl)) return []
  visited.add(entryUrl)

  const out: Library[] = []
  try {
    // If it's strictly a .d.ts, use it. Otherwise, guess the path.
    const urlsToTry = /\.d\.[mc]?ts$/.test(entryUrl)
      ? [entryUrl]
      : guessDtsFromJs(entryUrl)

    // Fetch content using cache
    const res = await tryFetchOne(urlsToTry, fetchCache)
    if (!res) return []

    const { finalUrl, content } = res
    out.push({ filePath: toVirtual(finalUrl), content })

    const subPromises: Promise<Library[]>[] = []

    const crawlNext = (nextUrl: string) => {
      // Recurse only if not visited
      if (!visited.has(nextUrl)) subPromises.push(crawl(nextUrl, pkgName, visited, fetchCache, enqueuePackage))
    }

    // 1. Parse Triple-slash references (/// <reference path="..." />)
    for (const m of content.matchAll(TRIPLE_SLASH_REF_RE)) crawlNext(new URL(m[1], finalUrl).href)

    // 2. Parse Import/Export/Require statements
    for (const m of content.matchAll(IMPORT_ANY_RE)) {
      const spec = (m[1] || m[2] || m[3] || '').trim()
      if (!spec) continue
      if (isRelative(spec)) crawlNext(new URL(spec, finalUrl).href) // Continue crawling relative paths
      else {
        // Enqueue external packages to be handled separately in loadPackage
        const bare = normalizeBareSpecifier(spec)
        if (bare && !bare.startsWith('node:')) enqueuePackage(bare)
      }
    }
    const results = await Promise.all(subPromises)
    results.forEach(arr => out.push(...arr))
  } catch (e) {}
  return out
}

/**
 * [Main Entry Point]
 * The main function called by the Editor.
 * Loads type definitions for a specific package and all its dependencies.
 */
export async function startTypeLoadingProcess(packageName: string): Promise<{ mainVirtualPath: string; libs: Library[]; subpathMap: Record<string, string> } | void> {
  const visitedPackages = new Set<string>()
  const collected: Library[] = []
  const subpathMap: Record<string, string> = {}

  // Create a shared request cache for the entire process duration (prevents duplicate 404/200 requests)
  const fetchCache: FetchCache = new Map()

  // Inner function: Loads a single package and its dependencies
  async function loadPackage(pkgNameToLoad: string) {
    if (visitedPackages.has(pkgNameToLoad)) return
    visitedPackages.add(pkgNameToLoad)

    let pkgJson: PackageJson
    let attemptedTypesFallback = false

    // Loop to handle the @types fallback strategy
    while (true) { // eslint-disable-line no-constant-condition
      let currentPkgName = pkgNameToLoad

      // If the main package failed, try the @types scoped name
      if (attemptedTypesFallback) {
        currentPkgName = toTypesScopedName(pkgNameToLoad)
      }

      try {
        const pkgJsonUrl = new URL('package.json', `${CDN_BASE}${currentPkgName}/`).href
        pkgJson = await fetchJson<PackageJson>(pkgJsonUrl)

        const exportMap = buildExportTypeMap(currentPkgName, pkgJson)

        // If no types found, attempt fallback to @types
        if (Object.keys(exportMap).length === 0) {
          if (!attemptedTypesFallback) {
            attemptedTypesFallback = true
            continue
          } else {
            return // Give up if @types also fails
          }
        }

        const pendingDependencies = new Set<string>()
        const enqueuePackage = (p: string) => { if (!visitedPackages.has(p)) pendingDependencies.add(p) }

        const crawlPromises: Promise<Library[]>[] = []
        for (const [subpath, urls] of Object.entries(exportMap)) {
          const entryPointUrl = urls[0]
          if (entryPointUrl) {
            const pkgNameWithoutVersion = currentPkgName.replace(/@[\^~]?[\d.\w-]+$/, '')
            const virtualPathKey = subpath === '.' ? pkgNameWithoutVersion : `${pkgNameWithoutVersion}/${subpath.replace('./', '')}`

            subpathMap[virtualPathKey] = entryPointUrl.replace(CDN_BASE, '')
            // Start crawling (passing fetchCache)
            crawlPromises.push(crawl(entryPointUrl, currentPkgName, new Set<string>(), fetchCache, enqueuePackage))
          }
        }

        const libsArrays = await Promise.all(crawlPromises)
        let totalCollectedFiles = 0
        libsArrays.forEach(libs => {
          collected.push(...libs)
          totalCollectedFiles += libs.length
        })

        // If package.json exists but no .d.ts files were found, try @types fallback
        if (totalCollectedFiles === 0 && !attemptedTypesFallback) {
          attemptedTypesFallback = true
          continue
        }

        // Load discovered dependencies
        if (pendingDependencies.size > 0) {
          await Promise.all(Array.from(pendingDependencies).map(loadPackage))
        }

        return

      } catch (e) {
        // If 404 occurs, try @types fallback
        if (e && e.message && e.message.includes('404') && !attemptedTypesFallback) {
          attemptedTypesFallback = true
          continue
        }
        console.error(`- Fatal error or already tried @types for '${currentPkgName}':`, e.message)
        return
      }
    }
  }

  await loadPackage(packageName)

  const mainVirtualPath = subpathMap[packageName] ? `${VIRTUAL_BASE}${subpathMap[packageName]}` : ''
  const finalPackages = [...new Set(collected.map(lib => normalizeBareSpecifier(lib.filePath.replace(VIRTUAL_BASE, ''))))]

  return { mainVirtualPath, libs: collected, subpathMap }
}