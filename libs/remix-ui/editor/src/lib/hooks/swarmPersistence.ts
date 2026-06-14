import { Bee, FeedIndex, PrivateKey, Topic } from '@ethersphere/bee-js'
import { MessageData, MessageType, Options, readSingleComment, writeCommentToIndex } from '@solarpunkltd/comment-system'
import { v4 as uuidv4 } from 'uuid'
import * as Y from 'yjs'

import { NotificationProvider, SwarmInfraSettings } from './swarmInterfaces'
import { SwarmManifest } from './swarmManifest'
import { PLACEHOLDER_STAMP, decode, encode, indexStrToBigint, remove0x, retryAwaitableAsync } from './swarmUtils'

export type { SwarmInfraSettings } from './swarmInterfaces'

const TAG = '[SwarmPersistence]'
const DEBOUNCE_MS = 500

export class SwarmPersistence {
  public readonly doc: Y.Doc

  private userAddress: string // User's wallet address (identity)
  private feedAddress: string // Derived feed address (where snapshots are stored)
  private feedSigner: PrivateKey // Derived signer for writing to feed
  private ownIndex: bigint = BigInt(-1)
  private docTopic: string // infra.topic + '_doc' (for feed identifiers)
  private docTopicHash: string // Hashed doc topic (for notifications)
  private snapshotOptions: Options
  private memberOptions: Map<string, Options> = new Map()// keyed by userAddress
  private memberIndices: Map<string, bigint> = new Map() // keyed by userAddress
  private beeApiUrl: string
  private stampId: string
  private infraTopic: string // Original infra.topic (for feed key derivation)
  private manifest: SwarmManifest
  private notifProvider: NotificationProvider | null = null

  private pendingUpdates: Uint8Array[] = []
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private publishInFlight = false
  private fetchProcessRunning = false

  constructor(settings: SwarmInfraSettings) {
    this.doc = new Y.Doc()
    // User's wallet for identity and message signing
    const userWallet = new PrivateKey(remove0x(settings.user.walletPrivateKey))
    this.userAddress = userWallet.publicKey().address().toString()

    this.infraTopic = settings.infra.topic
    this.beeApiUrl = settings.infra.beeUrl
    this.stampId = settings.infra.stamp || PLACEHOLDER_STAMP
    // Derive deterministic feed key for this user's snapshot feed// Pattern: hash(infraTopic + '_feed_' + userAddress) → feedPrivateKey
    const feedKeyBytes = Topic.fromString(this.infraTopic + '_feed_' + this.userAddress)
    this.feedSigner = new PrivateKey(feedKeyBytes.toUint8Array())
    this.feedAddress = this.feedSigner.publicKey().address().toString()

    this.docTopic = this.infraTopic + '_doc'
    this.docTopicHash = Topic.fromString(this.docTopic).toString()
    // Feed identifier: topic + feedAddress (not userAddress)
    const ownIdentifier = Topic.fromString(this.docTopic + this.feedAddress).toString()
    this.snapshotOptions = {
      identifier: ownIdentifier,
      address: this.feedAddress,
      beeApiUrl: settings.infra.beeUrl,
      stamp: this.stampId,
      signer: this.feedSigner,
    }

    this.manifest = new SwarmManifest(this.docTopic, settings.infra.beeUrl, this.stampId)

    const members = (settings.infra.members || [])
      .map(addr => remove0x(addr.toLowerCase()))
      .filter(addr => addr !== this.userAddress)

    for (const addr of members) {
      this.registerMember(addr)
    }

    console.log(`${TAG} userAddress: ${this.userAddress}`)
    console.log(`${TAG} feedAddress: ${this.feedAddress}`)
    console.log(`${TAG} topic: ${this.docTopic}`)
  }

