export interface NotificationPayload {
  topic: string
  author: string
  feedIndex: number
  deltaRef: string
  delta?: string
}

export type NotificationHandler = (payload: NotificationPayload) => void

export interface NotificationProvider {
  subscribe(topic: string, handler: NotificationHandler): void
  publish(payload: NotificationPayload): void
  unsubscribe(): void
  addMember?(address: string): void
}

// Which transport to use for SwarmPersistence notifications.
// 'webrtc': WebRTC awareness side-channel (default when a WebRTC session is active)
// future: 'swarm' for SwarmFeedNotificationProvider (no WebRTC dependency)
export type NotificationTransport = 'webrtc'

export interface SwarmInfraSettings {
  user: {
    walletPrivateKey: string // User's wallet for identity/signing
    nickname?: string
  }
  infra: {
    beeUrl: string
    stamp?: string
    topic: string
    members?: string[] // Array of user wallet addresses
  }
}

// notification and swarm are independent layers:
// - notification controls how peers exchange real-time update signals
// - swarm controls whether snapshots are persisted to Swarm feeds
// Both are optional; without swarm, y-webrtc CRDT sync is still active.
export interface SwarmDocSettings {
  sessionId: string
  signalingUrl?: string
  notification?: NotificationTransport // defaults to 'webrtc' when swarm is set
  swarm?: SwarmInfraSettings
}
