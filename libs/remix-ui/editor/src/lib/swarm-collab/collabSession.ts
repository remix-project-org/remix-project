import type { editor } from 'monaco-editor'
import { createRoomKey, createSignalingServerTransport, createSwarmRtcTransport, CursorPosition, DOC_EVENTS, DocTransportFactory, MemberEntry, PeerConnectionState, Room, RoomInvite, SwarmDoc } from '@solarpunkltd/swarm-collaborative-docs'
import { collabModelGuard, RemoteCursor, YTextModelBinding } from './monacoBinding'
import { ActiveSession, CollabSettings, CollabTransport, hostedRoomWorkspace, inviteLink, isJoinedWorkspace, joinedWorkspaceName, loadIdentity, loadSessionId, normalizeStamp, parseIceServers, saveActiveSession, saveHostedRoom } from './settings'
import { WorkspaceSync } from './workspaceSync'

/** The Remix plugin calls a session needs. */
export interface RemixHost {
  call(plugin: string, method: string, ...args: unknown[]): Promise<any>
  on(plugin: string, event: string, cb: (...args: any[]) => void): void
  off(plugin: string, event: string): void
  setForceReadOnly(value: boolean): void
}

export type CollabPhase = 'idle' | 'connecting' | 'syncing' | 'live'

export interface CollabPerson {
  identity: string
  username: string
  sessions: number
  connected: boolean
}

export interface CollabState {
  phase: CollabPhase
  roomId: string | null
  inviteLink: string | null
  isCreator: boolean
  workspace: string | null
  people: CollabPerson[]
  pendingPeers: number
  saving: boolean
  error: string | null
}

const IDLE: CollabState = { phase: 'idle', roomId: null, inviteLink: null, isCreator: false, workspace: null, people: [], pendingPeers: 0, saving: false, error: null }
const WORKSPACE_SWITCH_TIMEOUT_MS = 15000
const FILE_EVENTS = ['fileAdded', 'fileRemoved', 'fileRenamed', 'fileSaved', 'fileChanged'] as const
const DOC_TYPE = 'remix'

function isTransport(value: string | undefined): value is CollabTransport {
  return value === 'signaling-server' || value === 'swarm-rtc'
}

interface AwarenessUpdate {
  address: string
  identity: string
  username: string
  cursor: CursorPosition
}

/** One collaboration session: its `SwarmDoc`, the workspace it mirrors, and the open file's binding. */
export class CollabSession {
  private state: CollabState = IDLE
  private readonly listeners = new Set<(state: CollabState) => void>()
  private readonly cursorListeners = new Set<() => void>()
  private readonly origin = { source: 'remix-swarm-collab' }
  private readonly bindingOrigin = { source: 'remix-swarm-collab-editor' }
  private doc: SwarmDoc | null = null
  private sync: WorkspaceSync | null = null
  private binding: YTextModelBinding | null = null
  private activeFile: { path: string; model: editor.ITextModel } | null = null
  private members = new Map<string, MemberEntry>()
  private peerStates = new Map<string, PeerConnectionState>()
  private cursors = new Map<string, AwarenessUpdate>()
  private readonly colors = new Map<string, number>()
  private starting = false
  private listening = false
  private generation = 0

  constructor(private readonly host: RemixHost) {}

  getState(): CollabState {
    return this.state
  }

