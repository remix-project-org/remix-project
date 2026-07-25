import { Plugin } from '@remixproject/engine'
import { IMCPToolResult } from '../../types/mcp'
import { setQuickDappDocsContext } from '../../helpers/quickDappDocsContext'
import { BaseToolHandler } from '../registry/RemixToolRegistry'

export const DAPP_DOCS_FILENAME = 'dapp-docs.md'

const MAX_FILE_CHARS = 7000
const MAX_TOTAL_CHARS = 36000
const MAX_DAPP_FILES = 18
const MAX_COVERAGE_FUNCTIONS = 40

const SKIP_DIRS = new Set(['.deploys', '.git', '.states', 'build', 'dist', 'node_modules'])
const SKIP_FILES = new Set([DAPP_DOCS_FILENAME, 'docs.md', 'preview.png', 'screenshot.png', 'package-lock.json', 'yarn.lock'])
const TEXT_EXTENSIONS = new Set([
  '.css',
  '.gql',
  '.graphql',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.sol',
  '.subgraph',
  '.ts',
  '.tsx'
])

const SENSITIVE_KEY = /(api[_-]?key|access[_-]?token|auth[_-]?token|authorization|bearer|client[_-]?secret|mnemonic|password|private[_-]?key|refresh[_-]?token|secret|seed)/i
const SENSITIVE_FILE = /(^|\/)(\.env|\.npmrc|\.yarnrc)|credential|mnemonic|password|private[_-]?key|secret/i

interface DocsFile {
  workspace: string
  path: string
  role: string
  content: string
}

interface GenerateDAppDocsArgs {
  workspaceName: string
  targetFilename?: string
  confirmOverwrite?: boolean
}

const normalizePath = (path: string): string => path.replace(/\\/g, '/').replace(/^\/+/, '')

const fileNameOf = (path: string): string => normalizePath(path).split('/').pop() || ''

const extensionOf = (path: string): string => {
  const name = fileNameOf(path)
  const dotIndex = name.lastIndexOf('.')
  return dotIndex >= 0 ? name.slice(dotIndex).toLowerCase() : ''
}

const formatTimestamp = (timestamp?: number): string => {
  if (!timestamp) return 'Not available'
  return new Date(timestamp).toLocaleString()
}

const getDappMode = (config: any): 'workspace' | 'inline' => {
  if (config?.mode === 'inline' || config?.inlineMode === true || config?.slug?.startsWith('inline-')) return 'inline'
  return 'workspace'
}

const getDappSourceRoot = (config: any): '/' | '/frontend' => getDappMode(config) === 'inline' ? '/frontend' : '/'

const getGraphSources = (config: any): any[] => Array.isArray(config?.dataSources?.theGraph) ? config.dataSources.theGraph : []

const getAppKindLabel = (config: any): string => {
  const hasGraph = getGraphSources(config).length > 0
  if (config?.appKind === 'graph-only') return 'Graph-only DApp'
  if (hasGraph) return 'Contract + The Graph'
  return 'Contract DApp'
}

