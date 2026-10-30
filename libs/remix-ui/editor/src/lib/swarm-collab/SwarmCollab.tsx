import React, { useEffect, useMemo, useRef, useState } from 'react' // eslint-disable-line
import { Room } from '@solarpunkltd/swarm-collaborative-docs'
import type { RoomInvite } from '@solarpunkltd/swarm-collaborative-docs'
import { CollabSession, CollabState, RemixHost } from './collabSession'
import { RemoteCursorDecorations } from './monacoBinding'
import { consumeInviteFromLocation, inviteFromParts, loadActiveSession, loadSettings, parseInviteInput, saveSettings } from './settings'
import { CollabDialogForm, CollabFormData, EMPTY_JOIN_FORM } from './CollabDialogForm'
import './swarm-collab.css'

export interface SwarmCollabProps {
  plugin: any
  editorRef: React.MutableRefObject<any>
  monacoRef: React.MutableRefObject<any>
  currentFile: string
  hidden?: boolean
}

function hostFor(plugin: any): RemixHost {
  return {
    call: (name, method, ...args) => plugin.call(name, method, ...args),
    on: (name, event, cb) => plugin.on(name, event, cb),
    off: (name, event) => plugin.off(name, event),
    setForceReadOnly: (value) => plugin.setForceReadOnly?.(value)
  }
}

const openPanel = () => window.dispatchEvent(new CustomEvent('swarmCollabOpenPanel'))

