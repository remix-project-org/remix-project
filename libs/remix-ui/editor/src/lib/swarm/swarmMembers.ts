import { Bee, FeedIndex, PrivateKey, Topic } from '@ethersphere/bee-js'

import { PLACEHOLDER_STAMP, remove0x, retryAwaitableAsync } from './swarmUtils'

const TAG = '[SwarmMembers]'
const MEMBERS_KEY_SUFFIX = '_members_key'
const MEMBERS_FEED_SUFFIX = '_members'

function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return (
    error.message?.includes('Not Found') ||
    error.message?.includes('404') ||
    (error as { stack?: string }).stack?.includes('404') ||
    false
  )
}

export class SwarmMembers {
  private readonly bee: Bee
  private readonly signer: PrivateKey
  private readonly topic: Topic
  private readonly address: string
  private readonly stamp: string
  private currentIndex: bigint = BigInt(-1)
  private readonly memberMap: Map<string, string> = new Map()
  private readonly indices: Map<string, bigint> = new Map()

  constructor(rawTopic: string, beeUrl: string, stamp: string) {
    const keyBytes = Topic.fromString(rawTopic + MEMBERS_KEY_SUFFIX)
    this.signer = new PrivateKey(keyBytes.toUint8Array())
    this.address = this.signer.publicKey().address().toString()
    this.topic = Topic.fromString(rawTopic + MEMBERS_FEED_SUFFIX)
    this.bee = new Bee(beeUrl)
    this.stamp = stamp || PLACEHOLDER_STAMP
    console.log(`${TAG} consensus address: ${this.address}`)
  }

  register(address: string, username: string): boolean {
    if (this.memberMap.has(address)) return false
    this.memberMap.set(address, username)
    this.indices.set(address, BigInt(-1))
    return true
  }

  has(address: string): boolean {
    return this.memberMap.has(address)
  }

  all(): ReadonlyMap<string, string> {
    return new Map(this.memberMap)
  }

  lastIndex(address: string): bigint {
    return this.indices.get(address) ?? BigInt(-1)
  }

  setIndex(address: string, index: bigint): void {
    this.indices.set(address, index)
  }

  async read(): Promise<Map<string, string> | null> {
    try {
      const reader = this.bee.makeFeedReader(this.topic, this.address)
      const result = await reader.downloadPayload()
      this.currentIndex = result.feedIndex.toBigInt()
      return new Map(Object.entries(JSON.parse(result.payload.toUtf8()) as Record<string, string>))
    } catch (err) {
      if (!isNotFoundError(err)) console.error(`${TAG} read failed:`, err)
      return null
    }
  }

  async add(address: string, username: string): Promise<Map<string, string>> {
    const normalized = remove0x(address.toLowerCase())
    const reader = this.bee.makeFeedReader(this.topic, this.address)
    const writer = this.bee.makeFeedWriter(this.topic, this.signer)
    const MAX_CONFLICT_RETRIES = 3

    for (let attempt = 0; attempt < MAX_CONFLICT_RETRIES; attempt++) {
      let members: Map<string, string> = new Map()
      try {
        const result = await reader.downloadPayload()
        members = new Map(Object.entries(JSON.parse(result.payload.toUtf8()) as Record<string, string>))
        this.currentIndex = result.feedIndex.toBigInt()
      } catch (err) {
        if (!isNotFoundError(err)) console.error(`${TAG} add read failed:`, err)
        // 404: no feed yet — start fresh at index 0
      }

      if (members.has(normalized)) {
        console.log(`${TAG} add: ${normalized.slice(0, 8)}… already in list`)
        return members
      }

      members.set(normalized, username)
      const nextIndex = this.currentIndex === BigInt(-1) ? BigInt(0) : this.currentIndex + BigInt(1)

      try {
        await writer.uploadPayload(this.stamp, JSON.stringify(Object.fromEntries(members)), {
          index: FeedIndex.fromBigInt(nextIndex),
          deferred: false,
        })
        this.currentIndex = nextIndex
        console.log(`${TAG} add: wrote index ${nextIndex}, total members: ${members.size}`)
      } catch (err) {
        console.error(`${TAG} add write failed:`, err)
        return members
      }

      // Verify: read back to detect last-write-wins conflicts
      try {
        const verified = await retryAwaitableAsync(async () => {
          const r = await reader.downloadPayload({ index: FeedIndex.fromBigInt(nextIndex) })
          return new Map(Object.entries(JSON.parse(r.payload.toUtf8()) as Record<string, string>))
        }, 3, 500)

        if (verified.has(normalized)) {
          console.log(`${TAG} add: verified — ${Array.from(verified.keys()).map(a => a.slice(0, 8)).join(', ')}`)
          return verified
        }

        // Own address was overwritten by a simultaneous write — retry with fresh read
        console.log(`${TAG} add: conflict on attempt ${attempt + 1}, retrying`)
      } catch {
        console.log(`${TAG} add: verify timed out, using optimistic list`)
        return members
      }
    }

    console.log(`${TAG} add: could not confirm own address after ${MAX_CONFLICT_RETRIES} attempts`)
    return (await this.read()) ?? new Map([[normalized, username]])
  }
}
