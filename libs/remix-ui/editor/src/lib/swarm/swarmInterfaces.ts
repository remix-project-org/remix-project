export interface NotificationPayload {
  topic: string
  author: string
  feedIndex: number
  delta?: string
  username?: string
}

export type NotificationHandler = (payload: NotificationPayload) => void

export interface NotificationProvider {
  subscribe(topic: string, handler: NotificationHandler): void
  publish(payload: NotificationPayload): void
  unsubscribe(): void
  addMember?(address: string): void
  onPeersChange?: (count: number) => void
  isRemoteOrigin?(origin: unknown): boolean
}

export type NotificationTransport = 'webrtc' | 'swarm-rtc'

export interface SwarmInfraSettings {
  user: {
    walletPrivateKey: string // User's wallet for identity/signing
    nickname?: string
  }
  infra: {
    beeUrl: string // User's own bee API or bee gateway url
    stamp?: string // User's own stamp or placeholder for gateway
    topic: string // Feed identifier, can be randomly generated
    members?: string[] // Array of user wallet addresses
  }
}

export interface SwarmDocSettings {
  sessionId: string
  signalingUrl?: string
  stunUrl?: string
  notification?: NotificationTransport
  swarmInfra?: SwarmInfraSettings
}