  private registerMember(userAddress: string): void {
    if (this.memberOptions.has(userAddress)) return
    // Derive the feed address for this user (same pattern as own feed)
    const feedKeyBytes = Topic.fromString(this.infraTopic + '_feed_' + userAddress)
    const feedAddress = new PrivateKey(feedKeyBytes.toUint8Array()).publicKey().address().toString()

    const identifier = Topic.fromString(this.docTopic + feedAddress).toString()
    this.memberIndices.set(userAddress, BigInt(-1))
    this.memberOptions.set(userAddress, {
      identifier,
      address: feedAddress,
      beeApiUrl: this.beeApiUrl,
      stamp: this.stampId,
    })
    this.notifProvider?.addMember?.(userAddress)
    console.log(`${TAG} registerMember: user=${userAddress.slice(0, 8)}… feed=${feedAddress.slice(0, 8)}…`)
  }

  start(notifProvider: NotificationProvider): void {
    this.notifProvider = notifProvider

    for (const addr of this.memberOptions.keys()) {
      notifProvider.addMember?.(addr)
    }

    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return
      this.pendingUpdates.push(update)
      if (this.debounceTimer) clearTimeout(this.debounceTimer)
      this.debounceTimer = setTimeout(() => {
        const captured = [...this.pendingUpdates]
        this.pendingUpdates = []
        this.debounceTimer = null
        this.publishSnapshot(captured)
      }, DEBOUNCE_MS)
    })

    this.init()
    this.startFetchProcess()
  }

  stop(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.notifProvider?.unsubscribe()
    this.fetchProcessRunning = false
    this.doc.destroy()
  }

  private applyYjsBytes(b64: string, label: string): void {
    try {
      Y.applyUpdate(this.doc, decode(b64), 'remote')
    } catch (err) {
      console.error(`${TAG} applyYjsBytes [${label}] failed:`, err)
    }
  }

  private async publishSnapshot(capturedUpdates: Uint8Array[]): Promise<void> {
    if (this.publishInFlight) {
      this.pendingUpdates.push(...capturedUpdates)
      return
    }

    this.publishInFlight = true
    try {
      const snapshot = encode(Y.encodeStateAsUpdate(this.doc))
      const delta = encode(Y.mergeUpdates(capturedUpdates))
      const nextIndex = this.ownIndex === BigInt(-1) ? BigInt(0) : this.ownIndex + BigInt(1)

      console.log(`${TAG} publishSnapshot → index: ${nextIndex}`)

      const messageObj: MessageData = {
        id: uuidv4(),
        username: this.userAddress,
        address: this.userAddress,
        topic: this.docTopicHash,
        signature: '',
        timestamp: Date.now(),
        type: MessageType.TEXT,
        message: snapshot,
        index: FeedIndex.fromBigInt(nextIndex).toString(),
      }

      await writeCommentToIndex(messageObj, FeedIndex.fromBigInt(nextIndex), this.snapshotOptions)
      this.ownIndex = nextIndex
      console.log(`${TAG} publishSnapshot ✓ index: ${nextIndex}`)

      // Notification carries userAddress (identity), not feedAddress
      this.notifProvider?.publish({
        topic: this.docTopicHash,
        author: this.userAddress,
        feedIndex: Number(nextIndex),
        deltaRef: '',
        delta,
      })
    } catch (err) {
      console.error(`${TAG} publishSnapshot failed:`, err)
    } finally {
      this.publishInFlight = false
      if (this.pendingUpdates.length > 0) {
        const next = [...this.pendingUpdates]
        this.pendingUpdates = []
        this.publishSnapshot(next)
      }
    }
  }

  private async validateStamps(): Promise<void> {
    if (this.stampId === PLACEHOLDER_STAMP) return
    const bee = new Bee(this.beeApiUrl)
    const batches = await bee.getPostageBatches()
    const usable = batches.filter((s: any) => s.usable)
    const found = usable.find((s: any) => s.batchID?.toString() === this.stampId)
    if (!found) throw new Error(`Stamp ${this.stampId} is not usable`)
  }

  private async init(): Promise<void> {
    console.log(`${TAG} init: starting`)
    try {
      await this.validateStamps()
    } catch (err) {
      console.error(`${TAG} validateStamps failed:`, err)
      return
    }
    await Promise.allSettled([this.initOwnIndex(), this.initManifest()])
    console.log(`${TAG} init: done — ownIndex: ${this.ownIndex}`)
  }

  private async initOwnIndex(): Promise<void> {
    const comment = await retryAwaitableAsync(
      () => readSingleComment(undefined, this.snapshotOptions),
      5,
      1000,
    )
    const parsedIx = indexStrToBigint(comment?.index)
    console.log(`${TAG} initOwnIndex: latest on Swarm = ${parsedIx ?? 'none'}`)

    if (comment && parsedIx !== undefined && !FeedIndex.fromBigInt(parsedIx).equals(FeedIndex.MINUS_ONE)) {
      this.ownIndex = parsedIx
      this.applyYjsBytes(comment.message, `own idx=${parsedIx}`)
    }
  }

  private async initManifest(): Promise<void> {// Manifest stores user addresses (wallet addresses), not feed addresses
    const manifestMembers = await this.manifest.addMember(this.userAddress)
    for (const addr of manifestMembers) {
      if (addr !== this.userAddress) this.registerMember(addr)
    }
    // Join notification carries userAddress
    this.notifProvider?.publish({
      topic: this.docTopicHash,
      author: this.userAddress,
      feedIndex: -1,
      deltaRef: '',
    })
    console.log(`${TAG} initManifest: join sent, ${this.memberOptions.size} peers`)

    await Promise.allSettled(
      [...this.memberOptions.keys()].map(addr => this.fetchLatestFromMember(addr)),
    )
  }

  private async fetchLatestFromMember(
    userAddress: string,
    targetIndex?: bigint,
    delta?: string,
  ): Promise<void> {
    const options = this.memberOptions.get(userAddress)
    if (!options) return

    const lastKnown = this.memberIndices.get(userAddress) ?? BigInt(-1)

    if (targetIndex !== undefined && delta !== undefined) {
      if (targetIndex <= lastKnown) return
      this.memberIndices.set(userAddress, targetIndex)
      this.applyYjsBytes(delta, `${userAddress.slice(0, 8)} delta idx=${targetIndex}`)
      return
    }

    try {
      let comment: Awaited<ReturnType<typeof readSingleComment>>
      let targetIx: bigint

      if (targetIndex !== undefined) {
        if (targetIndex <= lastKnown) return
        comment = await retryAwaitableAsync(
          () => readSingleComment(FeedIndex.fromBigInt(targetIndex), options),
          5,
          1000,
        )
        if (!comment) return
        targetIx = targetIndex
      } else {
        comment = await readSingleComment(undefined, options)
        const parsedIx = indexStrToBigint(comment?.index)
        if (!comment || parsedIx === undefined || parsedIx <= lastKnown) return
        targetIx = parsedIx
      }

      this.memberIndices.set(userAddress, targetIx)
      this.applyYjsBytes(comment.message, `${userAddress.slice(0, 8)} snapshot idx=${targetIx}`)
    } catch (err) {
      console.error(`${TAG} fetchLatestFromMember(${userAddress.slice(0, 8)}) failed:`, err)
    }
  }

  private startFetchProcess(): void {
    if (this.fetchProcessRunning) return
    this.fetchProcessRunning = true

    this.notifProvider?.subscribe(this.docTopicHash, payload => {
      const author = remove0x(payload.author.toLowerCase())
      if (author === this.userAddress) return

      if (payload.feedIndex === -1) {
        console.log(`${TAG} notification: join from ${author.slice(0, 8)}…`)
        this.registerMember(author)
        this.fetchLatestFromMember(author)
        return
      }

      console.log(`${TAG} notification: author=${author.slice(0, 8)}… feedIndex=${payload.feedIndex}`)
      this.fetchLatestFromMember(author, BigInt(payload.feedIndex), payload.delta)
    })
  }
}
