import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

interface Skill {
  id: string
  name: string
  description?: string
  available?: boolean
  source?: string
}

interface SkillsApiResponse {
  skills: Skill[]
  total: number
}

export function SkillsModal({
  theme,
  sendPrompt,
  onClose
}: {
  theme: string
  plugin?: any
  sendPrompt: (s: string) => void
  onClose: () => void
}) {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('')

  const isDark = theme?.toLowerCase() === 'dark'

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('http://187.77.100.93:9005/skills')
        if (!res.ok) throw new Error(`Failed to fetch skills: ${res.status}`)
        const data = (await res.json()) as SkillsApiResponse
        if (!cancelled) setSkills(data?.skills || [])
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to fetch skills')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  const filteredSkills = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return skills
    return skills.filter((s) => {
      const hay = `${s.name || ''} ${s.description || ''} ${s.source || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [skills, filter])

  return createPortal(
    <div
      className="d-flex align-items-center justify-content-center"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 9999,
        background: 'rgba(0,0,0,0.7)'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`position-relative w-100 ${isDark ? 'bg-dark text-light' : 'bg-light text-dark'} p-3 rounded`}
        style={{ maxWidth: 800, maxHeight: '85vh', overflowY: 'auto' }}
      >
        <button
          type="button"
          className={`btn btn-sm ${isDark ? 'btn-outline-light' : 'btn-outline-dark'} position-absolute`}
          style={{ top: 12, right: 12 }}
          aria-label="Close"
          onClick={onClose}
        >
          <i className="fas fa-times"></i>
        </button>

        <div className="d-flex align-items-center justify-content-between mb-2">
          <h5 className="mb-0">Skills</h5>
        </div>

        <div className="mb-3">
          <input
            className="form-control"
            placeholder="Search skills..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        {loading && <div className="text-muted">Loading skills...</div>}
        {error && <div className="alert alert-danger">{error}</div>}

        {!loading && !error && (
          <div className="d-flex flex-wrap gap-3">
            {filteredSkills.map((skill) => (
              <div
                key={skill.id}
                className={`card ${isDark ? 'bg-secondary text-light' : ''}`}
                style={{ width: 220, cursor: 'pointer' }}
                onClick={() => {
                  sendPrompt(
                    `Please load and apply the "${skill.name}" skill (id: ${skill.id}) to help me with Ethereum development.`
                  )
                  onClose()
                }}
              >
                <div className="card-body p-3">
                  <div className="d-flex align-items-start justify-content-between gap-2">
                    <h6 className="card-title mb-1">{skill.name}</h6>
                    {skill.source && (
                      <span className={`badge ${isDark ? 'bg-dark' : 'bg-secondary'}`}>{skill.source}</span>
                    )}
                  </div>
                  <p className="card-text small mb-0" style={{ opacity: 0.9 }}>
                    {skill.description || 'No description provided.'}
                  </p>
                </div>
              </div>
            ))}
            {filteredSkills.length === 0 && <div className="text-muted">No skills found.</div>}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
