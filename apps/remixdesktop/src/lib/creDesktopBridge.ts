/**
 * CRE Desktop Bridge — WebSocket server
 *
 * Bundled inside the RemixDesktop Electron main process. Scaffold CRE
 * connects to this server as a WebSocket client to send project files
 * directly into the active Remix workspace.
 *
 * Protocol:
 *
 *   CRE → Desktop (import request):
 *   {
 *     type: "cre:import",
 *     version: 1,
 *     projectName: string,
 *     files: Record<string, string>   // path → content
 *   }
 *
 *   Desktop → CRE (acknowledgement):
 *   { type: "cre:import:ack", success: true,  workspace: string }
 *   { type: "cre:import:ack", success: false, error: string }
 */

import { WebSocketServer, WebSocket } from 'ws'
import * as fs from 'fs'
import * as path from 'path'
import { BrowserWindow, dialog } from 'electron'

export const CRE_BRIDGE_PORT = 27182

export interface CREImportPayload {
  type: 'cre:import'
  version: number
  projectName: string
  files: Record<string, string>
}

interface CREImportAck {
  type: 'cre:import:ack'
  success: boolean
  workspace?: string
  error?: string
}

/** Origins allowed to connect to the CRE bridge */
const ALLOWED_ORIGINS: Array<string | RegExp> = [
  'https://cre.solange.dev'
]

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false
  return ALLOWED_ORIGINS.some((allowed) =>
    typeof allowed === 'string' ? allowed === origin : allowed.test(origin)
  )
}

let server: WebSocketServer | null = null

function ack(ws: WebSocket, result: CREImportAck) {
  try {
    ws.send(JSON.stringify(result))
  } catch (_) { /* ignore send errors on closing sockets */ }
}

/**
 * Resolve a non-clashing workspace directory name.
 * If `<workspaceRoot>/<name>` already exists, tries `<name>-1`, `<name>-2`, …
 */
function resolveUniqueProjectDir(workspaceRoot: string, baseName: string): { dir: string; name: string } {
  let name = baseName
  let dir = path.resolve(workspaceRoot, name)
  let counter = 1
  while (fs.existsSync(dir)) {
    name = `${baseName}-${counter}`
    dir = path.resolve(workspaceRoot, name)
    counter++
  }
  return { dir, name }
}

/**
 * Write all files from the CRE payload into the given workspace root.
 * Intermediate directories are created automatically.
 * Returns the resolved project directory path and the (possibly suffixed) name.
 */
function writeProjectFiles(
  workspaceRoot: string,
  projectName: string,
  files: Record<string, string>
): { projectDir: string; resolvedName: string } {
  const { dir: projectDir, name: resolvedName } = resolveUniqueProjectDir(workspaceRoot, projectName)
  fs.mkdirSync(projectDir, { recursive: true })

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.resolve(projectDir, filePath)

    // Path traversal check: ensure the resolved path stays within projectDir
    if (!fullPath.startsWith(projectDir + path.sep) && fullPath !== projectDir) {
      throw new Error(`Path traversal attempt detected: "${filePath}" resolves outside the project directory.`)
    }

    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content, 'utf-8')
  }

  return { projectDir, resolvedName }
}

/**
 * Show a native dialog asking whether to switch to the newly imported
 * CRE workspace. If the user confirms, switch the active window to it.
 */
async function promptSwitchWorkspace(projectName: string, projectDir: string): Promise<void> {
  const focusedWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (!focusedWindow) return

  const { response } = await dialog.showMessageBox(focusedWindow, {
    type: 'question',
    title: 'Chainlink CRE Project Imported',
    message: `"${projectName}" has been imported from Scaffold CRE.`,
    detail: 'Would you like to switch to this workspace now?',
    buttons: ['Switch Workspace', 'Keep Current'],
    defaultId: 0,
    cancelId: 1,
  })

  if (response === 0) {
    // Switch the current window to the new workspace in-place
    focusedWindow.webContents.send('cre:project-imported', { projectName, projectDir, switchWorkspace: true })
  } else {
    // Just notify the renderer without switching (e.g. refresh recent list)
    focusedWindow.webContents.send('cre:project-imported', { projectName, projectDir, switchWorkspace: false })
  }
}

