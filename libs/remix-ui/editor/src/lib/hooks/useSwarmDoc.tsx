import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import { MonacoBinding } from 'y-monaco'

import type { SwarmDocSettings } from './swarmInterfaces'
import { SwarmPersistence } from './swarmPersistence'
import { WebrtcNotificationProvider } from './webrtcNotificationProvider'

export type { SwarmDocSettings, SwarmInfraSettings, NotificationTransport } from './swarmInterfaces'

const DEFAULT_SIGNALING_SERVER_URL = 'ws://localhost:4444'

interface SessionState {
  doc: Y.Doc
  provider: WebrtcProvider
  swarmPersistence?: SwarmPersistence
}

const _sessions = new Map<string, SessionState>()

function destroySession(id: string) {
  const session = _sessions.get(id)

  if (!session) return

  session.swarmPersistence?.stop()
  session.provider?.destroy()
  session.doc?.destroy()
  _sessions.delete(id)
}

export function useSwarmDoc(settings: SwarmDocSettings | null, editor: any, currentFile: string, model: any) {
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null)
  const [provider, setProvider] = useState<WebrtcProvider | null>(null)
  const bindingRef = useRef<MonacoBinding | null>(null)
  const [peersCount, setPeersCount] = useState(0)

  useEffect(() => {
    if (!settings) return
    const { sessionId, signalingUrl, swarm, notification } = settings

    destroySession(sessionId)

    // Persistence layer: SwarmPersistence owns the Y.Doc when swarm config is present
    let swarmPersistence: SwarmPersistence | undefined
    const doc = swarm ? (swarmPersistence = new SwarmPersistence(swarm)).doc : new Y.Doc()

    // Real-time CRDT sync — always active when a sessionId is provided
    const prov = new WebrtcProvider(sessionId, doc, {
      signaling: [signalingUrl ?? DEFAULT_SIGNALING_SERVER_URL],
    })

    // Notification layer: independent of persistence, controls how peers signal each
    // other about new Swarm snapshots. Decoupled so a future 'swarm' transport can
    // replace WebRTC here without changing the persistence layer.
    if (swarmPersistence) {
      const transport = notification ?? 'webrtc'
      if (transport === 'webrtc') {
        swarmPersistence.start(new WebrtcNotificationProvider(prov))
      }
    }

    _sessions.set(sessionId, { doc, provider: prov, swarmPersistence })

    prov.on('peers', ({ webrtcPeers }: any) => setPeersCount(webrtcPeers.length))

    setYdoc(doc)
    setProvider(prov)

    return () => {
      bindingRef.current?.destroy()
      bindingRef.current = null
      destroySession(sessionId)
      setYdoc(null)
      setProvider(null)
      setPeersCount(0)
    }
  }, [settings?.sessionId, settings?.signalingUrl, settings?.swarm?.infra.topic, settings?.notification])

  useEffect(() => {
    if (!ydoc || !editor || !model || !currentFile) return

    bindingRef.current?.destroy()
    bindingRef.current = null

    const yText = ydoc.getText(currentFile)

    const otherPeers = provider
      ? [...provider.awareness.getStates().keys()].filter(id => id !== provider.awareness.clientID)
      : []

    if (yText.length === 0 && otherPeers.length === 0) {
      const content = model.getValue()
      if (content) ydoc.transact(() => yText.insert(0, content))
    }

    bindingRef.current = new MonacoBinding(yText, model, new Set([editor]), undefined) // TODO: cursor decorations

    return () => {
      bindingRef.current?.destroy()
      bindingRef.current = null
    }
  }, [ydoc, provider, editor, currentFile, model])

  return { peersCount, connected: peersCount > 0 }
}
