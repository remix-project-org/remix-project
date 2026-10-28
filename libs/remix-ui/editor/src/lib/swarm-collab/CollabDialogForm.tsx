import React, { useEffect, useState } from 'react' // eslint-disable-line
import { Room } from '@solarpunkltd/swarm-collaborative-docs'
import type { RoomInvite } from '@solarpunkltd/swarm-collaborative-docs'
import { CollabSettings, CollabTransport, loadSettings, parseInviteInput } from './settings'

export const TRANSPORT_LABEL: Record<CollabTransport, string> = {
  'signaling-server': 'WebRTC via a signaling server',
  'swarm-rtc': 'WebRTC signalled over Swarm (no server)',
}

export const EMPTY_JOIN_FORM = { link: '', key: '', host: '' }

export interface CollabFormData {
  mode: 'create' | 'join'
  settings: CollabSettings
  joinForm: typeof EMPTY_JOIN_FORM
}

export interface CollabDialogFormProps {
  dataRef: React.MutableRefObject<CollabFormData>
  initialMode: 'create' | 'join'
  initialInvite: RoomInvite | null
  isActive: boolean
  activeWorkspace: string | null
  error: string | null
  plugin: any
}

/** Form rendered inside the Remix notification modal. Syncs its state to `dataRef` on every render. */
export const CollabDialogForm = ({ dataRef, initialMode, initialInvite, isActive, activeWorkspace, error, plugin }: CollabDialogFormProps) => {
  const [mode, setMode] = useState<'create' | 'join'>(initialMode)
  const [settings, setSettings] = useState<CollabSettings>(loadSettings())
  const [joinForm, setJoinForm] = useState(EMPTY_JOIN_FORM)

  const joining = mode === 'join'
  const pastedInvite = joining && !initialInvite ? parseInviteInput(joinForm.link) : null
  const fixedTransport = joining ? (initialInvite ?? pastedInvite)?.transport : undefined

  const update = (patch: Partial<CollabSettings>) => setSettings((s) => ({ ...s, ...patch }))
  const updateJoin = (patch: Partial<typeof EMPTY_JOIN_FORM>) => setJoinForm((f) => ({ ...f, ...patch }))

  // Keep ref in sync on every render so okFn always reads the latest values.
  dataRef.current = { mode, settings, joinForm }

  // Prefill Bee URL and stamp from Remix's Swarm settings.
  useEffect(() => {
    if (settings.stamp) return
    Promise.all([
      plugin.call('config', 'getAppParameter', 'settings/swarm-private-bee-address'),
      plugin.call('config', 'getAppParameter', 'settings/swarm-postage-stamp-id'),
    ])
      .then(([beeUrl, stamp]) => setSettings((s) => ({ ...s, beeUrl: beeUrl || s.beeUrl, stamp: stamp || s.stamp })))
      .catch(() => undefined)
  }, [])

  return (
    <div className="w-100 overflow-hidden">
      <div className="mb-2">
        <span className="badge bg-secondary">beta</span>
      </div>
      {!initialInvite && !isActive && (
        <div className="btn-group btn-group-sm w-100 mb-3" role="group">
          <button type="button" className={`btn ${joining ? 'btn-outline-primary' : 'btn-primary'}`} onClick={() => setMode('create')} data-id="swarmCollabModeCreate">Share this workspace</button>
          <button type="button" className={`btn ${joining ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setMode('join')} data-id="swarmCollabModeJoin">Join a session</button>
        </div>
      )}
      {joining && (
        <p className="small text-muted">
          {initialInvite && <>Room <code>{new Room(initialInvite.key).id.slice(0, 12)}</code>. </>}
          The shared files open in a workspace of their own. Your other workspaces are not touched.
        </p>
      )}
      {joining && isActive && <div className="alert alert-warning py-1 px-2 small mb-2">Joining leaves your current session in <b>{activeWorkspace}</b>.</div>}
      {error && <div className="alert alert-danger py-1 px-2 small mb-2">{error}</div>}
      {joining && !initialInvite && (
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
      <input className="form-control form-control-sm mb-2" value={settings.stamp} onChange={(e) => update({ stamp: e.target.value })} placeholder="64 hex characters, owned by the node above; empty for a gateway" data-id="swarmCollabStamp" />

      <details className="mb-1">
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

      <div className="mt-2 text-center">
        <button
          type="button"
          className="btn btn-link btn-sm p-0 text-decoration-none"
          onClick={async () => {
            ;(document.querySelector('[data-id="swarmCollab-modal-footer-cancel-react"]') as HTMLButtonElement)?.click()
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
          }}
          data-id="swarmCollabSetupGuide"
        >
          <i className="fas fa-book me-1" />Swarm setup guide
        </button>
        <span className="text-muted mx-1 small">or</span>
        <a
          href="https://docs.ethswarm.org/docs/desktop/install"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-link btn-sm p-0 text-decoration-none small"
          data-id="swarmCollabInstallDesktop"
        >
          install Swarm Desktop
        </a>
      </div>
    </div>
  )
}
