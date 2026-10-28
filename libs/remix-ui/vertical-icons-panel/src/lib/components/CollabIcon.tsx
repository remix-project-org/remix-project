import React, { useEffect, useRef, useState } from 'react' // eslint-disable-line
import { CustomTooltip } from '@remix-ui/helper'
import { CollabSessionPanel } from '@remix-ui/editor'
import type { CollabState } from '@remix-ui/editor'

const IDLE: CollabState = { phase: 'idle', roomId: null, inviteLink: null, isCreator: false, workspace: null, people: [], pendingPeers: 0, saving: false, error: null, nickname: null }

export const CollabIcon = () => {
  const [collab, setCollab] = useState<CollabState>(IDLE)
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null)
  const iconRef = useRef<HTMLDivElement>(null)

  const getAnchor = () => {
    const rect = iconRef.current?.getBoundingClientRect()
    return rect ? { top: rect.top, left: rect.right } : panelPos
  }

  useEffect(() => {
    const stateHandler = (e: Event) => setCollab((e as CustomEvent<CollabState>).detail)
    const openHandler = () => {
      const anchor = getAnchor()
      if (anchor) setPanelPos(anchor)
      setPanelOpen(true)
    }
    window.addEventListener('swarmCollabState', stateHandler)
    window.addEventListener('swarmCollabOpenPanel', openHandler)
    return () => {
      window.removeEventListener('swarmCollabState', stateHandler)
      window.removeEventListener('swarmCollabOpenPanel', openHandler)
    }
  }, [])

  // Close panel when session goes idle.
  useEffect(() => {
    if (collab.phase === 'idle') setPanelOpen(false)
  }, [collab.phase])

  const isActive = collab.phase !== 'idle'
  const isConnecting = collab.phase === 'connecting' || collab.phase === 'syncing'
  const isLive = collab.phase === 'live' && !collab.error
  const iconColor = isActive ? (collab.error ? 'text-danger' : isLive ? 'text-success' : 'text-warning') : ''

  const handleClick = () => {
    if (!isActive) {
      window.dispatchEvent(new CustomEvent('swarmCollabIconClick'))
    } else {
      const anchor = getAnchor()
      if (anchor) setPanelPos(anchor)
      setPanelOpen((p) => !p)
    }
  }

  return (
    <>
      <div
        className={`d-flex remixui_icon_row remixui_icon_row--compact ${isActive ? 'remixui_icon_row--active' : ''}`}
        style={{ width: 'auto', placeContent: isActive ? 'flex-start' : 'center' }}
      >
        <div style={{ width: '6px', borderRadius: '1000px', backgroundColor: isActive ? 'var(--custom-primary)' : 'transparent' }} />
        <CustomTooltip placement="right" tooltipText="Swarm collaboration" delay={{ show: 1000, hide: 0 }}>
          <div
            ref={iconRef}
            className={`remixui_icon m-0 py-1 remixui_icon_labeled ${isActive ? 'remixui_icon--active' : ''}`}
            onClick={handleClick}
            data-id="verticalIconsKindswarmCollab"
          >
            <i className={`fas fa-users ${iconColor}${isConnecting ? ' swarm-collab-icon-connecting' : ''}`} />
            <div className="remixui_icon_label">Collab</div>
          </div>
        </CustomTooltip>
        <div style={{ width: '6px', marginLeft: 'auto', borderRadius: '1000px', backgroundColor: 'transparent' }} />
      </div>

      {isActive && panelOpen && panelPos && (
        <div style={{ position: 'fixed', top: panelPos.top, left: panelPos.left + 8, zIndex: 1000, width: 340, pointerEvents: 'all' }}>
          <CollabSessionPanel
            state={collab}
            onLeave={() => window.dispatchEvent(new CustomEvent('swarmCollabLeave'))}
            onDismissError={() => window.dispatchEvent(new CustomEvent('swarmCollabDismissError'))}
          />
        </div>
      )}
    </>
  )
}
