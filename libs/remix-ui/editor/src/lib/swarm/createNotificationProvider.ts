import * as Y from 'yjs'
import { PrivateKey } from '@ethersphere/bee-js'
import { WebrtcProvider } from 'y-webrtc'

import type { NotificationProvider, NotificationTransport, SwarmInfraSettings } from './swarmInterfaces'
import { SwarmRtcNotificationProvider } from './swarmRtcNotificationProvider'
import { WebrtcNotificationProvider } from './webrtcNotificationProvider'
import { remove0x } from './swarmUtils'

export function createWebrtcNotificationProvider(
  provider: WebrtcProvider,
  ownAddress: string,
  nickname: string,
): NotificationProvider {
  return new WebrtcNotificationProvider(provider, ownAddress, nickname)
}

export function createNotificationProvider(
  transport: NotificationTransport,
  swarmSettings?: SwarmInfraSettings,
  webrtcProvider?: WebrtcProvider,
  doc?: Y.Doc,
  discoveryUrl?: string
): NotificationProvider {
  switch (transport) {
  case 'webrtc': {
    if (!webrtcProvider) {
      throw new Error('WebRTC provider required for webrtc transport')
    }
    if (!swarmSettings) {
      throw new Error('Swarm infra settings required for webrtc transport')
    }
    const signer = new PrivateKey(remove0x(swarmSettings.user.walletPrivateKey))
    const ownAddress = signer.publicKey().address().toString()
    const nickname = swarmSettings.user.nickname || ownAddress.slice(0, 8)
    return createWebrtcNotificationProvider(webrtcProvider, ownAddress, nickname)
  }

  case 'swarm-rtc': {
    if (!doc) {
      throw new Error('Y.Doc required for swarm-rtc transport')
    }
    if (!swarmSettings) {
      throw new Error('Swarm infra settings required for swarm-rtc transport')
    }
    const { walletPrivateKey } = swarmSettings.user
    const { beeUrl, stamp, topic } = swarmSettings.infra
    const docTopic = topic + '_doc'
    return new SwarmRtcNotificationProvider(doc, beeUrl, walletPrivateKey, stamp ?? '', docTopic, discoveryUrl)
  }

  default:
    throw new Error(`Unknown notification transport: ${transport}`)
  }
}
