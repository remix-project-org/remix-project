import { Bee, FeedIndex, PrivateKey, Topic } from '@ethersphere/bee-js'

const TAG = '[SwarmSignal]'
const SIGNAL_FEED_SUFFIX = '_signal'

export enum SignalType {
  OFFER = 'offer',
  ANSWER = 'answer',
}

export interface SignalRecord {
  type: SignalType
  fromAddress: string
  toAddress: string
  sessionId: string
  timestamp: number
  sdp: string
}

export interface SignalFeedPayload {
  records: SignalRecord[]
}

function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return (
    error.message?.includes('Not Found') ||
    error.message?.includes('404') ||
    (error as { stack?: string }).stack?.includes('404') ||
    false
  )
}

export class SwarmSignal {
  private readonly bee: Bee
  private readonly ownSigner: PrivateKey
  private readonly ownAddress: string
  private readonly topic: Topic
  private readonly stamp: string
  private currentIndex: bigint = BigInt(-1)
  private readonly peerLastIndexes: Map<string, bigint> = new Map()
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(rawTopic: string, beeUrl: string, ownSigner: PrivateKey, stamp: string) {
    this.topic = Topic.fromString(rawTopic + SIGNAL_FEED_SUFFIX)
    this.ownSigner = ownSigner
    this.ownAddress = ownSigner.publicKey().address().toString()
    this.bee = new Bee(beeUrl)
    this.stamp = stamp
  }

  async read(peerAddress: string): Promise<SignalFeedPayload | null> {
    const reader = this.bee.makeFeedReader(this.topic, peerAddress)
    const lastIndex = this.peerLastIndexes.get(peerAddress)

    try {
      const result = await reader.downloadPayload(
        lastIndex === undefined ? undefined : { index: FeedIndex.fromBigInt(lastIndex + BigInt(1)) },
      )
      this.peerLastIndexes.set(peerAddress, result.feedIndex.toBigInt())
      return JSON.parse(result.payload.toUtf8()) as SignalFeedPayload
    } catch (err) {
      if (!isNotFoundError(err)) {
        console.error(`${TAG} read(${peerAddress.slice(0, 8)}…) failed:`, err)
      }
      return null
    }
  }

  async writeRecord(record: SignalRecord): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      const current = await this.readOwn()
      const filtered = current.records.filter(r => !(r.type === record.type && r.toAddress === record.toAddress))
      await this.writePayload({ records: [...filtered, record]})
      console.debug(
        `${TAG} writeRecord type=${record.type} to=${record.toAddress.slice(0, 8)}… sessionId=${record.sessionId.slice(0, 8)}`,
      )
    })
    return this.writeQueue
  }

  async clearOwn(): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      const current = await this.readOwn()
      if (current.records.length === 0) return
      await this.writePayload({ records: []})
      console.debug(`${TAG} clearOwn: cleared ${current.records.length} stale record(s)`)
    })
    return this.writeQueue
  }

  private async readOwn(): Promise<SignalFeedPayload> {
    try {
      const reader = this.bee.makeFeedReader(this.topic, this.ownAddress)
      // Use explicit index when known — avoids Bee node "latest" cache returning a stale value
      const result = await reader.downloadPayload(
        this.currentIndex >= BigInt(0) ? { index: FeedIndex.fromBigInt(this.currentIndex) } : undefined,
      )
      this.currentIndex = result.feedIndex.toBigInt()
      return JSON.parse(result.payload.toUtf8()) as SignalFeedPayload
    } catch (err) {
      if (!isNotFoundError(err)) {
        console.error(`${TAG} readOwn failed:`, err)
      }
      return { records: []}
    }
  }

  private async writePayload(payload: SignalFeedPayload): Promise<void> {
    const nextIndex = this.currentIndex === BigInt(-1) ? BigInt(0) : this.currentIndex + BigInt(1)
    const writer = this.bee.makeFeedWriter(this.topic, this.ownSigner)
    try {
      await writer.uploadPayload(this.stamp, JSON.stringify(payload), {
        index: FeedIndex.fromBigInt(nextIndex),
        deferred: false,
      })
      this.currentIndex = nextIndex
      console.debug(`${TAG} writePayload ✓ index: ${nextIndex}`)
    } catch (err) {
      console.error(`${TAG} writePayload failed:`, err)
    }
  }
}
