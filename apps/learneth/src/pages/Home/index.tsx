import React, { useState, useEffect, useMemo } from 'react'
import { CustomTooltip } from "@remix-ui/helper"
import { Link } from 'react-router-dom'
import { useAppSelector } from '../../redux/hooks'
import RepoImporter from '../../components/RepoImporter'
import FiltersPanel from './FiltersPanel'
import { trackMatomoEvent } from '@remix-api'
import remixClient from '../../remix-client'
import './index.css'

type LevelKey = '1' | '2' | '3'
const LEVEL_LABEL: Record<LevelKey, string> = { '1': 'Beginner', '2': 'Intermediate', '3': 'Advanced' }

function Antenna({ level }: { level: number }) {
  const active = Math.min(Math.max(level, 0), 3)
  return (
    <span className="d-inline-flex align-items-end me-2">
      {[0, 1, 2].map(i => (
        <span key={i}
          className={`antenna-bar ${i < active ? 'bg-primary' : 'bg-secondary'}`}
          style={{ height: `${8 + i * 4}px` }} />
      ))}
    </span>
  )
}

function mdToPlain(text: string, maxLen = 280) {
  if (!text) return ''
  let t = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/^#+\s+/gm, '')
    .replace(/[*_>#-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > maxLen ? t.slice(0, maxLen - 1) + '…' : t
}

function MetaRight({ stepsLen, duration }: { stepsLen?: number; duration?: string | number }) {
  const parts: string[] = []
  if (duration) parts.push(`${duration} hour${Number(duration) > 1 ? 's' : ''}`)
  if (stepsLen) parts.push(`${stepsLen} chapter${stepsLen > 1 ? 's' : ''}`)
  return parts.length ? <div className="text-muted small">{parts.join(' · ')}</div> : null
}

function useDebounced<T>(value: T, delay = 250) {
  const [v, setV] = useState(value)
  useEffect(() => { const id = setTimeout(() => setV(value), delay); return () => clearTimeout(id) }, [value, delay])
  return v
}

function HomePage(): JSX.Element {
  const { list, detail, selectedId } = useAppSelector((state) => state.workshop)
  const selectedRepo = detail[selectedId]

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 250)
  const [showFilters, setShowFilters] = useState(true)
  const [selectedLevels, setSelectedLevels] = useState<number[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [completedTutorials, setCompletedTutorials] = useState<Record<string, boolean>>({})

  useEffect(() => {
    // Load completed tutorials from localStorage
    const completed = JSON.parse(localStorage.getItem('learneth_completed_tutorials') || '{}')
    setCompletedTutorials(completed)
  }, [])

  const allTags = useMemo(() => {
    if (!selectedRepo) return []
    const tagSet = new Set<string>()
    Object.values(selectedRepo.entities).forEach((entity: any) => {
      const tags: string[] = entity?.metadata?.data?.tags || []
      tags.forEach(t => {
        tagSet.add(t === 'Remix-IDE' ? 'Remix' : t)
      })
    })
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b))
  }, [selectedRepo])

  const flatItems = useMemo(() => {
    if (!selectedRepo) return []
    const rows: Array<{
      id: string; levelNum: number; levelText: string; name: string
      subtitle: string; preview: string; stepsLen?: number;
      duration?: number | string; tags: string[]; priority?: number;
    }> = [] 
    Object.keys(selectedRepo.group).forEach((levelKey) => {
      const levelNum = Number(levelKey) || 1
      const levelText = LEVEL_LABEL[levelKey as LevelKey] ?? 'Beginner'
      const items = selectedRepo.group[levelKey] || []

      items.forEach((item: any) => {
        const entity = selectedRepo.entities[item.id] || {}
        if (!entity) return
        const tags: string[] = entity.metadata?.data?.tags || []
        rows.push({
          id: item.id,
          levelNum,
          levelText,
          name: entity.name || '',
          subtitle: tags.join(', '),
          preview: mdToPlain(entity.metadata?.data?.summary || '', 280),
          stepsLen: entity.steps?.length,
          duration: entity.metadata?.data?.duration,
          tags,
          priority: entity.metadata?.data?.priority,
        })
      })
    })
    return rows
  }, [selectedRepo])

  const filtered = useMemo(() => {
    let list = flatItems
    const q = debouncedSearch.trim().toLowerCase()
    if (q) {
      list = list.filter(r => (r.name + ' ' + r.preview + ' ' + r.tags.join(' ')).toLowerCase().includes(q))
    }
    if (selectedLevels.length) {
      const set = new Set(selectedLevels)
      list = list.filter(r => set.has(r.levelNum))
    }
    if (selectedTags.length) {
      const filterTags = new Set(selectedTags)
      if (filterTags.has('Remix')) {
        filterTags.add('Remix-IDE')
      }
      list = list.filter(r => r.tags.some(t => filterTags.has(t)))
    }
    return list.sort((a, b) => {
      if (a.levelNum !== b.levelNum) {
        return a.levelNum - b.levelNum
      }

      const aP = a.priority
      const bP = b.priority
      const aHasP = aP !== undefined && aP !== null
      const bHasP = bP !== undefined && bP !== null

      if (aHasP && !bHasP) return -1
      if (!aHasP && bHasP) return 1

      if (aHasP && bHasP) {
        if (aP! !== bP!) { 
          return aP! - bP!
        }
      }

      return a.name.localeCompare(b.name)
    })
  }, [flatItems, debouncedSearch, selectedLevels, selectedTags])

  return (
    <div id="learneth" className="App mb-5 container-fluid">
      <RepoImporter list={list} selectedRepo={selectedRepo || {}} />
      <div className="container-fluid mb-3">
        <hr className="my-3"/>
        <div className="remixui_pluginSearch" data-id="learneth-search-sticky">
          <div className="d-flex w-100 mb-2">
            <div className="search-bar-container w-100">
              <i className="fas fa-search search-bar-icon" aria-hidden="true"></i>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="form-control form-control-sm remixui_pluginSearchInput ps-4"
                placeholder="Search tutorials..."
                data-id="learneth-search-input"
              />
            </div>

            <button
              onClick={() => setShowFilters(s => !s)}
              className="btn btn-sm btn-secondary ms-2 d-flex align-items-center"
              data-id="learneth-filter-button"
            >
              <svg width="8" height="8" viewBox="0 0 8 8" className="me-1">
                <path d="M0.06 0.86C0.16 0.64 0.38 0.5 0.62 0.5h6.75c.24 0 .46.14.56.36.1.22.07.48-.09.66L5 5.01V7c0 .19-.11.36-.28.45-.17.09-.37.07-.52-.05l-1-.75c-.13-.1-.2-.25-.2-.4V5.01L0.14 1.52C-.01 1.33-.04 1.07.06.86z" fill="currentColor"/>
              </svg>
              <span>Filters</span>
            </button>
          </div>

          {showFilters && (
            <FiltersPanel
              allTags={allTags}
              selectedLevels={selectedLevels} setSelectedLevels={setSelectedLevels}
              selectedTags={selectedTags} setSelectedTags={setSelectedTags}
              onClear={() => { setSelectedLevels([]); setSelectedTags([]); }}
            />
          )}
        </div>
      </div>

      {selectedRepo && (
        <div className="container-fluid">
          {filtered.length > 0 ? (
            filtered.map((r) => (
              <article key={r.id} className="card card-hover mb-3 border overflow-hidden">
                <div className="card-header d-flex justify-content-between align-items-center bg-transparent px-3 py-2">
                  <div className="d-flex align-items-center">
                    <Antenna level={r.levelNum} />
                    <span className="small fw-medium text-body-emphasis">{r.levelText}</span>
                    {completedTutorials[r.id] && (
                      <CustomTooltip
                        placement={"auto"}
                        tooltipId="tutorialCompletedTooltip"
                        tooltipClasses="text-nowrap"
                        tooltipText={<span>{'Completed'}</span>}
                      ><i className="text-success ms-2 fas fa-check"></i></CustomTooltip>
                    )}
                  </div>
                  <MetaRight stepsLen={r.stepsLen} duration={r.duration} />
                </div>
                <div className="card-body">
                  <h5 className="card-title mb-1 title-clamp-2 text-body-emphasis">{r.name}</h5>
                  {!!r.subtitle && <p className="text-body-secondary small mb-2 subtitle-clamp-1 text-body-emphasis">{r.subtitle}</p>}
                  <p className="mt-2 mb-0 text-muted body-clamp-4">{r.preview}</p>
                  <Link to={`/list?id=${r.id}`} className="stretched-link" onClick={() => trackMatomoEvent(remixClient, { 
                    category: 'learneth', 
                    action: 'start_workshop', 
                    name: r.name, 
                    isClick: true 
                  })}/>
                </div>
              </article>
            ))
          ) : (
            <div className="text-center text-muted mt-5 p-3">
              <h5 className="fw-bold">No tutorials found</h5>
              <p className="mb-0">Please try adjusting your search or filter criteria.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default HomePage