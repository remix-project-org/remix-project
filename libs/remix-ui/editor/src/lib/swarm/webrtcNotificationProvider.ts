import type { WebrtcProvider } from 'y-webrtc'

import type { NotificationHandler, NotificationPayload, NotificationProvider } from './swarmInterfaces'
import { remove0x } from './swarmUtils'

const TAG = '[WebrtcNotificationProvider]'

export class WebrtcNotificationProvider implements NotificationProvider {
  private handler: NotificationHandler | null = null
  private topic = ''
  private knownPeers = new Set<string>()
  private clientIdToAddress = new Map<number, string>()
  private awarenessChangeListener: (changes: { added: number[]; updated: number[]; removed: number[] }) => void

  constructor(
    private readonly provider: WebrtcProvider,
    private readonly ownAddress: string,
    private readonly nickname: string,
  ) {
    this.awarenessChangeListener = ({ added, updated, removed }) => {
      const states = this.provider.awareness.getStates()

      for (const id of [...added, ...updated]) {
        if (id === this.provider.awareness.clientID) continue
        const state = states.get(id) as Record<string, unknown> | undefined
        if (!state) continue

        const userField = state.user as { address?: string; nickname?: string } | undefined
        const addr = userField?.address ? remove0x(userField.address.toLowerCase()) : null

        if (addr && addr !== this.ownAddress && !this.knownPeers.has(addr)) {
          this.knownPeers.add(addr)
          this.clientIdToAddress.set(id, addr)
          console.log(`${TAG} peer discovered: ${addr.slice(0, 8)}…`)
          this.handler?.({
            topic: this.topic,
            author: addr,
            feedIndex: -1,
            username: userField?.nickname || addr.slice(0, 8),
          })
        }
      }

      for (const id of removed) {
        const addr = this.clientIdToAddress.get(id)
        if (addr) {
          this.clientIdToAddress.delete(id)
          this.knownPeers.delete(addr)
          console.log(`${TAG} peer disconnected: ${addr.slice(0, 8)}…`)
        }
      }
    }
  }

  subscribe(topic: string, handler: NotificationHandler): void {
    this.topic = topic
    this.handler = handler

    this.provider.awareness.setLocalStateField('user', {
      address: this.ownAddress,
      nickname: this.nickname,
    })

    this.provider.awareness.on('change', this.awarenessChangeListener)

    // Synthesize join notifications for peers already in the room
    const states = this.provider.awareness.getStates()
    for (const [id, state] of states) {
      if (id === this.provider.awareness.clientID) continue
      const userField = (state as Record<string, unknown>)?.user as { address?: string; nickname?: string } | undefined
      const addr = userField?.address ? remove0x(userField.address.toLowerCase()) : null
      if (addr && addr !== this.ownAddress && !this.knownPeers.has(addr)) {
        this.knownPeers.add(addr)
        this.clientIdToAddress.set(id, addr)
        console.log(`${TAG} existing peer: ${addr.slice(0, 8)}…`)
        handler({ topic, author: addr, feedIndex: -1, username: userField?.nickname || addr.slice(0, 8) })
      }
    }
  }

  // y-webrtc handles doc sync automatically — publish is a no-op
  publish(_payload: NotificationPayload): void {}

  isRemoteOrigin(origin: unknown): boolean {
    return origin === this.provider
  }

  unsubscribe(): void {
    this.provider.awareness.off('change', this.awarenessChangeListener)
    this.provider.destroy()
    this.handler = null
    this.knownPeers.clear()
    this.clientIdToAddress.clear()
  }

  addMember(_address: string): void {}
}
