import { Bee, FeedIndex, PrivateKey, Topic } from '@ethersphere/bee-js'
import { MessageData, MessageType, Options, readSingleComment, writeCommentToIndex } from '@solarpunkltd/comment-system'
import { v4 as uuidv4 } from 'uuid'
import * as Y from 'yjs'

import { NotificationProvider, SwarmInfraSettings } from './swarmInterfaces'
import { SwarmMembers } from './swarmMembers'
import { PLACEHOLDER_STAMP, decode, encode, indexStrToBigint, remove0x, retryAwaitableAsync } from './swarmUtils'

export type { SwarmInfraSettings } from './swarmInterfaces'

const TAG = '[SwarmDoc]'
const DEBOUNCE_MS = 500
const SNAPSHOT_FEED_SUFFIX = '_feed_'
const DOC_FEED_SUFFIX = '_doc'

export class SwarmDoc {
  public readonly doc: Y.Doc

  private userAddress: string
  private nickname: string
  private feedAddress: string
  private feedSigner: PrivateKey
  private ownIndex: bigint = BigInt(-1)
  private docTopic: string
  private docTopicHash: string
  private snapshotOptions: Options
  private memberOptions: Map<string, Options> = new Map()
  private beeApiUrl: string
  private stampId: string
  private infraTopic: string
  private swarmMembers: SwarmMembers
  private notifProvider: NotificationProvider | null = null

  private pendingUpdates: Uint8Array[] = []
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private memberRefreshTimer: ReturnType<typeof setInterval> | null = null
  private publishInFlight = false
  private fetchProcessRunning = false

  constructor(settings: SwarmInfraSettings) {
    this.doc = new Y.Doc()
    const userWallet = new PrivateKey(remove0x(settings.user.walletPrivateKey))
    this.userAddress = userWallet.publicKey().address().toString()
    this.nickname = settings.user.nickname || this.userAddress.slice(0, 8)

    this.infraTopic = settings.infra.topic
    this.beeApiUrl = settings.infra.beeUrl
    this.stampId = settings.infra.stamp || PLACEHOLDER_STAMP
    const feedKeyBytes = Topic.fromString(this.infraTopic + SNAPSHOT_FEED_SUFFIX + this.userAddress)
    this.feedSigner = new PrivateKey(feedKeyBytes.toUint8Array())
    this.feedAddress = this.feedSigner.publicKey().address().toString()

    this.docTopic = this.infraTopic + DOC_FEED_SUFFIX
    this.docTopicHash = Topic.fromString(this.docTopic).toString()
    const ownIdentifier = Topic.fromString(this.docTopic + this.feedAddress).toString()
    this.snapshotOptions = {
      identifier: ownIdentifier,
      address: this.feedAddress,
      beeApiUrl: settings.infra.beeUrl,
      stamp: this.stampId,
      signer: this.feedSigner,
    }

    this.swarmMembers = new SwarmMembers(this.docTopic, settings.infra.beeUrl, this.stampId)

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

  private registerMember(userAddress: string, username?: string): void {
    const isNew = this.swarmMembers.register(userAddress, username || userAddress.slice(0, 8))
    if (!isNew) return

    if (this.memberRefreshTimer && this.memberOptions.size > 0) {
      clearInterval(this.memberRefreshTimer)
      this.memberRefreshTimer = null
    }

    const feedKeyBytes = Topic.fromString(this.infraTopic + SNAPSHOT_FEED_SUFFIX + userAddress)
    const feedAddress = new PrivateKey(feedKeyBytes.toUint8Array()).publicKey().address().toString()

    const identifier = Topic.fromString(this.docTopic + feedAddress).toString()
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
    if (this.memberRefreshTimer) {
      clearInterval(this.memberRefreshTimer)
      this.memberRefreshTimer = null
    }
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
        username: this.nickname,
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

      this.notifProvider?.publish({
        topic: this.docTopicHash,
        author: this.userAddress,
        feedIndex: Number(nextIndex),
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
    await Promise.allSettled([this.initOwnIndex(), this.initMembers()])
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

  private async initMembers(): Promise<void> {
    const allMembers = await this.swarmMembers.add(this.userAddress, this.nickname)
    for (const [addr, username] of allMembers) {
      if (addr !== this.userAddress) this.registerMember(addr, username)
    }

    this.notifProvider?.publish({
      topic: this.docTopicHash,
      author: this.userAddress,
      feedIndex: -1,
      username: this.nickname,
    })
    console.log(`${TAG} initMembers: join sent, ${this.memberOptions.size} peers`)

    await Promise.allSettled(
      [...this.memberOptions.keys()].map(addr => this.fetchLatestFromMember(addr)),
    )

    if (this.memberOptions.size === 0) {
      this.memberRefreshTimer = setInterval(() => this.refreshMembers(), 10_000)
    }
  }

  private async refreshMembers(): Promise<void> {
    const members = await this.swarmMembers.read()
    if (!members) return
    for (const [addr, username] of members) {
      if (addr !== this.userAddress) this.registerMember(addr, username)
    }
    if (this.memberOptions.size > 0) {
      await Promise.allSettled(
        [...this.memberOptions.keys()].map(addr => this.fetchLatestFromMember(addr)),
      )
    }
  }

  private async fetchLatestFromMember(
    userAddress: string,
    targetIndex?: bigint,
    delta?: string,
  ): Promise<void> {
    const options = this.memberOptions.get(userAddress)
    if (!options) return

    const lastKnown = this.swarmMembers.lastIndex(userAddress)

    if (targetIndex !== undefined && delta !== undefined) {
      if (targetIndex <= lastKnown) return
      this.swarmMembers.setIndex(userAddress, targetIndex)
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

      this.swarmMembers.setIndex(userAddress, targetIx)
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
        this.registerMember(author, payload.username)
        this.fetchLatestFromMember(author)
        return
      }

      console.log(`${TAG} notification: author=${author.slice(0, 8)}… feedIndex=${payload.feedIndex}`)
      this.fetchLatestFromMember(author, BigInt(payload.feedIndex), payload.delta)
    })
  }
}
