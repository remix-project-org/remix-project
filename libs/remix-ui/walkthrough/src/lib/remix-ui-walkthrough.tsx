import React, { useState, useEffect, useCallback, useRef } from 'react'
import { WalkthroughDefinition } from '@remix-api'
import '../css/walkthrough.css'

interface RemixUIWalkthroughProps {
  plugin: any
  walkthroughs: WalkthroughDefinition[]
}

/**
 * RemixUIWalkthrough — a small UI panel that lists available walkthroughs
 * and lets the user start them. This gets rendered via the PluginViewWrapper
 * pattern inside the walkthrough plugin.
 */
export const RemixUIWalkthrough: React.FC<RemixUIWalkthroughProps> = ({ plugin, walkthroughs }) => {
  const [searchTerm, setSearchTerm] = useState('')

  const searchDebounce = useRef<ReturnType<typeof setTimeout>>(null)

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value)
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    if (value.trim()) {
      searchDebounce.current = setTimeout(() => {
        plugin.call('matomo', 'trackEvent', 'walkthrough', 'search', value.trim(), undefined).catch(() => {})
      }, 1000)
    }
  }, [plugin])

  // Sort: unseen first (by priority desc), then completed
  const sorted = [...walkthroughs].sort((a, b) => {
    if (a.completed && !b.completed) return 1
    if (!a.completed && b.completed) return -1
    return (b.priority ?? 0) - (a.priority ?? 0)
  })

  const filtered = sorted.filter((w) =>
    w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (w.description || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleStart = useCallback(async (id: string) => {
    try {
      await plugin.start(id)
    } catch (e) {
      console.error('Failed to start walkthrough:', e)
    }
  }, [plugin])

  const unseenCount = walkthroughs.filter(w => !w.completed).length

  if (!walkthroughs || walkthroughs.length === 0) {
    return (
      <div className="p-3 text-muted small">
        <i className="fas fa-info-circle me-1"></i>
        No walkthroughs available. Plugins can register walkthroughs via the API.
      </div>
    )
  }

  return (
    <div className="remix-walkthrough-panel d-flex flex-column h-100">
      {/* Search */}
      <div className="px-3 pt-3 pb-2">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <span className="small text-muted">
            {unseenCount > 0 ? `${unseenCount} new` : 'All completed'}
          </span>
        </div>
        <input
          type="text"
          className="form-control form-control-sm"
          placeholder="Search walkthroughs..."
          value={searchTerm}
          onChange={(e) => handleSearchChange(e.target.value)}
          data-id="walkthrough-search"
        />
      </div>

      {/* Walkthrough List */}
      <div className="flex-grow-1 overflow-auto px-3">
        {filtered.map((wt) => (
          <div
            key={wt.id}
            className={`walkthrough-card border rounded p-3 mb-2 ${wt.completed ? 'bg-secondary opacity-75' : 'bg-secondary'}`}
            data-id={`walkthrough-card-${wt.id}`}
          >
            <div className="d-flex justify-content-between align-items-start mb-1">
              <h6 className="mb-0 fw-bold">{wt.name}</h6>
              <div className="d-flex align-items-center gap-1">
                {wt.completed ? (
                  <span className="badge bg-success ms-2" title={wt.completedAt ? `Completed: ${new Date(wt.completedAt).toLocaleDateString()}` : 'Completed'}>
                    <i className="fas fa-check me-1"></i>Done
                  </span>
                ) : (
                  <span className="badge bg-warning text-dark ms-2">New</span>
                )}
                <span className="badge bg-info ms-1">{wt.steps.length} steps</span>
              </div>
            </div>
            <p className="small text-muted mb-2">{wt.description}</p>
            {wt.sourcePlugin && wt.sourcePlugin !== 'unknown' && wt.sourcePlugin !== 'api' && (
              <div className="small text-muted mb-2">
                <i className="fas fa-plug me-1"></i>{wt.sourcePlugin}
              </div>
            )}
            <button
              className={`btn btn-sm ${wt.completed ? 'btn-outline-primary' : 'btn-primary'}`}
              onClick={() => handleStart(wt.id)}
              data-id={`walkthrough-start-${wt.id}`}
            >
              <i className={`fas ${wt.completed ? 'fa-redo' : 'fa-play'} me-1`}></i>
              {wt.completed ? 'Replay Tour' : 'Start Tour'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
