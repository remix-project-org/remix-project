import type { WebrtcProvider } from 'y-webrtc'
import type { NotificationHandler, NotificationPayload, NotificationProvider } from './swarmInterfaces'

interface ExtendedPayload extends NotificationPayload {
  nonce: string
}

export class WebrtcNotificationProvider implements NotificationProvider {
  private provider: WebrtcProvider
  private handler: NotificationHandler | null = null
  private seenNonces = new Set<string>()
  private awarenessChangeListener: (changes: { added: number[]; updated: number[]; removed: number[] }) => void

  constructor(provider: WebrtcProvider) {
    this.provider = provider
    this.awarenessChangeListener = ({ added, updated }) => {
      if (!this.handler) return

      const states = this.provider.awareness.getStates()

      for (const id of [...added, ...updated]) {
        if (id === this.provider.awareness.clientID) continue

        const state = states.get(id) as Record<string, unknown> | undefined
        const n = state?.swarmNotification as ExtendedPayload | undefined

        if (!n || this.seenNonces.has(n.nonce)) continue

        this.seenNonces.add(n.nonce)
        this.handler(n)
      }
    }
  }

  subscribe(_topic: string, handler: NotificationHandler): void {
    this.handler = handler
    this.provider.awareness.on('change', this.awarenessChangeListener)
  }

  publish(payload: NotificationPayload): void {
    const extended: ExtendedPayload = {
      ...payload,
      nonce: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }
    const current = this.provider.awareness.getLocalState() || {}
    this.provider.awareness.setLocalState({ ...current, swarmNotification: extended })
    // Clear after delivery window so reconnecting peers don't re-process it
    setTimeout(() => {
      const s = this.provider.awareness.getLocalState() || {}
      const { swarmNotification: _removed, ...rest } = s as Record<string, unknown>
      this.provider.awareness.setLocalState(rest)
    }, 200)
  }

  unsubscribe(): void {
    this.provider.awareness.off('change', this.awarenessChangeListener)
    this.handler = null
    this.seenNonces.clear()
  }

  addMember(_address: string): void {
    // WebRTC discovers peers automatically via awareness — no-op
  }
}
