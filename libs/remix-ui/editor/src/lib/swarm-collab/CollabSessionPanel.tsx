import React, { useState } from 'react' // eslint-disable-line
import type { RoomInvite } from '@solarpunkltd/swarm-collaborative-docs'
import { CollabState } from './collabSession'
import { CollabTransport, parseInviteInput } from './settings'
import { TRANSPORT_LABEL } from './CollabDialogForm'

export interface CollabSessionPanelProps {
  state: CollabState
  onLeave: () => void
  onDismissError: () => void
}

export const CollabSessionPanel = ({ state, onLeave, onDismissError }: CollabSessionPanelProps) => {
  const [copied, setCopied] = useState(false)

  const sharedInvite: RoomInvite | null = state.inviteLink ? parseInviteInput(state.inviteLink) : null
  const connectedCount = state.people.filter((p) => p.connected).length + (state.nickname ? 1 : 0)

  const copyInvite = async () => {
    if (!state.inviteLink) return
    await navigator.clipboard.writeText(state.inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="swarm-collab-panel card shadow-sm small" data-id="swarmCollabPanel">
      <div className="card-body p-2">
        <div className="mb-2 d-flex justify-content-between align-items-center">
          <div>
            Room <code>{state.roomId?.slice(0, 12)}</code> · workspace <b>{state.workspace}</b>
            {state.isCreator && <span className="badge bg-success ms-1">host</span>}
            <span className="badge bg-secondary ms-1">beta</span>
          </div>
          <span className="badge bg-secondary ms-2">{connectedCount} connected</span>
        </div>
        {state.phase === 'connecting' && (
          <div className="d-flex align-items-center gap-2 mb-2 text-muted small">
            <span className="spinner-border spinner-border-sm flex-shrink-0" role="status" aria-hidden="true" />
            Connecting to the room…
          </div>
        )}
        {state.phase === 'syncing' && (
          <div className="d-flex align-items-center gap-2 mb-2 text-muted small">
            <span className="spinner-border spinner-border-sm flex-shrink-0" role="status" aria-hidden="true" />
            {state.pendingPeers > 0 ? `Waiting for ${state.pendingPeers} peer(s) to send the workspace…` : 'Loading workspace…'}
          </div>
        )}
        {state.error && (
          <div className="alert alert-danger py-1 px-2 mb-2 d-flex justify-content-between align-items-start">
            <span>
              {state.error}
              <span className="d-block mt-1">Make sure your Swarm node is running, configured correctly and that the postage stamp is valid.</span>
            </span>
            <button type="button" className="btn-close swarm-collab-close-sm ms-2 flex-shrink-0" onClick={onDismissError} />
          </div>
        )}
        <div className="input-group input-group-sm mb-2">
          <input className="form-control swarm-collab-invite-input" readOnly value={state.inviteLink ?? ''} data-id="swarmCollabInvite" />
          <button className="btn btn-sm btn-primary" onClick={copyInvite}>{copied ? 'Copied' : 'Copy invite'}</button>
        </div>
        <div className="text-muted mb-1">Anyone with this link can read and edit the workspace.</div>
        {sharedInvite && (
          <details className="mb-2">
            <summary className="text-muted">Room key and host address</summary>
            <label className="form-label small mb-0 mt-1">Room key</label>
            <input className="form-control form-control-sm mb-1" readOnly value={sharedInvite.key} data-id="swarmCollabRoomKeyShare" />
            <label className="form-label small mb-0">Host address</label>
            <input className="form-control form-control-sm mb-1" readOnly value={sharedInvite.creator} data-id="swarmCollabHostAddressShare" />
            {sharedInvite.transport && (
              <div className="text-muted">Transport: {TRANSPORT_LABEL[sharedInvite.transport as CollabTransport] ?? sharedInvite.transport}</div>
            )}
          </details>
        )}
        <ul className="list-unstyled mb-2">
          {state.nickname && (
            <li>
              <span className="swarm-collab-dot swarm-collab-dot-live" />
              {state.nickname} <span className="text-muted">(you)</span>
              {state.isCreator && <span className="badge bg-success ms-1">host</span>}
            </li>
          )}
          {state.people.map((person) => (
            <li key={person.identity}>
              {person.connected || person.isCreator
                ? <span className={`swarm-collab-dot swarm-collab-dot-live${person.isCreator ? ' swarm-collab-dot-host' : ''}`} />
                : <span className="swarm-collab-spinner" title="Connecting…" />
              }
              {person.username}
              {person.isCreator && <span className="badge bg-success ms-1">host</span>}
              {person.sessions > 1 && <span className="text-muted"> ({person.sessions} tabs)</span>}
            </li>
          ))}
          {state.people.length === 0 && <li className="text-muted">Nobody else yet.</li>}
        </ul>
        <button className="btn btn-sm btn-outline-danger w-100" onClick={onLeave} data-id="swarmCollabLeave">Leave session</button>
        <div className="mt-2 text-center">
          <button
            type="button"
            className="btn btn-link btn-sm p-0 text-decoration-none"
            onClick={() => window.dispatchEvent(new CustomEvent('swarmCollabSetupGuide'))}
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
    </div>
  )
}
