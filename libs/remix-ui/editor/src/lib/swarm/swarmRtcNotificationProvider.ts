import { PrivateKey } from '@ethersphere/bee-js'
import { v4 as uuidv4 } from 'uuid'
import * as Y from 'yjs'

import { NotificationHandler, NotificationPayload, NotificationProvider } from './swarmInterfaces'
import { SignalRecord, SignalType, SwarmSignal } from './swarmSignal'
import { remove0x } from './swarmUtils'
import { DEFAULT_STUN_URL, FALLBACK_STUN_URL } from './utils'

export const SWARM_RTC_ORIGIN = 'swarm-rtc'
const TAG = '[SwarmRtcNotificationProvider]'
const SIGNAL_POLL_INTERVAL_MS = 5_000
const OFFER_MAX_AGE_MS = 5 * 60 * 1_000
const PEER_RETRY_TIMEOUT_MS = 10_000

export class SwarmRtcNotificationProvider implements NotificationProvider {
  private readonly doc: Y.Doc
  private readonly swarmSignal: SwarmSignal
  private readonly ownAddress: string
  private readonly iceServers: RTCIceServer[]

  private swarmRtcPeers = new Map<string, RTCPeerConnection>()
  private pendingOfferSessions = new Map<string, string>()
  private sentAnswerKeys = new Set<string>()
  private pendingRetries = new Set<string>()
  private signalPollTimer: ReturnType<typeof setInterval> | null = null
  private signalCheckInFlight = false
  private stopped = false
  private handler: NotificationHandler | null = null
  private openChannels = new Map<string, RTCDataChannel>()
  private members = new Map<string, true>()

  onPeersChange?: (count: number) => void

  constructor(
    doc: Y.Doc,
    beeApiUrl: string,
    walletPrivateKey: string,
    stampId: string,
    docTopic: string,
    stunUrl: string = DEFAULT_STUN_URL,
    iceServers?: RTCIceServer[],
  ) {
    this.doc = doc
    const signer = new PrivateKey(remove0x(walletPrivateKey))
    this.ownAddress = signer.publicKey().address().toString()
    this.swarmSignal = new SwarmSignal(docTopic, beeApiUrl, signer, stampId)
    this.iceServers = iceServers?.length ? iceServers : [{ urls: stunUrl }, { urls: FALLBACK_STUN_URL }]
  }

  subscribe(_topic: string, handler: NotificationHandler): void {
    this.handler = handler
    this.swarmSignal.clearOwn()
    this.startSignalPoll()
  }

  publish(payload: NotificationPayload): void {
    if (this.openChannels.size === 0) return
    const text = JSON.stringify(payload)
    for (const channel of this.openChannels.values()) {
      if (channel.readyState === 'open') channel.send(text)
    }
  }

  isRemoteOrigin(origin: unknown): boolean {
    return origin === SWARM_RTC_ORIGIN
  }

  addMember(address: string): void {
    const normalized = remove0x(address.toLowerCase())
    if (normalized === this.ownAddress || this.members.has(normalized)) return
    this.members.set(normalized, true)
    this.connectToPeer(normalized)
  }

  unsubscribe(): void {
    this.stopped = true
    if (this.signalPollTimer) {
      clearInterval(this.signalPollTimer)
      this.signalPollTimer = null
    }
    for (const [, pc] of this.swarmRtcPeers) pc.close()
    this.swarmRtcPeers.clear()
    this.openChannels.clear()
    this.members.clear()
    this.pendingRetries.clear()
    this.handler = null
  }

  // Lower address is always the initiator — deterministic assignment prevents both peers
  // from sending offers simultaneously.
  private isInitiatorFor(peerAddress: string): boolean {
    return this.ownAddress < peerAddress
  }

  private connectToPeer(address: string): void {
    if (this.swarmRtcPeers.has(address)) return
    if (this.isInitiatorFor(address)) {
      this.initiateConnectionTo(address).catch(err =>
        console.error(`${TAG} initiateConnectionTo(${address.slice(0, 8)}) failed:`, err),
      )
    }
  }

