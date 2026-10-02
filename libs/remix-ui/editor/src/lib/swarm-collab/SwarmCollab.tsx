import React, { useEffect, useMemo, useRef, useState } from 'react' // eslint-disable-line
import { Room } from '@solarpunkltd/swarm-collaborative-docs'
import type { RoomInvite } from '@solarpunkltd/swarm-collaborative-docs'
import { CollabSession, CollabState, RemixHost } from './collabSession'
import { RemoteCursorDecorations } from './monacoBinding'
import { CollabSettings, CollabTransport, consumeInviteFromLocation, inviteFromParts, loadActiveSession, loadSettings, parseInviteInput, saveSettings } from './settings'
import './swarm-collab.css'

export interface SwarmCollabProps {
  /** The editor plugin. */
  plugin: any
  editorRef: React.MutableRefObject<any>
  monacoRef: React.MutableRefObject<any>
  currentFile: string
  /** Hides the controls (e.g. behind the diff view) without ending the session. */
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

const PHASE_LABEL: Record<CollabState['phase'], string> = { idle: '', connecting: 'Connecting…', syncing: 'Syncing…', live: 'Live' }
const TRANSPORT_LABEL: Record<CollabTransport, string> = { 'signaling-server': 'WebRTC via a signaling server', 'swarm-rtc': 'WebRTC signalled over Swarm (no server)' }
const EMPTY_JOIN_FORM = { link: '', key: '', host: '' }

interface DialogState {
  mode: 'create' | 'join'
  /** An invite that came with the page or a hash change; the join form is skipped for it. */
  invite: RoomInvite | null
}

/** Toolbar button, create/join dialog and session panel; all state lives in `CollabSession`. */
export const SwarmCollab = ({ plugin, editorRef, monacoRef, currentFile, hidden }: SwarmCollabProps) => {
  const session = useMemo(() => new CollabSession(hostFor(plugin)), [plugin])
  const [state, setState] = useState<CollabState>(session.getState())
  const [settings, setSettings] = useState<CollabSettings>(loadSettings())
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [joinForm, setJoinForm] = useState(EMPTY_JOIN_FORM)
  const [panelOpen, setPanelOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const currentFileRef = useRef(currentFile)
  currentFileRef.current = currentFile
  const codeEditor = editorRef.current

  useEffect(() => session.subscribe(setState), [session])

  const openDialog = (mode: DialogState['mode'], invite: RoomInvite | null = null) => {
    setJoinForm(EMPTY_JOIN_FORM)
    setDialog({ mode, invite })
  }

  const isCurrentRoom = (invite: RoomInvite) => session.getState().roomId === new Room(invite.key).id

  // An invite in the URL opens the join dialog, otherwise this tab's session resumes. No leave on unmount: the editor lives as long as the page.
  useEffect(() => {
    const offer = (invite: RoomInvite) => {
      if (isCurrentRoom(invite)) setPanelOpen(true)
      else openDialog('join', invite)
    }

    const invite = consumeInviteFromLocation()
    const active = loadActiveSession()
    if (invite) {
      offer(invite)
    } else if (active) {
      session.resume(active, loadSettings()).catch(() => setPanelOpen(true))
    }

    // An invite opened in an already open tab only changes the hash.
    const onHashChange = () => {
      const next = consumeInviteFromLocation()
      if (next) offer(next)
    }
    window.addEventListener('hashchange', onHashChange)

    return () => window.removeEventListener('hashchange', onHashChange)
  }, [session])

  // Prefill Bee URL and stamp from Remix's Swarm settings.
  useEffect(() => {
    if (!dialog || settings.stamp) return

    Promise.all([plugin.call('config', 'getAppParameter', 'settings/swarm-private-bee-address'), plugin.call('config', 'getAppParameter', 'settings/swarm-postage-stamp-id')])
      .then(([beeUrl, stamp]) => setSettings((s) => ({ ...s, beeUrl: beeUrl || s.beeUrl, stamp: stamp || s.stamp })))
      .catch(() => undefined)
  }, [dialog])

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

  const update = (patch: Partial<CollabSettings>) => setSettings((s) => ({ ...s, ...patch }))
  const updateJoin = (patch: Partial<typeof EMPTY_JOIN_FORM>) => setJoinForm((f) => ({ ...f, ...patch }))

  const joining = dialog?.mode === 'join'
  const pastedInvite = joining && !dialog.invite ? parseInviteInput(joinForm.link) : null
  const joinInvite = joining ? dialog.invite ?? pastedInvite ?? inviteFromParts(joinForm.key, joinForm.host, settings.transport) : null
  // A link names the room's transport; a key and address do not.
  const fixedTransport = joining ? (dialog.invite ?? pastedInvite)?.transport : undefined

  const confirm = async () => {
    saveSettings(settings)
    setBusy(true)
    try {
      if (!joining) {
        await session.create(settings)
      } else if (joinInvite && !isCurrentRoom(joinInvite)) {
        if (session.getState().phase !== 'idle') await session.leave()
        await session.join(joinInvite, settings)
      }
      setDialog(null)
      setPanelOpen(true)
    } catch {
      // the session reports the reason in its state
    } finally {
      setBusy(false)
    }
  }

  const copyInvite = async () => {
    if (!state.inviteLink) return

    await navigator.clipboard.writeText(state.inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const active = state.phase !== 'idle'
  const connectedPeople = state.people.filter((p) => p.connected).length
  const sharedInvite = state.inviteLink ? parseInviteInput(state.inviteLink) : null

  return (
    <div className={`swarm-collab-root${hidden ? ' d-none' : ''}`}>
      <div className="swarm-collab-toolbar">
        {active ? (
          <button className="btn btn-sm btn-secondary" onClick={() => setPanelOpen(!panelOpen)} data-id="swarmCollabStatus" title="Swarm collaboration session">
            <span className={`swarm-collab-dot ${state.phase === 'live' ? 'swarm-collab-dot-live' : ''}`} />
            {PHASE_LABEL[state.phase]}
            {state.phase === 'live' && ` · ${connectedPeople} connected`}
            {state.saving && <i className="fas fa-cloud-upload-alt ms-2" title="Saving to Swarm" />}
          </button>
        ) : (
          <button className="btn btn-sm btn-secondary" onClick={() => openDialog('create')} data-id="swarmCollabStart" title="Collaborate on this workspace over Swarm">
            <i className="fas fa-users me-1" /> Collaborate
          </button>
        )}
      </div>

      {state.error && !dialog && (
        <div className="swarm-collab-error alert alert-danger py-1 px-2 small">
          {state.error}
          <button className="btn btn-sm p-0 ms-2" onClick={() => session.dismissError()} aria-label="Dismiss">
            <i className="fas fa-times" />
          </button>
        </div>
      )}

      {active && panelOpen && (
        <div className="swarm-collab-panel card shadow-sm small" data-id="swarmCollabPanel">
          <div className="card-body p-2">
            <div className="mb-2">
              Room <code>{state.roomId?.slice(0, 12)}</code> · workspace <b>{state.workspace}</b>
              {state.isCreator && <span className="badge bg-info ms-1">host</span>}
            </div>
            {state.phase === 'syncing' && state.pendingPeers > 0 && <div className="text-muted mb-2">Waiting for {state.pendingPeers} peer(s) to send the document…</div>}
            <div className="input-group input-group-sm mb-2">
              <input className="form-control" readOnly value={state.inviteLink ?? ''} data-id="swarmCollabInvite" />
              <button className="btn btn-primary" onClick={copyInvite}>{copied ? 'Copied' : 'Copy invite'}</button>
            </div>
            <div className="text-muted mb-1">Anyone with this link can read and edit the workspace.</div>
            {sharedInvite && (
              <details className="mb-2">
                <summary className="text-muted">Room key and host address</summary>
                <label className="form-label small mb-0 mt-1">Room key</label>
                <input className="form-control form-control-sm mb-1" readOnly value={sharedInvite.key} data-id="swarmCollabRoomKeyShare" />
                <label className="form-label small mb-0">Host address</label>
                <input className="form-control form-control-sm mb-1" readOnly value={sharedInvite.creator} data-id="swarmCollabHostAddressShare" />
                {sharedInvite.transport && <div className="text-muted">Transport: {TRANSPORT_LABEL[sharedInvite.transport as CollabTransport] ?? sharedInvite.transport}</div>}
              </details>
            )}
            <ul className="list-unstyled mb-2">
              {state.people.map((person) => (
                <li key={person.identity}>
                  <span className={`swarm-collab-dot ${person.connected ? 'swarm-collab-dot-live' : ''}`} />
                  {person.username}
                  {person.sessions > 1 && <span className="text-muted"> ({person.sessions} tabs)</span>}
                </li>
              ))}
              {state.people.length === 0 && <li className="text-muted">Nobody else yet.</li>}
            </ul>
            <button className="btn btn-sm btn-outline-danger w-100" onClick={() => session.leave()} data-id="swarmCollabLeave">Leave session</button>
          </div>
        </div>
      )}

      {dialog && (
        <div className="swarm-collab-backdrop" onClick={() => !busy && setDialog(null)}>
          <div className="swarm-collab-dialog card shadow" onClick={(e) => e.stopPropagation()} data-id="swarmCollabDialog">
            <div className="card-body">
              <h6 className="mb-3">{joining ? 'Join a Swarm collaboration session' : 'Share this workspace over Swarm'}</h6>
              {!dialog.invite && !active && (
                <div className="btn-group btn-group-sm w-100 mb-3" role="group">
                  <button className={`btn ${joining ? 'btn-outline-primary' : 'btn-primary'}`} disabled={busy} onClick={() => setDialog({ mode: 'create', invite: null })} data-id="swarmCollabModeCreate">Share this workspace</button>
                  <button className={`btn ${joining ? 'btn-primary' : 'btn-outline-primary'}`} disabled={busy} onClick={() => setDialog({ mode: 'join', invite: null })} data-id="swarmCollabModeJoin">Join a session</button>
                </div>
              )}
              {joining && (
                <p className="small text-muted">
                  {dialog.invite && <>Room <code>{new Room(dialog.invite.key).id.slice(0, 12)}</code>. </>}
                  The shared files open in a workspace of their own. Your other workspaces are not touched.
                </p>
              )}
              {joining && active && <div className="alert alert-warning py-1 px-2 small">Joining leaves your current session in <b>{state.workspace}</b>.</div>}
              {state.error && <div className="alert alert-danger py-1 px-2 small">{state.error}</div>}

              {joining && !dialog.invite && (
                <>
                  <label className="form-label small mb-0">Invite link</label>
                  <input className="form-control form-control-sm mb-1" value={joinForm.link} onChange={(e) => updateJoin({ link: e.target.value })} placeholder="Paste the link you were sent" data-id="swarmCollabInviteInput" />
                  {joinForm.link.trim() && !pastedInvite && <div className="small text-danger mb-1">This is not a collaboration invite link.</div>}
                  <details className="mb-2" open={!!(joinForm.key || joinForm.host)}>
                    <summary className="small">Or enter the room key and host address</summary>
                    <label className="form-label small mb-0 mt-2">Room key</label>
                    <input className="form-control form-control-sm mb-2" value={joinForm.key} onChange={(e) => updateJoin({ key: e.target.value })} disabled={!!pastedInvite} data-id="swarmCollabRoomKey" />
                    <label className="form-label small mb-0">Host address</label>
                    <input className="form-control form-control-sm mb-1" value={joinForm.host} onChange={(e) => updateJoin({ host: e.target.value })} disabled={!!pastedInvite} placeholder="40 hex characters" data-id="swarmCollabHostAddress" />
                    <div className="small text-muted">Anyone in the session finds both in their session panel. Pick the room's transport under Connection.</div>
                  </details>
                </>
              )}

              <label className="form-label small mb-0">Your name</label>
              <input className="form-control form-control-sm mb-2" value={settings.nickname} onChange={(e) => update({ nickname: e.target.value })} data-id="swarmCollabNickname" />

              <label className="form-label small mb-0">Bee node URL</label>
              <input className="form-control form-control-sm mb-2" value={settings.beeUrl} onChange={(e) => update({ beeUrl: e.target.value })} />

              <label className="form-label small mb-0">Postage stamp (batch ID)</label>
              <input className="form-control form-control-sm mb-2" value={settings.stamp} onChange={(e) => update({ stamp: e.target.value })} placeholder="64 hex characters, owned by the node above" data-id="swarmCollabStamp" />

              <details className="mb-3">
                <summary className="small">Connection</summary>
                {!fixedTransport && (
                  <>
                    <label className="form-label small mb-0 mt-2">Transport</label>
                    <select className="form-select form-select-sm mb-2" value={settings.transport} onChange={(e) => update({ transport: e.target.value as CollabTransport })}>
                      {Object.entries(TRANSPORT_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </>
                )}
                {(fixedTransport ?? settings.transport) === 'signaling-server' && (
                  <>
                    <label className="form-label small mb-0">Signaling server</label>
                    <input className="form-control form-control-sm mb-2" value={settings.signalingUrl} onChange={(e) => update({ signalingUrl: e.target.value })} />
                  </>
                )}
                <label className="form-label small mb-0">STUN / TURN servers (comma-separated)</label>
                <input className="form-control form-control-sm" value={settings.iceUrls} onChange={(e) => update({ iceUrls: e.target.value })} />
              </details>

              <div className="d-flex justify-content-end">
                <button className="btn btn-sm btn-secondary me-2" disabled={busy} onClick={() => setDialog(null)}>Cancel</button>
                <button className="btn btn-sm btn-primary" disabled={busy || (joining && !joinInvite)} onClick={confirm} data-id="swarmCollabConfirm">
                  {busy ? (joining ? 'Joining…' : 'Starting…') : joining ? 'Join' : 'Start session'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