  subscribe(listener: (state: CollabState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onCursorsChanged(listener: () => void): () => void {
    this.cursorListeners.add(listener)
    return () => this.cursorListeners.delete(listener)
  }

  /** Shares the current workspace in a new room. */
  async create(settings: CollabSettings): Promise<void> {
    const identity = loadIdentity()
    const workspace = await this.currentWorkspace()
    if (!workspace) throw new Error('Open a workspace to share first.')

    const invite: RoomInvite = { key: createRoomKey(), creator: identity.address, transport: settings.transport, docType: DOC_TYPE }
    saveHostedRoom(new Room(invite.key).id, workspace)
    await this.start({ invite, workspace }, settings)
  }

  /** Joins a room in its dedicated workspace, or in the source workspace of a room created in this browser. */
  async join(invite: RoomInvite, settings: CollabSettings): Promise<void> {
    const roomId = new Room(invite.key).id
    const workspace = hostedRoomWorkspace(roomId) ?? joinedWorkspaceName(roomId)

    await this.start({ invite, workspace }, settings)
  }

  /** Rejoins the session this tab was in before a reload. */
  async resume(active: ActiveSession, settings: CollabSettings): Promise<void> {
    await this.start(active, settings)
  }

  async leave(error: string | null = null): Promise<void> {
    this.generation++
    const doc = this.doc
    const sync = this.sync
    this.doc = null
    this.sync = null

    this.unbind()
    if (this.listening) {
      FILE_EVENTS.forEach((event) => this.host.off('fileManager', event))
      this.host.off('filePanel', 'setWorkspace')
      this.listening = false
    }
    window.removeEventListener('beforeunload', this.onBeforeUnload)

    await sync?.dispose()
    if (doc) {
      await doc.flush().catch(() => undefined)
      doc.stop()
    }

    this.host.setForceReadOnly(false)
    saveActiveSession(null)
    this.members.clear()
    this.peerStates.clear()
    this.cursors.clear()
    this.emitCursors()
    this.setState({ ...IDLE, error })
  }

  dismissError(): void {
    this.setState({ ...this.state, error: null })
  }

  /** Tells the session which file the main editor shows, so it can bind the model. */
  setActiveFile(path: string | null, model: editor.ITextModel | null): void {
    this.activeFile = path && model ? { path, model } : null
    this.refreshBinding()
  }

  updateLocalCursor(path: string, anchor: number, head: number): void {
    if (this.binding?.path === path) this.doc?.updateCursor({ anchor, head, scope: path })
  }

  /** Remote carets and selections in `path`, from sessions that are still connected. */
  cursorsFor(path: string): RemoteCursor[] {
    const result: RemoteCursor[] = []
    this.cursors.forEach((update) => {
      const cursor = update.cursor
      if (cursor && cursor.scope === path && this.members.get(update.address)?.live !== false) {
        result.push({ username: update.username, color: this.colorOf(update.identity), anchor: cursor.anchor, head: cursor.head })
      }
    })

    return result
  }

  private async start(active: ActiveSession, settings: CollabSettings): Promise<void> {
    if (this.doc || this.starting) throw new Error('Already in a collaboration session.')

    this.starting = true
    try {
      await this.startUnguarded(active, settings)
    } catch (err) {
      await this.leave((err as Error).message)
      throw err
    } finally {
      this.starting = false
    }
  }

  private async startUnguarded(active: ActiveSession, chosen: CollabSettings): Promise<void> {
    const { invite, workspace } = active
    // Peers only meet on the same transport, so the one the room was created with wins.
    const settings = isTransport(invite.transport) ? { ...chosen, transport: invite.transport } : chosen
    const identity = loadIdentity()
    const isCreator = invite.creator === identity.address.toLowerCase()
    const stamp = normalizeStamp(settings.stamp)
    if (!/^[0-9a-f]{64}$/.test(stamp)) throw new Error('A postage stamp (64 hex characters) is required: every participant writes to Swarm.')
    if (!settings.nickname.trim()) throw new Error('Pick a name to show to the others.')

    const generation = this.generation
    this.setState({ ...IDLE, phase: 'connecting', roomId: new Room(invite.key).id, inviteLink: inviteLink(invite), isCreator, workspace })
    this.host.setForceReadOnly(true)
    await this.enterWorkspace(workspace, isJoinedWorkspace(workspace))
    // Left while the workspace was switching.
    if (generation !== this.generation) return
    saveActiveSession(active)

    const doc = new SwarmDoc({
      user: { privateKey: identity.privateKey, nickname: settings.nickname.trim(), sessionId: loadSessionId() },
      infra: { beeUrl: settings.beeUrl.trim(), stamp, roomKey: invite.key, roomCreator: invite.creator, transport: this.transportFor(settings) },
    })
    this.doc = doc
    this.sync = new WorkspaceSync(
      doc.doc,
      this.workspaceFiles(),
      this.origin,
      () => this.refreshBinding(),
      (message) => console.log(`[swarm-collab] ${message}`),
    )

    const emitter = doc.getEmitter()
    let liveRequested = false
    emitter.on(DOC_EVENTS.DOC_ERROR, (err: Error) => this.setState({ ...this.state, error: err.message }))
    emitter.on(DOC_EVENTS.DOC_READY, () => this.setState({ ...this.state, phase: 'syncing' }))
    emitter.on(DOC_EVENTS.DOC_SYNC_STATE, ({ synced, pending }: { synced: boolean; pending: number }) => {
      this.setState({ ...this.state, pendingPeers: pending })
      if (synced && !liveRequested) {
        liveRequested = true
        this.goLive(doc, isCreator).catch((err) => this.leave((err as Error).message))
      }
    })
    emitter.on(DOC_EVENTS.MEMBERS_UPDATED, (members: ReadonlyMap<string, MemberEntry>) => {
      this.members = new Map(members)
      this.publishPeople()
    })
    emitter.on(DOC_EVENTS.PEER_STATE_UPDATED, (states: ReadonlyMap<string, PeerConnectionState>) => {
      this.peerStates = new Map(states)
      this.publishPeople()
    })
    emitter.on(DOC_EVENTS.AWARENESS_UPDATED, (update: AwarenessUpdate) => {
      this.cursors.set(update.address, update)
      this.emitCursors()
    })
    emitter.on(DOC_EVENTS.WRITE_PENDING, () => this.setState({ ...this.state, saving: true }))
    emitter.on(DOC_EVENTS.WRITE_DONE, () => this.setState({ ...this.state, saving: false }))

    window.addEventListener('beforeunload', this.onBeforeUnload)
    doc.start()
  }

  private async goLive(doc: SwarmDoc, isCreator: boolean): Promise<void> {
    const sync = this.sync
    if (!sync || this.doc !== doc) return

    await sync.start(isCreator)
    if (this.sync !== sync) return

    // Registered before `goLive`, so Remix's replay of each event's last value is ignored.
    this.listening = true
    this.host.on('fileManager', 'fileAdded', (path: string) => sync.onFileAdded(path))
    this.host.on('fileManager', 'fileRemoved', (path: string) => sync.onFileRemoved(path))
    this.host.on('fileManager', 'fileRenamed', (oldPath: string, newPath: string) => sync.onFileRenamed(oldPath, newPath))
    this.host.on('fileManager', 'fileSaved', (path: string) => sync.onFileSaved(path))
    this.host.on('fileManager', 'fileChanged', (path: string) => sync.onFileSaved(path))
    this.host.on('filePanel', 'setWorkspace', (workspace: { name?: string }) => {
      if (workspace?.name && workspace.name !== this.state.workspace) this.leave('Left the session: the workspace was switched.')
    })
    sync.goLive()

    this.host.setForceReadOnly(false)
    this.setState({ ...this.state, phase: 'live' })
    this.refreshBinding()
  }

  private refreshBinding(): void {
    const target = this.activeFile
    const sync = this.sync
    if (this.state.phase !== 'live' || !sync || !target || !sync.has(target.path) || target.model.isDisposed()) return this.unbind()
    if (this.binding && this.binding.path === target.path && this.binding.model === target.model) return

    this.unbind()
    this.binding = new YTextModelBinding(target.path, sync.text(target.path), target.model, this.bindingOrigin, () => sync.has(target.path))
    collabModelGuard.register(this.binding)
    sync.setBoundPath(target.path)
  }

  private unbind(): void {
    if (!this.binding) return

    collabModelGuard.unregister(this.binding)
    this.binding.dispose()
    this.binding = null
    this.sync?.setBoundPath(null)
    this.doc?.updateCursor(null)
  }

  private transportFor(settings: CollabSettings): DocTransportFactory {
    const iceServers = parseIceServers(settings.iceUrls)

    return settings.transport === 'swarm-rtc' ? createSwarmRtcTransport({ iceServers }) : createSignalingServerTransport({ signalingUrl: settings.signalingUrl.trim(), iceServers })
  }

  private async currentWorkspace(): Promise<string | null> {
    const current = await this.host.call('filePanel', 'getCurrentWorkspace')

    return current?.name ?? null
  }

  private async enterWorkspace(name: string, createIfMissing: boolean): Promise<void> {
    if ((await this.currentWorkspace()) === name) return

    const workspaces: Array<{ name: string }> = (await this.host.call('filePanel', 'getWorkspaces')) ?? []
    if (workspaces.some((workspace) => workspace.name === name)) {
      await this.host.call('filePanel', 'switchToWorkspace', { name, isLocalhost: false })
    } else if (createIfMissing) {
      await this.host.call('filePanel', 'createWorkspace', name, 'blank', true)
    } else {
      throw new Error(`Workspace "${name}" no longer exists.`)
    }

    const deadline = Date.now() + WORKSPACE_SWITCH_TIMEOUT_MS
    while ((await this.currentWorkspace()) !== name) {
      if (Date.now() > deadline) throw new Error(`Could not switch to workspace "${name}".`)
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }

  private workspaceFiles() {
    return {
      readdir: (path: string) => this.host.call('fileManager', 'readdir', path),
      readFile: (path: string) => this.host.call('fileManager', 'readFile', path),
      writeFile: (path: string, content: string) => this.host.call('fileManager', 'writeFile', path, content),
      exists: (path: string) => this.host.call('fileManager', 'exists', path),
      remove: (path: string) => this.host.call('fileManager', 'remove', path),
    }
  }

  private publishPeople(): void {
    const people = new Map<string, CollabPerson>()
    this.members.forEach((entry, address) => {
      if (!entry.live) return

      const person = people.get(entry.identity) ?? { identity: entry.identity, username: entry.username, sessions: 0, connected: false }
      person.sessions++
      person.connected = person.connected || this.peerStates.get(address) === PeerConnectionState.Connected
      people.set(entry.identity, person)
    })
    this.setState({ ...this.state, people: [...people.values()]})
  }

  private colorOf(identity: string): number {
    if (!this.colors.has(identity)) this.colors.set(identity, this.colors.size)

    return this.colors.get(identity) as number
  }

  private emitCursors(): void {
    this.cursorListeners.forEach((listener) => listener())
  }

  private setState(state: CollabState): void {
    this.state = state
    this.listeners.forEach((listener) => listener(state))
  }

  private onBeforeUnload = (): void => {
    this.doc?.flush()
  }
}
