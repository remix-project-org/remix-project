export function generateHex(byteLen = 32): string {
  const buf = new Uint8Array(byteLen)
  crypto.getRandomValues(buf)
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function getOrCreatePeerKey(): string {
  const stored = localStorage.getItem(LS_PEER_KEY)
  if (stored) return stored
  const key = generateHex(32)
  localStorage.setItem(LS_PEER_KEY, key)
  return key
}

export const LS_NICKNAME = 'remix_collab_nickname'
export const LS_BEE_URL = 'remix_collab_bee_url'
export const LS_STAMP = 'remix_collab_stamp'
export const LS_SIGNAL_URL = 'remix_collab_signal_url'
export const LS_STUN_URL = 'remix_collab_stun_url'
export const LS_PEER_KEY = 'remix_collab_peer_key'
export const LS_TOPIC = 'remix_collab_topic'
export const DEFAULT_BEE_URL = 'http://localhost:1633'
export const DEFAULT_SIGNALING_SERVER_URL = 'ws://localhost:4444'
export const DEFAULT_STUN_URL = 'stun:stun.l.google.com:19302'
export const FALLBACK_STUN_URL = 'stun:stun.cloudflare.com:3478'