  private async initiateConnectionTo(peerAddress: string): Promise<void> {
    if (this.swarmRtcPeers.has(peerAddress)) return

    const pc = new RTCPeerConnection({ iceServers: this.iceServers })
    this.swarmRtcPeers.set(peerAddress, pc)

    pc.addEventListener('connectionstatechange', () => {
      console.debug(`${TAG} [initiator→${peerAddress.slice(0, 8)}] connectionState=${pc.connectionState}`)
      if (pc.connectionState === 'failed') {
        pc.close()
        this.swarmRtcPeers.delete(peerAddress)
        this.pendingOfferSessions.delete(peerAddress)
        this.scheduleReconnect(peerAddress, 'ICE failed')
      } else if (pc.connectionState === 'closed') {
        this.swarmRtcPeers.delete(peerAddress)
        this.pendingOfferSessions.delete(peerAddress)
      }
    })

    const dc = pc.createDataChannel('yjs')
    dc.addEventListener('open', () => this.setupDataChannel(peerAddress, dc))
    dc.addEventListener('error', e => console.error(`${TAG} [initiator] dataChannel error`, e))

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await this.waitForIceGatheringComplete(pc)

    if (this.stopped) {
      pc.close()
      this.swarmRtcPeers.delete(peerAddress)
      return
    }

    const sessionId = uuidv4()
    this.pendingOfferSessions.set(peerAddress, sessionId)

    const record: SignalRecord = {
      type: SignalType.OFFER,
      fromAddress: this.ownAddress,
      toAddress: peerAddress,
      sessionId,
      timestamp: Date.now(),
      sdp: pc.localDescription?.sdp ?? '',
    }

    await this.swarmSignal.writeRecord(record)
    console.debug(`${TAG} offer written → ${peerAddress.slice(0, 8)}… sessionId=${sessionId.slice(0, 8)}`)
  }

  private async answerPeerOffer(peerAddress: string, offer: SignalRecord): Promise<void> {
    if (this.swarmRtcPeers.has(peerAddress)) return
    const key = `${peerAddress}:${offer.sessionId}`
    if (this.sentAnswerKeys.has(key)) return

    this.sentAnswerKeys.add(key)
    console.debug(
      `${TAG} answering offer from ${peerAddress.slice(0, 8)}… sessionId=${offer.sessionId.slice(0, 8)}`,
    )

    const pc = new RTCPeerConnection({ iceServers: this.iceServers })
    this.swarmRtcPeers.set(peerAddress, pc)

    pc.addEventListener('connectionstatechange', () => {
      console.debug(`${TAG} [answerer←${peerAddress.slice(0, 8)}] connectionState=${pc.connectionState}`)
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        pc.close()
        this.swarmRtcPeers.delete(peerAddress)
      }
    })

    pc.addEventListener('datachannel', (event: RTCDataChannelEvent) => {
      const dc = event.channel
      dc.addEventListener('open', () => this.setupDataChannel(peerAddress, dc))
      dc.addEventListener('error', e => console.error(`${TAG} [answerer] dataChannel error`, e))
    })

    await pc.setRemoteDescription({ type: SignalType.OFFER, sdp: offer.sdp })
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    await this.waitForIceGatheringComplete(pc)

    const sdp = pc.localDescription?.sdp ?? ''
    const candidateCount = (sdp.match(/^a=candidate:/gm) || []).length

    if (this.stopped) {
      pc.close()
      this.swarmRtcPeers.delete(peerAddress)
      return
    }

    if (candidateCount === 0 || pc.connectionState === 'failed') {
      pc.close()
      this.swarmRtcPeers.delete(peerAddress)
      this.sentAnswerKeys.delete(key)
      console.debug(`${TAG} answerPeerOffer ${peerAddress.slice(0, 8)}… aborted — ICE failed before gathering`)
      return
    }

    const record: SignalRecord = {
      type: SignalType.ANSWER,
      fromAddress: this.ownAddress,
      toAddress: peerAddress,
      sessionId: offer.sessionId,
      timestamp: Date.now(),
      sdp,
    }

