import { FeedIndex, PrivateKey, Topic } from '@ethersphere/bee-js'
import { MessageData, MessageType, Options, readSingleComment, writeCommentToIndex } from '@solarpunkltd/comment-system'
import { v4 as uuidv4 } from 'uuid'

import { PLACEHOLDER_STAMP, indexStrToBigint, remove0x, retryAwaitableAsync } from './swarmUtils'

const TAG = '[SwarmManifest]'

export class SwarmManifest {
  private readonly options: Options
  private readonly identifier: string

  constructor(rawTopic: string, beeUrl: string, stamp: string) {
    const keyBytes = Topic.fromString(rawTopic + '_manifest_key')
    const consensusKey = new PrivateKey(keyBytes.toUint8Array())
    const address = consensusKey.publicKey().address().toString()
    this.identifier = Topic.fromString(rawTopic + '_manifest').toString()

    this.options = {
      identifier: this.identifier,
      address,
      beeApiUrl: beeUrl,
      stamp: stamp || PLACEHOLDER_STAMP,
      signer: consensusKey,
    }

    console.log(`${TAG} consensus address: ${address}`)
  }

  async read(): Promise<string[]> {
    try {
      const comment = await readSingleComment(undefined, this.options)
      if (!comment?.message) return []
      return JSON.parse(comment.message) as string[]
    } catch {
      return []
    }
  }

  async addMember(address: string): Promise<string[]> {
    const normalized = remove0x(address.toLowerCase())
    let members: string[] = []
    let currentIndex = BigInt(-1)

    try {
      const comment = await readSingleComment(undefined, this.options)
      if (comment?.message) {
        members = JSON.parse(comment.message) as string[]
        const parsedIx = indexStrToBigint(comment.index)
        if (parsedIx !== undefined) currentIndex = parsedIx
      }
    } catch {
      // No manifest yet — start fresh
    }

    if (members.includes(normalized)) {
      console.log(`${TAG} addMember: ${normalized.slice(0, 8)} already in manifest`)
      return members
    }

    const nextMembers = [...members, normalized]
    const nextIndex = currentIndex === BigInt(-1) ? BigInt(0) : currentIndex + BigInt(1)

    const messageObj: MessageData = {
      id: uuidv4(),
      username: normalized,
      address: normalized,
      topic: this.identifier,
      signature: '',
      timestamp: Date.now(),
      type: MessageType.TEXT,
      message: JSON.stringify(nextMembers),
      index: FeedIndex.fromBigInt(nextIndex).toString(),
    }

    try {
      await writeCommentToIndex(messageObj, FeedIndex.fromBigInt(nextIndex), this.options)
    } catch (err) {
      console.error(`${TAG} addMember write failed:`, err)
      return members
    }

    const verified = await retryAwaitableAsync(
      () => readSingleComment(FeedIndex.fromBigInt(nextIndex), this.options),
      5,
      1000,
    )

    if (verified?.message) {
      try {
        return JSON.parse(verified.message) as string[]
      } catch {
        // parse error — fall through to optimistic
      }
    }

    return nextMembers
  }
}