/** Manages the collaboration session and editor bindings. The UI (panel + icon) lives in the vertical icons panel. */
export const SwarmCollab = ({ plugin, editorRef, monacoRef, currentFile }: SwarmCollabProps) => {
  const session = useMemo(() => new CollabSession(hostFor(plugin)), [plugin])
  const [state, setState] = useState<CollabState>(session.getState())
  const currentFileRef = useRef(currentFile)
  currentFileRef.current = currentFile
  const codeEditor = editorRef.current
  const modalOpenRef = useRef(false)
  const openModalRef = useRef<(mode: 'create' | 'join', invite?: RoomInvite | null, error?: string | null) => Promise<void>>(null as any)

  useEffect(() => session.subscribe(setState), [session])

  const isCurrentRoom = (invite: RoomInvite) => session.getState().roomId === new Room(invite.key).id

  const openModal = async (initialMode: 'create' | 'join', initialInvite: RoomInvite | null = null, initialError: string | null = null) => {
    if (modalOpenRef.current) return
    modalOpenRef.current = true
    const dataRef: React.MutableRefObject<CollabFormData> = { current: { mode: initialMode, settings: loadSettings(), joinForm: EMPTY_JOIN_FORM } }
    const currentState = session.getState()

    const confirmed = await plugin.call('notification', 'modal', {
      id: 'swarmCollab',
      title: initialMode === 'join' ? 'Join a Swarm collaboration session' : 'Share this workspace over Swarm',
      message: (
        <CollabDialogForm
          dataRef={dataRef}
          initialMode={initialMode}
          initialInvite={initialInvite}
          isActive={currentState.phase !== 'idle'}
          activeWorkspace={currentState.workspace}
          error={initialError}
          plugin={plugin}
        />
      ),
      okLabel: initialMode === 'join' ? 'Join' : 'Start session',
      cancelLabel: 'Cancel',
    })

    if (!confirmed) {
      modalOpenRef.current = false
      return
    }

    // Let the modal finish its hide animation before the browser may show a native permission popup.
    await new Promise((resolve) => setTimeout(resolve, 150))

    const { mode, settings, joinForm } = dataRef.current
    const joining = mode === 'join'
    const pastedInvite = joining && !initialInvite ? parseInviteInput(joinForm.link) : null
    const joinInvite = joining ? initialInvite ?? pastedInvite ?? inviteFromParts(joinForm.key, joinForm.host, settings.transport) : null

    saveSettings(settings)
    try {
      if (!joining) {
        await session.create(settings)
      } else if (joinInvite && !isCurrentRoom(joinInvite)) {
        if (session.getState().phase !== 'idle') await session.leave()
        await session.join(joinInvite, settings)
      }
    } catch (err) {
      const errorMsg = session.getState().error
      session.dismissError()
      modalOpenRef.current = false
      await openModal(mode, initialInvite, errorMsg ?? (err as Error).message)
    } finally {
      modalOpenRef.current = false
    }
  }

  openModalRef.current = openModal

  // Open panel as soon as the session leaves idle (connecting, syncing, live).
  useEffect(() => {
    if (state.phase !== 'idle') openPanel()
  }, [state.phase])

  // Async DOC_ERROR — surface in panel.
  useEffect(() => {
    if (!state.error) return
    openPanel()
  }, [state.error])

  // URL invite or persisted session on mount.
  useEffect(() => {
    const offer = (invite: RoomInvite) => {
      if (isCurrentRoom(invite)) openPanel()
      else openModal('join', invite)
    }

    const invite = consumeInviteFromLocation()
    const active = loadActiveSession()
    if (invite) {
      offer(invite)
    } else if (active) {
      session.resume(active, loadSettings()).catch(openPanel)
    }

    const onHashChange = () => {
      const next = consumeInviteFromLocation()
      if (next) offer(next)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [session])

  // Sync full state to the CollabIcon in the vertical panel.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('swarmCollabState', { detail: state }))
  }, [state])

  // Idle icon click → open create modal.
  useEffect(() => {
    const handler = () => openModalRef.current('create', null, null)
    window.addEventListener('swarmCollabIconClick', handler)
    return () => window.removeEventListener('swarmCollabIconClick', handler)
  }, [])

  // Panel callbacks forwarded from CollabIcon.
  useEffect(() => {
    const leaveHandler = () => session.leave()
    const dismissHandler = () => session.dismissError()
    const setupGuideHandler = async () => {
      try {
        await (plugin as any).call('skillsexplorermodal', 'loadSkill', 'swarm-setup-bee-interactive')
      } catch {
        // skill endpoint unavailable — proceed without it
      }
      try {
        const isPanelHidden = await plugin.call('rightSidePanel', 'isPanelHidden')
        if (isPanelHidden) await plugin.call('rightSidePanel', 'togglePanel')
        await plugin.call('menuicons', 'select', 'remixaiassistant')
        await (plugin as any).call('remixaiassistant', 'newConversation')
        await new Promise((resolve) => setTimeout(resolve, 100))
        await (plugin as any).call('remixaiassistant', 'chatPipe', 'guide me through the setup of a swarm node', false, { source: 'swarm-collab' })
      } catch (err) {
        console.error('Swarm setup guide failed:', err)
      }
    }
    window.addEventListener('swarmCollabLeave', leaveHandler)
    window.addEventListener('swarmCollabDismissError', dismissHandler)
    window.addEventListener('swarmCollabSetupGuide', setupGuideHandler)
    return () => {
      window.removeEventListener('swarmCollabLeave', leaveHandler)
      window.removeEventListener('swarmCollabDismissError', dismissHandler)
      window.removeEventListener('swarmCollabSetupGuide', setupGuideHandler)
    }
  }, [session, plugin])

  // Bind the model the editor shows for the current file.
  useEffect(() => {
    const monaco = monacoRef.current
    if (!monaco || !currentFile) return session.setActiveFile(null, null)

    const uri = monaco.Uri.parse(currentFile)
    const bind = () => session.setActiveFile(currentFile, monaco.editor.getModel(uri))
    bind()
    const created = monaco.editor.onDidCreateModel((model: any) => {
      if (model.uri.toString() === uri.toString()) bind()
    })

    return () => created.dispose()
  }, [currentFile, state.phase, monacoRef.current])

  // Local caret out, remote carets in.
  useEffect(() => {
    if (!codeEditor || state.phase !== 'live') return

    const decorations = new RemoteCursorDecorations(codeEditor)
    const render = () => decorations.render(session.cursorsFor(currentFileRef.current))
    const offCursors = session.onCursorsChanged(render)
    const selection = codeEditor.onDidChangeCursorSelection((e: any) => {
      const model = codeEditor.getModel()
      if (!model) return

      const anchor = model.getOffsetAt({ lineNumber: e.selection.selectionStartLineNumber, column: e.selection.selectionStartColumn })
      const head = model.getOffsetAt({ lineNumber: e.selection.positionLineNumber, column: e.selection.positionColumn })
      session.updateLocalCursor(currentFileRef.current, anchor, head)
    })
    const modelChange = codeEditor.onDidChangeModel(render)
    render()

    return () => {
      offCursors()
      selection.dispose()
      modelChange.dispose()
      decorations.dispose()
    }
  }, [codeEditor, state.phase, session])

  return null
}