    await this.swarmSignal.writeRecord(record)
    console.debug(
      `${TAG} answer written → ${peerAddress.slice(0, 8)}… sessionId=${offer.sessionId.slice(0, 8)}`,
    )
  }

  private startSignalPoll(): void {
    console.debug(`${TAG} signal poll started (interval=${SIGNAL_POLL_INTERVAL_MS}ms)`)
    this.checkSignals()
    this.signalPollTimer = setInterval(() => this.checkSignals(), SIGNAL_POLL_INTERVAL_MS)
  }

  private async checkSignals(): Promise<void> {
    if (this.signalCheckInFlight || this.members.size === 0) return
    this.signalCheckInFlight = true
    try {
      await Promise.allSettled([...this.members.keys()].map(addr => this.checkPeerSignals(addr)))
    } finally {
      this.signalCheckInFlight = false
    }
  }

  private async checkPeerSignals(peerAddress: string): Promise<void> {
    if (peerAddress === this.ownAddress) return
    const pc = this.swarmRtcPeers.get(peerAddress)
    if (pc?.connectionState === 'connected') return

    const payload = await this.swarmSignal.read(peerAddress)
    if (!payload) return

    console.debug(
      `${TAG} signal feed for ${peerAddress.slice(0, 8)}… has ${payload.records.length} record(s)`,
    )
    for (const record of payload.records) {
      if (record.toAddress !== this.ownAddress) continue
      if (record.type === SignalType.OFFER) await this.handleOffer(peerAddress, record)
      else if (record.type === SignalType.ANSWER) await this.handleAnswer(peerAddress, record)
    }
  }

  private async handleOffer(peerAddress: string, record: SignalRecord): Promise<void> {
    if (Date.now() - record.timestamp > OFFER_MAX_AGE_MS) return
    if (this.swarmRtcPeers.has(peerAddress)) return
    if (this.sentAnswerKeys.has(`${peerAddress}:${record.sessionId}`)) return

    await this.answerPeerOffer(peerAddress, record)
  }

  private async handleAnswer(peerAddress: string, record: SignalRecord): Promise<void> {
    if (Date.now() - record.timestamp > OFFER_MAX_AGE_MS) return

    const pc = this.swarmRtcPeers.get(peerAddress)
    const expectedSession = this.pendingOfferSessions.get(peerAddress)

    if (!pc || pc.signalingState !== 'have-local-offer' || record.sessionId !== expectedSession) return

    try {
      await pc.setRemoteDescription({ type: SignalType.ANSWER, sdp: record.sdp })
      this.pendingOfferSessions.delete(peerAddress)
      console.debug(`${TAG} handshake complete with ${peerAddress.slice(0, 8)}…`)
    } catch (err) {
      console.error(`${TAG} setRemoteDescription failed:`, err)
    }
  }

  private setupDataChannel(peerAddress: string, channel: RTCDataChannel): void {
    console.debug(`${TAG} channel OPEN with ${peerAddress.slice(0, 8)}…`)
    channel.binaryType = 'arraybuffer'
    this.openChannels.set(peerAddress, channel)
    this.onPeersChange?.(this.openChannels.size)

    const initialState = Y.encodeStateAsUpdate(this.doc)
    channel.send(initialState as unknown as ArrayBuffer)

    const forwardUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin !== SWARM_RTC_ORIGIN && origin !== 'remote' && channel.readyState === 'open') {
        channel.send(update as unknown as ArrayBuffer)
      }
    }
    this.doc.on('update', forwardUpdate)

    channel.addEventListener('message', (event: MessageEvent) => {
      if (event.data instanceof ArrayBuffer) {
        Y.applyUpdate(this.doc, new Uint8Array(event.data), SWARM_RTC_ORIGIN)
      } else if (typeof event.data === 'string') {
        if (!this.handler) return

        try {
          this.handler(JSON.parse(event.data) as NotificationPayload)
        } catch (err) {
          console.error(`${TAG} onMessage parse failed:`, err)
        }
      }
    })

    channel.addEventListener('close', () => {
      this.doc.off('update', forwardUpdate)
      this.openChannels.delete(peerAddress)
      const pc = this.swarmRtcPeers.get(peerAddress)
      this.swarmRtcPeers.delete(peerAddress)
      pc?.close()
      this.onPeersChange?.(this.openChannels.size)
      console.debug(`${TAG} channel CLOSED with ${peerAddress.slice(0, 8)}…`)
      if (this.isInitiatorFor(peerAddress)) {
        this.scheduleReconnect(peerAddress, 'channel closed')
      }
    })
  }

  private scheduleReconnect(peerAddress: string, reason: string): void {
    if (this.pendingRetries.has(peerAddress)) return
    this.pendingRetries.add(peerAddress)
    console.debug(
      `${TAG} [initiator→${peerAddress.slice(0, 8)}] ${reason} — retrying in ${PEER_RETRY_TIMEOUT_MS}ms`,
    )
    setTimeout(() => {
      this.pendingRetries.delete(peerAddress)
      if (!this.stopped && !this.swarmRtcPeers.has(peerAddress)) {
        this.initiateConnectionTo(peerAddress).catch(err =>
          console.error(`${TAG} scheduleReconnect failed:`, err),
        )
      }
    }, PEER_RETRY_TIMEOUT_MS)
  }

  private waitForIceGatheringComplete(pc: RTCPeerConnection, timeoutMs = 5000): Promise<void> {
    return new Promise(resolve => {
      if (pc.iceGatheringState === 'complete') {
        resolve()
        return
      }

      // eslint-disable-next-line prefer-const
      let timer: ReturnType<typeof setTimeout>

      const onStateChange = () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timer)
          pc.removeEventListener('icegatheringstatechange', onStateChange)
          resolve()
        }
      }

      pc.addEventListener('icegatheringstatechange', onStateChange)
      timer = setTimeout(() => {
        pc.removeEventListener('icegatheringstatechange', onStateChange)
        resolve()
      }, timeoutMs)
    })
  }
}
