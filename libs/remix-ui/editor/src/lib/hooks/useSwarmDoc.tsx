import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import { MonacoBinding } from 'y-monaco'

import type { SwarmDocSettings } from '../swarm/swarmInterfaces'
import { SwarmDoc } from '../swarm/swarmDoc'
import { createNotificationProvider } from '../swarm/createNotificationProvider'
import { DEFAULT_SIGNALING_SERVER_URL } from '../swarm/utils'

export type { SwarmDocSettings, SwarmInfraSettings, NotificationTransport } from '../swarm/swarmInterfaces'

interface SessionState {
  doc: Y.Doc
  provider?: WebrtcProvider
  swarmDoc?: SwarmDoc
}

const _sessions = new Map<string, SessionState>()

function destroySession(id: string) {
  const session = _sessions.get(id)
  if (!session) return

  session.swarmDoc?.stop()
  session.provider?.destroy()
  session.doc?.destroy()
  _sessions.delete(id)
}

export function useSwarmDoc(settings: SwarmDocSettings | null, editor: any, currentFile: string, model: any) {
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null)
  const [provider, setProvider] = useState<WebrtcProvider | null>(null)
  const bindingRef = useRef<MonacoBinding | null>(null)
  const [peersCount, setPeersCount] = useState(0)
  const [peers, setPeers] = useState<{ address: string; nickname: string }[]>([])
  const [initDone, setInitDone] = useState(false)

  useEffect(() => {
    if (!settings) return
    const { sessionId, stunUrl, signalingUrl, swarmInfra, notification } = settings
    const transport = notification ?? 'webrtc'

    destroySession(sessionId)
    setInitDone(false)

    let swarmDoc: SwarmDoc | undefined
    let doc: Y.Doc

    if (swarmInfra) {
      swarmDoc = new SwarmDoc(swarmInfra)
      doc = swarmDoc.doc
    } else {
      doc = new Y.Doc()
    }

    let prov: WebrtcProvider | undefined
    let discoveryUrl = stunUrl

    if (transport === 'webrtc') {
      discoveryUrl = signalingUrl
      prov = new WebrtcProvider(sessionId, doc, {
        signaling: [discoveryUrl ?? DEFAULT_SIGNALING_SERVER_URL],
      })
      prov.on('peers', ({ webrtcPeers }: any) => setPeersCount(webrtcPeers.length))
    }

    if (swarmDoc) {
      const notifProvider = createNotificationProvider(transport, swarmInfra, prov, doc, discoveryUrl)
      notifProvider.onPeersChange = (count) => setPeersCount(count)
      swarmDoc.onMembersChange = (p) => setPeers(p)
      swarmDoc.start(notifProvider, () => setInitDone(true))
    } else {
      setInitDone(true)
    }

    _sessions.set(sessionId, { doc, provider: prov, swarmDoc })

    setYdoc(doc)
    setProvider(prov ?? null)

    return () => {
      bindingRef.current?.destroy()
      bindingRef.current = null
      destroySession(sessionId)
      setYdoc(null)
      setProvider(null)
      setPeersCount(0)
      setPeers([])
      setInitDone(false)
    }
  }, [settings?.sessionId, settings?.signalingUrl, settings?.stunUrl ,settings?.swarmInfra?.infra.topic, settings?.notification])

  useEffect(() => {
    if (!ydoc || !editor || !model || !currentFile || !initDone) return

    bindingRef.current?.destroy()
    bindingRef.current = null

    const yText = ydoc.getText(currentFile)

    if (yText.length === 0) {
      const content = model.getValue()
      if (content) ydoc.transact(() => yText.insert(0, content))
    }

    bindingRef.current = new MonacoBinding(yText, model, new Set([editor]), undefined) // TODO: cursor decorations

    return () => {
      bindingRef.current?.destroy()
      bindingRef.current = null
    }
  }, [ydoc, editor, currentFile, model, initDone])

  return { peersCount, connected: peersCount > 0, peers }
}