/**
 * Resolve the active Remix workspace root directory.
 * Falls back to ~/remix-workspaces if no window-specific path is available.
 */
function resolveWorkspaceRoot(): string {
  // RemixDesktop stores workspaces under the user's home dir by default
  const home = process.env.HOME || process.env.USERPROFILE || '.'
  const workspaceRoot = path.join(home, 'remix-workspaces')
  fs.mkdirSync(workspaceRoot, { recursive: true })
  return workspaceRoot
}

function handleMessage(ws: WebSocket, raw: string) {
  let payload: CREImportPayload

  try {
    payload = JSON.parse(raw)
  } catch {
    return ack(ws, { type: 'cre:import:ack', success: false, error: 'Invalid JSON payload.' })
  }

  if (payload.type !== 'cre:import') {
    return ack(ws, { type: 'cre:import:ack', success: false, error: `Unknown message type: ${payload.type}` })
  }

  if (!payload.projectName || typeof payload.files !== 'object') {
    return ack(ws, { type: 'cre:import:ack', success: false, error: 'Missing projectName or files in payload.' })
  }

  try {
    const workspaceRoot = resolveWorkspaceRoot()
    const { projectDir, resolvedName } = writeProjectFiles(workspaceRoot, payload.projectName, payload.files)
    // ACK immediately so CRE doesn't time out while the user reads the dialog
    ack(ws, { type: 'cre:import:ack', success: true, workspace: resolvedName })
    console.log(`[CRE Bridge] Imported project "${resolvedName}" (${Object.keys(payload.files).length} files) → ${projectDir}`)
    // Prompt async — don't block the WS handler
    promptSwitchWorkspace(resolvedName, projectDir).catch((err) =>
      console.error('[CRE Bridge] Dialog error:', err)
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[CRE Bridge] Failed to write project files:', msg)
    ack(ws, { type: 'cre:import:ack', success: false, error: `Failed to write files: ${msg}` })
  }
}

/**
 * Start the CRE WebSocket bridge server.
 * Only binds to localhost — not exposed to the network.
 * Safe to call multiple times; subsequent calls are no-ops.
 */
export function startCREBridge(): void {
  if (server) return

  server = new WebSocketServer({ host: '127.0.0.1', port: CRE_BRIDGE_PORT })

  server.on('listening', () => {
    console.log(`[CRE Bridge] Listening on ws://127.0.0.1:${CRE_BRIDGE_PORT}`)
  })

  server.on('connection', (ws, req) => {
    const origin = req.headers.origin

    // Origin validation — reject connections from disallowed origins
    if (!isOriginAllowed(origin)) {
      console.warn(`[CRE Bridge] Rejected connection from disallowed origin: ${origin ?? '(none)'}`)
      ws.close(4003, 'Origin not allowed')
      return
    }

    console.log(`[CRE Bridge] Client connected from ${origin}`)

    ws.on('message', (data) => handleMessage(ws, data.toString()))

    ws.on('error', (err) => {
      console.error('[CRE Bridge] Socket error:', err.message)
    })

    ws.on('close', () => {
      console.log('[CRE Bridge] Client disconnected')
    })
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[CRE Bridge] Port ${CRE_BRIDGE_PORT} already in use — bridge not started.`)
    } else {
      console.error('[CRE Bridge] Server error:', err.message)
    }
    server = null
  })
}

/**
 * Stop the CRE WebSocket bridge server gracefully.
 */
export function stopCREBridge(): void {
  if (!server) return
  server.close(() => {
    console.log('[CRE Bridge] Stopped.')
  })
  server = null
}