const redactUrlSecrets = (value?: string): string | undefined => {
  if (!value) return value

  try {
    const url = new URL(value)
    url.searchParams.forEach((_paramValue, key) => {
      if (SENSITIVE_KEY.test(key)) url.searchParams.set(key, 'REDACTED')
    })
    return url.toString()
  } catch {
    return value.replace(/([?&][^=]*(?:api[_-]?key|token|secret|auth|authorization)[^=]*=)[^&\s'"]+/gi, '$1REDACTED')
  }
}

const shouldReadTextFile = (path: string): boolean => {
  const normalized = normalizePath(path)
  const name = fileNameOf(normalized)
  if (!name || SKIP_FILES.has(name)) return false
  if (name.startsWith('.env')) return false
  if (SENSITIVE_FILE.test(normalized)) return false
  return TEXT_EXTENSIONS.has(extensionOf(normalized))
}

const shouldSkipDir = (path: string): boolean => {
  const parts = normalizePath(path).split('/')
  return parts.some(part => SKIP_DIRS.has(part) || part.startsWith('.env') || SENSITIVE_FILE.test(part))
}

const limitText = (value: string, max = MAX_FILE_CHARS): string => {
  if (value.length <= max) return value
  const marker = '\n... [truncated]'
  if (max <= marker.length) return value.slice(0, max)
  return `${value.slice(0, max - marker.length).trimEnd()}${marker}`
}

const redactSensitiveText = (value: string): string => {
  return value
    .replace(/data:image\/[a-zA-Z+.-]+;base64,[A-Za-z0-9+/=]+/g, '[image data omitted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer REDACTED')
    .replace(/\b0x[a-fA-F0-9]{64}\b/g, 'REDACTED_PRIVATE_VALUE')
    .replace(/([A-Za-z0-9_.-]*(?:api[_-]?key|access[_-]?token|auth[_-]?token|authorization|client[_-]?secret|mnemonic|password|private[_-]?key|refresh[_-]?token|secret|seed)[A-Za-z0-9_.-]*\s*[:=]\s*)(["'`]?)[^\n"',;`]+/gi, '$1$2REDACTED')
    .replace(/([?&][^=]*(?:api[_-]?key|token|secret|auth|authorization)[^=]*=)[^&\s'"]+/gi, '$1REDACTED')
}

const sanitizeJson = (value: any, key = ''): any => {
  if (SENSITIVE_KEY.test(key)) return 'REDACTED'
  if (key === 'logo' || key === 'thumbnailPath') return value ? '[image data omitted]' : value

  if (Array.isArray(value)) {
    const limited = value.slice(0, 40).map(item => sanitizeJson(item))
    if (value.length > limited.length) limited.push(`[${value.length - limited.length} more items omitted]`)
    return limited
  }

  if (value && typeof value === 'object') {
    return Object.keys(value).reduce((acc: Record<string, any>, childKey) => {
      acc[childKey] = sanitizeJson(value[childKey], childKey)
      return acc
    }, {})
  }

  if (typeof value === 'string') {
    return limitText(redactSensitiveText(redactUrlSecrets(value) || value), 3000)
  }

  return value
}

const safeFileContent = (content: string): string => limitText(redactSensitiveText(content))

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const hasContractFunctionCall = (content: string, functionName: string): boolean => {
  const name = escapeRegExp(functionName)
  return [
    new RegExp(`\\.\\s*${name}\\s*\\(`),
    new RegExp(`\\[\\s*['"\`]${name}['"\`]\\s*\\]\\s*\\(`),
    new RegExp(`(?:functionName\\s*:|getFunction\\s*\\()\\s*['"\`]${name}['"\`]`)
  ].some(pattern => pattern.test(content))
}

const buildContractCoverageEvidence = (config: any, files: DocsFile[]): string => {
  const abi = Array.isArray(config?.contract?.abi) ? config.contract.abi : []
  const functions = abi
    .filter((item: any) => item?.type === 'function' && typeof item.name === 'string' && item.name)
    .slice(0, MAX_COVERAGE_FUNCTIONS)

  if (!functions.length) {
    return 'No contract ABI functions are available. Contract coverage is not applicable.'
  }

  const frontendFiles = files.filter(file =>
    file.role === 'DApp frontend file' && ['.html', '.js', '.jsx', '.ts', '.tsx'].includes(extensionOf(file.path))
  )

  const lines = [
    'Static source reference scan only; this does not verify runtime behavior or transaction success.'
  ]

  for (const item of functions) {
    const inputs = Array.isArray(item.inputs) ? item.inputs : []
    const signature = `${item.name}(${inputs.map((input: any) => input.type || 'unknown').join(',')})`
    const references = frontendFiles
      .filter(file => hasContractFunctionCall(file.content, item.name))
      .map(file => file.path)

    lines.push(
      `- ${signature} [${item.stateMutability || 'unknown'}]: ${references.length
        ? `frontend call reference found in ${references.join(', ')}`
        : 'no frontend call reference found'}`
    )
  }

  if (abi.filter((item: any) => item?.type === 'function').length > functions.length) {
    lines.push(`- Additional ABI functions omitted after the first ${MAX_COVERAGE_FUNCTIONS}.`)
  }

  return lines.join('\n')
}

const readWorkspaceFile = async (plugin: Plugin, workspaceName: string, filePath: string): Promise<string | null> => {
  try {
    const normalized = normalizePath(filePath)
    const exists = await plugin.call('filePanel' as any, 'existsInWorkspace', workspaceName, normalized)
    if (!exists) return null
    const content = await plugin.call('filePanel' as any, 'readFileFromWorkspace', workspaceName, normalized)
    return typeof content === 'string' ? content : String(content || '')
  } catch {
    return null
  }
}

const switchToWorkspaceIfNeeded = async (plugin: Plugin, workspaceName: string): Promise<void> => {
  const currentWs = await plugin.call('filePanel' as any, 'getCurrentWorkspace')
  if (currentWs?.name === workspaceName) return
  await plugin.call('filePanel' as any, 'switchToWorkspace', {
    name: workspaceName,
    isLocalhost: false
  })
  await new Promise(resolve => setTimeout(resolve, 200))
}

const addFile = (files: DocsFile[], seen: Set<string>, file: DocsFile): void => {
  const key = `${file.workspace}:${file.path}`
  if (seen.has(key)) return
  seen.add(key)
  files.push(file)
}

const readConfig = async (plugin: Plugin, workspaceName: string): Promise<{ config: any, configPath: string } | null> => {
  const configCandidates = ['dapp.config.json', 'frontend/dapp.config.json']
  for (const configPath of configCandidates) {
    const rawConfig = await readWorkspaceFile(plugin, workspaceName, configPath)
    if (!rawConfig) continue
    try {
      return { config: JSON.parse(rawConfig), configPath }
    } catch {
      continue
    }
  }
  return null
}

const readConfigFile = async (plugin: Plugin, workspaceName: string, configPath: string, files: DocsFile[], seen: Set<string>): Promise<void> => {
  const rawConfig = await readWorkspaceFile(plugin, workspaceName, configPath)
  if (!rawConfig) return

  let content = rawConfig
  try {
    content = limitText(JSON.stringify(sanitizeJson(JSON.parse(rawConfig)), null, 2))
  } catch {
    content = safeFileContent(rawConfig)
  }

  addFile(files, seen, {
    workspace: workspaceName,
    path: configPath,
    role: 'DApp config',
    content
  })
}

const readContractFile = async (plugin: Plugin, config: any, files: DocsFile[], seen: Set<string>): Promise<void> => {
  const sourceWorkspace = config?.sourceWorkspace?.name
  const sourcePath = config?.sourceWorkspace?.filePath
  if (!sourceWorkspace || !sourcePath) return

  const normalizedPath = normalizePath(sourcePath).replace(new RegExp(`^${sourceWorkspace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`), '')
  const content = await readWorkspaceFile(plugin, sourceWorkspace, normalizedPath)
  if (!content) return

  addFile(files, seen, {
    workspace: sourceWorkspace,
    path: normalizedPath,
    role: 'Contract source file',
    content: safeFileContent(content)
  })
}

const readGraphFiles = async (plugin: Plugin, workspaceName: string, config: any, files: DocsFile[], seen: Set<string>): Promise<void> => {
  const workspaces = [config?.sourceWorkspace?.name, workspaceName].filter(Boolean) as string[]

  for (const source of getGraphSources(config)) {
    if (!source.filePath) continue
    const filePath = normalizePath(source.filePath)

    for (const candidateWorkspace of workspaces) {
      const content = await readWorkspaceFile(plugin, candidateWorkspace, filePath).catch(() => null)
      if (!content) continue

      addFile(files, seen, {
        workspace: candidateWorkspace,
        path: filePath,
        role: 'The Graph query file',
        content: safeFileContent(content)
      })
      break
    }
  }
}

const readDappWorkspaceFiles = async (plugin: Plugin, workspaceName: string, config: any, files: DocsFile[], seen: Set<string>): Promise<void> => {
  const rootPath = getDappSourceRoot(config)
  const candidatePaths: string[] = []

  const collect = async (currentPath: string): Promise<void> => {
    let entries: Record<string, any>
    try {
      entries = await plugin.call('fileManager' as any, 'readdir', currentPath)
    } catch {
      return
    }

    for (const [entryPath, entryData] of Object.entries(entries || {})) {
      const normalized = normalizePath(entryPath)
      if (shouldSkipDir(normalized)) continue

      if ((entryData as any)?.isDirectory) {
        await collect(entryPath)
        continue
      }

      if (!shouldReadTextFile(normalized) || fileNameOf(normalized) === 'dapp.config.json') continue
      candidatePaths.push(entryPath)
    }
  }

  await collect(rootPath)

  const priority = (path: string): number => {
    const relativePath = normalizePath(path).replace(/^frontend\//, '')
    if (relativePath === 'index.html') return 0
    if (/^src\/main\.(js|jsx|ts|tsx)$/.test(relativePath)) return 1
    if (/^src\/App\.(js|jsx|ts|tsx)$/.test(relativePath)) return 2
    if (relativePath === 'package.json' || /^vite\.config\./.test(relativePath)) return 3
    if (/^src\/(hooks|services|utils|lib)\//.test(relativePath)) return 4
    if (/^src\/(pages|views|components)\//.test(relativePath)) return 5
    if (extensionOf(relativePath) === '.css') return 7
    return 6
  }

  candidatePaths.sort((a, b) => priority(a) - priority(b) || normalizePath(a).localeCompare(normalizePath(b)))

  for (const filePath of candidatePaths) {
    if (files.length >= MAX_DAPP_FILES) break
    try {
      const rawContent = await plugin.call('fileManager' as any, 'readFile', filePath)
      addFile(files, seen, {
        workspace: workspaceName,
        path: normalizePath(filePath),
        role: 'DApp frontend file',
        content: safeFileContent(String(rawContent || ''))
      })
    } catch { /* skip unreadable files */ }
  }
}

const buildDappContextText = (workspaceName: string, config: any): string => {
  const graphSources = getGraphSources(config)
  const baseConfig = config?.baseAppConfig
  const lines = [
    `DApp title: ${config?.title || config?.name || 'Untitled DApp'}`,
    `Description: ${config?.details || 'Not configured'}`,
    `Slug: ${config?.slug || 'Not configured'}`,
    `Status: ${config?.status || 'Not configured'}`,
    `App kind: ${getAppKindLabel(config)}`,
    `Mode: ${getDappMode(config)}`,
    `Source root: ${getDappSourceRoot(config)}`,
    `Workspace: ${workspaceName}`,
    `Source workspace: ${config?.sourceWorkspace?.name || 'Not configured'}`,
    `Contract source path: ${config?.sourceWorkspace?.filePath || 'Not configured'}`,
    `Contract name: ${config?.contract?.name || 'Not configured'}`,
    `Contract address: ${config?.contract?.address || 'Not configured'}`,
    `Network: ${config?.contract?.networkName || 'Not configured'}`,
    `Chain ID: ${config?.contract?.chainId ?? 'Not configured'}`,
    `Base mini app: ${config?.isBaseMiniApp ? 'enabled' : 'not enabled'}`,
    `Base app ID meta: ${baseConfig?.appIdMeta || 'Not configured'}`,
    `The Graph sources: ${graphSources.length}`,
    `IPFS CID: ${config?.deployment?.ipfsCid || 'Not deployed'}`,
    `Gateway URL: ${config?.deployment?.gatewayUrl || 'Not deployed'}`,
    `ENS domain: ${config?.deployment?.ensDomain || 'Not configured'}`,
    `Created at: ${formatTimestamp(config?.createdAt)}`,
    `Updated at: ${formatTimestamp(config?.updatedAt)}`,
    `Last deployed at: ${formatTimestamp(config?.lastDeployedAt)}`
  ]

  graphSources.forEach((source, index) => {
    lines.push(
      ``,
      `The Graph source ${index + 1}:`,
      `- Source: ${source.source}`,
      `- File path: ${source.filePath || 'Not configured'}`,
      `- Endpoint kind: ${source.endpointKind || 'Not configured'}`,
      `- Endpoint: ${redactUrlSecrets(source.endpoint) || 'Not configured'}`,
      `- Network: ${source.network || 'Not configured'}`,
      `- Subgraph ID: ${source.subgraphId || 'Not configured'}`,
      `- API key source: ${source.apiKeySource || 'Not configured'}`,
      `- Operation: ${source.operationName || 'Not configured'} (${source.operationType || 'query'})`,
      `- Query:\n${limitText(source.query || 'Not configured')}`
    )
  })

  return lines.join('\n')
}

const buildDocsContext = async (plugin: Plugin, workspaceName: string, config: any, configPath: string): Promise<string> => {
  const files: DocsFile[] = []
  const seen = new Set<string>()

  await readConfigFile(plugin, workspaceName, configPath, files, seen)
  await readContractFile(plugin, config, files, seen)
  await readGraphFiles(plugin, workspaceName, config, files, seen)
  await readDappWorkspaceFiles(plugin, workspaceName, config, files, seen)

  const coverageEvidence = buildContractCoverageEvidence(config, files)

  let contextText = [
    '## DApp metadata',
    buildDappContextText(workspaceName, config),
    '',
    '## Contract coverage evidence',
    coverageEvidence,
    '',
    '## Source files read for documentation'
  ].join('\n')

  contextText = limitText(contextText, MAX_TOTAL_CHARS)

  for (const file of files) {
    const prefix = `\n\n### ${file.role}: ${file.path}\nWorkspace: ${file.workspace}\n\`\`\`\n`
    const suffix = '\n```'
    const availableChars = MAX_TOTAL_CHARS - contextText.length - prefix.length - suffix.length
    if (availableChars <= 0) break
    contextText += `${prefix}${limitText(file.content, Math.min(MAX_FILE_CHARS, availableChars))}${suffix}`
  }

  if (!files.length) {
    contextText += '\nNo source files were available to read.'
  }

  return contextText.slice(0, MAX_TOTAL_CHARS)
}

export class GenerateDAppDocsHandler extends BaseToolHandler {
  name = 'generate_dapp_docs'
  description = `Prepare QuickDApp documentation generation for an existing DApp workspace. Use this for dapp-docs.md requests. It validates the target workspace, gathers DApp config, contract source, frontend source, deployment, Base mini app, and The Graph context, then returns instructions to write exactly ${DAPP_DOCS_FILENAME}.`
  inputSchema = {
    type: 'object',
    properties: {
      workspaceName: {
        type: 'string',
        description: 'Target DApp workspace name.'
      },
      targetFilename: {
        type: 'string',
        enum: [DAPP_DOCS_FILENAME],
        description: `Documentation filename. Must be ${DAPP_DOCS_FILENAME}.`
      },
      confirmOverwrite: {
        type: 'boolean',
        description: `Set true only after the user confirms overwriting an existing ${DAPP_DOCS_FILENAME}.`
      }
    },
    required: ['workspaceName']
  }

  getPermissions(): string[] {
    return ['dapp:read', 'file:write']
  }

  async execute(args: GenerateDAppDocsArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const workspaceName = String(args.workspaceName || '').trim()
      const targetFilename = args.targetFilename || DAPP_DOCS_FILENAME

      if (!workspaceName) return this.createErrorResult('workspaceName is required for generate_dapp_docs.')
      if (targetFilename !== DAPP_DOCS_FILENAME) {
        return this.createErrorResult(`targetFilename must be "${DAPP_DOCS_FILENAME}".`)
      }

      const configLookup = await readConfig(plugin, workspaceName)
      if (!configLookup) {
        return this.createErrorResult(`Workspace "${workspaceName}" is not a valid DApp docs target because it has no readable dapp.config.json.`)
      }

      const existingDocs = await plugin.call('filePanel' as any, 'existsInWorkspace', workspaceName, DAPP_DOCS_FILENAME).catch(() => false)
      if (existingDocs && !args.confirmOverwrite) {
        return this.createErrorResult(`${DAPP_DOCS_FILENAME} already exists in workspace "${workspaceName}". Ask the user for overwrite confirmation, then call generate_dapp_docs again with confirmOverwrite=true.`)
      }

      await switchToWorkspaceIfNeeded(plugin, workspaceName)
      const contextText = await buildDocsContext(plugin, workspaceName, configLookup.config, configLookup.configPath)
      setQuickDappDocsContext(workspaceName)

      return this.createSuccessResult({
        success: true,
        workspaceName,
        targetFilename: DAPP_DOCS_FILENAME,
        message: `QuickDApp docs context is ready.\n\n` +
          `Write exactly one file now: /${DAPP_DOCS_FILENAME}\n` +
          `Do not modify frontend files, contract files, dapp.config.json, deployment settings, or any other file.\n` +
          `Do not call generate_dapp, update_dapp, generate_graph_dapp, or finalize_dapp_generation.\n` +
          `Use write_file with path "/${DAPP_DOCS_FILENAME}" only.\n\n` +
          `The ${DAPP_DOCS_FILENAME} file should include:\n` +
          `- Overview: one short paragraph describing the DApp\n` +
          `- Current environment: one Markdown table with QuickDApp Preview availability, contract network, external website URL, whether the contract is reachable outside Remix IDE, and a reason when unavailable\n` +
          `- How to use: short steps for the main user flows\n` +
          `- Features and contract coverage: one Markdown table with user action, contract function, transaction type, UI/source evidence, and coverage status\n` +
          `- Project files: only the main files a maintainer is likely to edit\n` +
          `- Limitations: current, concrete limitations only\n` +
          `- Safe updates: supported ways to update the frontend and important restrictions\n\n` +
          `Keep the document concise. Do not add design-system details such as colors or fonts unless they affect behavior. ` +
          `Omit empty integrations and repeated metadata instead of listing many "Not configured" values. ` +
          `For major behavior and structure descriptions, cite the supporting source file path from the provided context. ` +
          `Treat contract coverage as static source evidence only: use "Referenced" when a frontend call reference is provided and "Not found" otherwise. ` +
          `"Not found" means the scan found no supported call pattern; it does not prove that a feature is unsupported. ` +
          `Do not describe a referenced function as tested, working, or verified. If no ABI functions are available, state that contract coverage is not applicable. ` +
          `Derive transaction type only from ABI mutability: view or pure is "Read only", nonpayable is "State-changing transaction", and payable is "Payable transaction". ` +
          `Use an available gateway URL as the external website URL; otherwise state that the external website URL is not available. ` +
          `If the contract uses a Remix VM network, state that the DApp currently runs in QuickDApp Preview through the Remix VM provider bridge. ` +
          `For Remix VM, state that the contract is not reachable outside Remix IDE because Remix VM is an in-browser blockchain. ` +
          `Do not say MetaMask or another browser wallet can connect to a Remix VM network, and do not instruct the user to publish that VM-bound DApp as a working public DApp. ` +
          `Never instruct the user to edit dapp.config.json manually. Contract address, ABI, or network binding changes are outside normal frontend updates. ` +
          `If the contract source is unavailable, do not infer access control, modifiers, internal validation, or other implementation behavior from the ABI alone. ` +
          `Do not invent file paths or line numbers. ` +
          `Use only the metadata and source files below. If a required fact is unavailable, say that it is not configured or cannot be determined. ` +
          `Do not invent contract behavior, deployment state, or integrations. ` +
          `Do not include secrets, API keys, private keys, raw tokens, base64 image data, or long source-code dumps.\n\n` +
          `DApp context:\n${contextText}`
      })
    } catch (error: any) {
      return this.createErrorResult(`DApp docs generation failed: ${error.message}`)
    }
  }
}
