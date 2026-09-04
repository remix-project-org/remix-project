import React, { useState, useCallback } from 'react'
import { NotificationTransport, SwarmDocSettings } from './swarm/swarmInterfaces'
import { PLACEHOLDER_STAMP } from './swarm/swarmUtils'
import { DEFAULT_BEE_URL, DEFAULT_SIGNALING_SERVER_URL, DEFAULT_STUN_URL, generateHex, getOrCreatePeerKey, LS_BEE_URL, LS_NICKNAME, LS_SIGNAL_URL, LS_STAMP, LS_STUN_URL, LS_TOPIC } from './swarm/utils'

interface CollabConfig {
  topic: string
  notification: NotificationTransport
  beeUrl: string
  stamp: string
  signalingUrl: string
  stunUrl: string
}

interface Props {
  onConfirm: (settings: SwarmDocSettings) => void
  onClose: () => void
}

export const SwarmCollabModal: React.FC<Props> = ({ onConfirm, onClose }) => {
  const [nickname, setNickname] = useState(() => localStorage.getItem(LS_NICKNAME) || 'user')
  const [topic, setTopic] = useState(() => localStorage.getItem(LS_TOPIC) || generateHex(32))
  const [beeUrl, setBeeUrl] = useState(() => localStorage.getItem(LS_BEE_URL) || DEFAULT_BEE_URL)
  const [stamp, setStamp] = useState(() => localStorage.getItem(LS_STAMP) || PLACEHOLDER_STAMP)
  const [notification, setNotification] = useState<NotificationTransport>('webrtc')
  const [signalingUrl, setSignalingUrl] = useState(() => localStorage.getItem(LS_SIGNAL_URL) || DEFAULT_SIGNALING_SERVER_URL)
  const [stunUrl, setStunUrl] = useState(() => localStorage.getItem(LS_STUN_URL) || DEFAULT_STUN_URL)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pasteValue, setPasteValue] = useState('')
  const [pasteError, setPasteError] = useState('')

  const currentConfig: CollabConfig = { topic, notification, beeUrl, stamp, signalingUrl, stunUrl }

  const handleCopyConfig = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(currentConfig, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }, [topic, notification, beeUrl, stamp, signalingUrl, stunUrl])

  const handleLoadConfig = () => {
    setPasteError('')
    try {
      const cfg: CollabConfig = JSON.parse(pasteValue)
      if (!cfg.topic) throw new Error('Missing topic')
      setTopic(cfg.topic)
      setNotification(cfg.notification)
      if (cfg.beeUrl) setBeeUrl(cfg.beeUrl)
      if (cfg.stamp) setStamp(cfg.stamp)
      if (cfg.signalingUrl) setSignalingUrl(cfg.signalingUrl)
      if (cfg.stunUrl) setSignalingUrl(cfg.stunUrl)
      setPasteValue('')
    } catch {
      setPasteError('Invalid config JSON')
    }
  }

  const handleConfirm = () => {
    localStorage.setItem(LS_NICKNAME, nickname)
    localStorage.setItem(LS_TOPIC, topic)
    localStorage.setItem(LS_BEE_URL, beeUrl)
    localStorage.setItem(LS_STAMP, stamp)
    localStorage.setItem(LS_SIGNAL_URL, signalingUrl)
    localStorage.setItem(LS_STUN_URL, stunUrl)

    const settings: SwarmDocSettings = {
      sessionId: topic,
      notification,
      signalingUrl: notification === 'webrtc' ? signalingUrl : undefined,
      stunUrl: notification === 'swarm-rtc' ? stunUrl : undefined,
      swarmInfra: {
        user: { walletPrivateKey: getOrCreatePeerKey(), nickname },
        infra: { beeUrl, stamp, topic },
      },
    }
    onConfirm(settings)
  }

  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
      style={{ background: 'rgba(0,0,0,0.55)', zIndex: 9999 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-body border rounded shadow p-4"
        style={{ width: 460, maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="mb-0 fw-semibold">
            <i className="fas fa-users me-2" />
            Collaborative Editing
          </h6>
          <button type="button" className="btn-close" onClick={onClose} />
        </div>

        <div className="mb-3 border rounded p-2 bg-body-secondary">
          <label className="form-label small fw-semibold mb-1">Load config from peer</label>
          <div className="input-group input-group-sm">
            <textarea
              className="form-control form-control-sm font-monospace"
              rows={2}
              placeholder='Paste JSON config here…'
              value={pasteValue}
              onChange={e => { setPasteValue(e.target.value); setPasteError('') }}
              style={{ resize: 'none', fontSize: '0.72rem' }}
            />
            <button
              className="btn btn-outline-primary"
              onClick={handleLoadConfig}
              disabled={!pasteValue.trim()}
            >
              Load
            </button>
          </div>
          {pasteError && <div className="text-danger mt-1" style={{ fontSize: '0.75rem' }}>{pasteError}</div>}
        </div>

        <hr className="my-2" />

        <div className="mb-3">
          <label className="form-label small fw-semibold">Nickname</label>
          <input
            className="form-control form-control-sm"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            placeholder="user"
            autoFocus
          />
        </div>

        <div className="mb-2">
          <label className="form-label small fw-semibold">Session Topic</label>
          <div className="input-group input-group-sm">
            <input
              className="form-control font-monospace"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="hex topic"
            />
            <button
              className="btn btn-outline-secondary"
              onClick={() => setTopic(generateHex(32))}
              title="Generate new topic"
            >
              New
            </button>
          </div>
          <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: 2 }}>
            All peers must use the same topic to collaborate.
          </div>
        </div>

        <div className="mb-3">
          <button
            className={`btn btn-sm w-100 ${copied ? 'btn-success' : 'btn-outline-secondary'}`}
            onClick={handleCopyConfig}
          >
            <i className={`fas fa-${copied ? 'check' : 'copy'} me-1`} />
            {copied ? 'Copied!' : 'Copy config (share with peers)'}
          </button>
        </div>

        <div className="mb-3">
          <button
            type="button"
            className="btn btn-link btn-sm p-0 text-decoration-none text-muted"
            onClick={() => setShowAdvanced(o => !o)}
          >
            <i className={`fas fa-chevron-${showAdvanced ? 'up' : 'down'} me-1`} />
            {showAdvanced ? 'Hide advanced' : 'Advanced settings'}
          </button>
        </div>

        {showAdvanced && (
          <div className="border rounded p-3 mb-3 bg-body-secondary">
            <div className="mb-2">
              <label className="form-label small fw-semibold">Transport</label>
              <div className="btn-group btn-group-sm w-100">
                {(['webrtc', 'swarm-rtc'] as const).map(t => (
                  <button
                    key={t}
                    className={`btn ${notification === t ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => setNotification(t)}
                  >
                    {t === 'webrtc' ? 'WebRTC': 'SwarmRTC'}
                  </button>
                ))}
              </div>
            </div>

            {notification === 'webrtc' && (
              <div className="mb-2">
                <label className="form-label small fw-semibold">Signaling Server URL</label>
                <input
                  className="form-control form-control-sm"
                  value={signalingUrl}
                  onChange={e => setSignalingUrl(e.target.value)}
                  placeholder={DEFAULT_SIGNALING_SERVER_URL}
                />
              </div>
            )}

            {notification === 'swarm-rtc' && (
              <div className="mb-2">
                <label className="form-label small fw-semibold">Stun URL</label>
                <input
                  className="form-control form-control-sm"
                  value={stunUrl}
                  onChange={e => setStunUrl(e.target.value)}
                  placeholder={DEFAULT_STUN_URL}
                />
              </div>
            )}

            <div className="mb-2">
              <label className="form-label small fw-semibold">Bee API URL</label>
              <input
                className="form-control form-control-sm"
                value={beeUrl}
                onChange={e => setBeeUrl(e.target.value)}
                placeholder={DEFAULT_BEE_URL}
              />
            </div>

            <div className="mb-0">
              <label className="form-label small fw-semibold">Postage Stamp</label>
              <input
                className="form-control form-control-sm font-monospace"
                value={stamp}
                onChange={e => setStamp(e.target.value)}
                placeholder={PLACEHOLDER_STAMP}
              />
            </div>
          </div>
        )}

        <button
          className="btn btn-primary w-100"
          onClick={handleConfirm}
          disabled={!nickname.trim() || !topic.trim()}
        >
          <i className="fas fa-play me-2" />
          Start Collaboration
        </button>
      </div>
    </div>
  )
}
