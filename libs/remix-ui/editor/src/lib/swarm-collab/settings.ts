import { decodeRoomInvite, encodeRoomInvite, getSigner, RoomInvite, uuidV4 } from '@solarpunkltd/swarm-collaborative-docs'

export type CollabTransport = 'signaling-server' | 'swarm-rtc'

/** What a user fills in once; persisted per browser. */
export interface CollabSettings {
  nickname: string
  beeUrl: string
  stamp: string
  transport: CollabTransport
  /** Only used by the `signaling-server` transport. */
  signalingUrl: string
  /** Comma-separated `stun:` / `turn:` URLs. */
  iceUrls: string
}

/** A session this tab is part of, kept so a reload rejoins it. */
export interface ActiveSession {
  invite: RoomInvite
  workspace: string
}

export interface CollabIdentity {
  privateKey: string
  address: string
}

// Local defaults; a hosted deployment points these at its own services.
export const DEFAULT_SETTINGS: CollabSettings = {
  nickname: '',
  beeUrl: 'http://localhost:1633',
  stamp: '',
  transport: 'signaling-server',
  signalingUrl: 'ws://localhost:4444',
  iceUrls: 'stun:stun.l.google.com:19302'
}

const SETTINGS_KEY = 'remix.swarmCollab.settings'
const IDENTITY_KEY = 'remix.swarmCollab.identitySeed'
const SESSION_ID_KEY = 'remix.swarmCollab.sessionId'
const ACTIVE_KEY = 'remix.swarmCollab.active'
const HOSTED_KEY = 'remix.swarmCollab.hostedRooms'
const JOINED_WORKSPACE_PREFIX = 'swarm-collab-'
const INVITE_PARAMS = new Set(['v', 'k', 'h', 't', 'd'])

function read<T>(storage: Storage, key: string): T | null {
  try {
    const raw = storage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(storage: Storage, key: string, value: unknown): void {
  try {
    if (value === null) storage.removeItem(key)
    else storage.setItem(key, JSON.stringify(value))
  } catch {
    // storage unavailable (private mode, quota): the session works, it is just not remembered
  }
}

export function loadSettings(): CollabSettings {
  return { ...DEFAULT_SETTINGS, ...read<Partial<CollabSettings>>(localStorage, SETTINGS_KEY) }
}

export function saveSettings(settings: CollabSettings): void {
  write(localStorage, SETTINGS_KEY, settings)
}

/** This browser's collaboration identity, created on first use. Not a wallet. */
export function loadIdentity(): CollabIdentity {
  let seed = read<string>(localStorage, IDENTITY_KEY)
  if (!seed) {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    seed = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    write(localStorage, IDENTITY_KEY, seed)
  }
  const signer = getSigner(seed)

  return { privateKey: signer.toHex(), address: signer.publicKey().address().toHex() }
}

/** Per tab, so two tabs of one browser are two sessions, and a reload rejoins as the same one. */
export function loadSessionId(): string {
  let id = read<string>(sessionStorage, SESSION_ID_KEY)
  if (!id) {
    id = uuidV4()
    write(sessionStorage, SESSION_ID_KEY, id)
  }

  return id
}

export function loadActiveSession(): ActiveSession | null {
  return read<ActiveSession>(sessionStorage, ACTIVE_KEY)
}

export function saveActiveSession(session: ActiveSession | null): void {
  write(sessionStorage, ACTIVE_KEY, session)
}

/** Remembers which workspace a room was created from, so its creator can rejoin it from another tab. */
export function saveHostedRoom(roomId: string, workspace: string): void {
  write(localStorage, HOSTED_KEY, { ...read<Record<string, string>>(localStorage, HOSTED_KEY), [roomId]: workspace })
}

export function hostedRoomWorkspace(roomId: string): string | null {
  return read<Record<string, string>>(localStorage, HOSTED_KEY)?.[roomId] ?? null
}

/** The workspace a room is mirrored into when it was not created from this browser. */
export function joinedWorkspaceName(roomId: string): string {
  return JOINED_WORKSPACE_PREFIX + roomId.slice(0, 8)
}

export function isJoinedWorkspace(name: string): boolean {
  return name.startsWith(JOINED_WORKSPACE_PREFIX)
}

/** Takes an invite out of the address bar and returns it, keeping Remix's own hash parameters. */
export function consumeInviteFromLocation(): RoomInvite | null {
  const invite = decodeRoomInvite(window.location.hash)
  if (!invite) return null

  const rest = window.location.hash.slice(1).split('&').filter((part) => part && !INVITE_PARAMS.has(part.split('=')[0]))
  const hash = rest.length ? '#' + rest.join('&') : ''
  window.history.replaceState(null, '', window.location.pathname + window.location.search + hash)

  return invite
}

/** Reads an invite from what a user pastes: the whole link, only its `#…` part, or the bare fragment. */
export function parseInviteInput(input: string): RoomInvite | null {
  const text = input.trim()
  const hashAt = text.indexOf('#')

  return decodeRoomInvite(hashAt >= 0 ? text.slice(hashAt + 1) : text)
}

/** Builds an invite from a room key and host address; the transport is picked separately. */
export function inviteFromParts(key: string, hostAddress: string, transport: CollabTransport): RoomInvite | null {
  const roomKey = key.trim()
  const creator = hostAddress.trim().toLowerCase().replace(/^0x/, '')
  if (!roomKey || !/^[0-9a-f]{40}$/.test(creator)) return null

  return { key: roomKey, creator, transport }
}

/** Invite link for the Remix instance this page was loaded from. */
export function inviteLink(invite: RoomInvite): string {
  return `${window.location.origin}${window.location.pathname}#${encodeRoomInvite(invite)}`
}

export function parseIceServers(iceUrls: string): RTCIceServer[] {
  return iceUrls.split(',').map((url) => url.trim()).filter(Boolean).map((urls) => ({ urls }))
}

export function normalizeStamp(stamp: string): string {
  return stamp.trim().toLowerCase().replace(/^0x/, '')
}
