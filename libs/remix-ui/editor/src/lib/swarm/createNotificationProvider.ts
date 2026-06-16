import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'

import type { NotificationProvider, NotificationTransport, SwarmInfraSettings } from './swarmInterfaces'
import { SwarmRtcNotificationProvider } from './swarmRtcNotificationProvider'
import { WebrtcNotificationProvider } from './webrtcNotificationProvider'

export function createWebrtcNotificationProvider(provider: WebrtcProvider): NotificationProvider {
  return new WebrtcNotificationProvider(provider)
}

export function createSwarmRtcNotificationProvider(doc: Y.Doc, settings: SwarmInfraSettings): NotificationProvider {
  return new SwarmRtcNotificationProvider(
    doc,
    settings.infra.beeUrl,
    settings.user.walletPrivateKey,
    settings.infra.stamp || '',
    settings.infra.topic,
  )
}

export function createNotificationProvider(
  transport: NotificationTransport,
  swarmSettings?: SwarmInfraSettings,
  webrtcProvider?: WebrtcProvider,
  doc?: Y.Doc,
): NotificationProvider {
  switch (transport) {
  case 'webrtc':
    if (!webrtcProvider) {
      throw new Error('WebRTC provider required for webrtc transport')
    }
    return createWebrtcNotificationProvider(webrtcProvider)

  case 'swarm-rtc':
    if (!swarmSettings || !doc) {
      throw new Error('Swarm infra settings and Y.Doc required for swarm-rtc transport')
    }
    return createSwarmRtcNotificationProvider(doc, swarmSettings)

  default:
    throw new Error(`Unknown notification transport: ${transport}`)
  }
}
