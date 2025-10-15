import React, { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Markdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import BackButton from '../../components/BackButton'
import SlideIn from '../../components/SlideIn'
import { useAppSelector } from '../../redux/hooks'
import { trackMatomoEvent } from '@remix-api'
import remixClient from '../../remix-client'
import './index.scss'

const LEVEL_LABEL: Record<'1'|'2'|'3', string> = { '1': 'Beginner', '2': 'Intermediate', '3': 'Advanced' }

const Antenna = ({ level }: { level: number }) => {
  const active = Math.min(Math.max(level, 0), 3)
  return (
    <span className="antenna d-inline-flex align-items-end">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className={`antenna-bar ${i < active ? 'bg-primary' : 'bg-secondary'}`}
          style={{ height: `${8 + i * 4}px` }}
        />
      ))}
    </span>
  )
}

export default function StepListPage(): JSX.Element {
  const location = useLocation()
  const queryParams = new URLSearchParams(location.search)
  const id = queryParams.get('id') as string
  const { detail, selectedId } = useAppSelector((s) => s.workshop)
  const repo = detail[selectedId]
  const entity = repo?.entities?.[id] || {}

  const navigate = useNavigate()

  const [isExpanded, setIsExpanded] = useState(false)

  const { levelNum, levelText } = useMemo(() => { 
    let found: string | undefined
    if (repo?.group) {
      for (const key of Object.keys(repo.group)) {
        if ((repo.group[key] || []).some((it: any) => it.id === id)) { found = key; break }
      }
    }
    const k = (found as '1'|'2'|'3') || '1'
    return { levelNum: Number(k), levelText: LEVEL_LABEL[k] }
  }, [repo, id])

  const steps = entity?.steps || []
  const stepsLen = steps.length

  const fullDescription = entity?.text || entity?.description?.content || ''
  const needsExpansionButton = fullDescription.length > 200

  const TRUNCATE_LENGTH = 150
  const needsTruncation = fullDescription.length > TRUNCATE_LENGTH

  const stepMinutes = (step: any): string => {
    const m = step?.metadata?.data?.minutes ?? step?.metadata?.data?.durationMinutes
    return typeof m === 'number' && m > 0 ? `${m} min` : ''
  }

  return (
    <div className="mb-5">
      <div className="fixed-top">
        <div className="bg-light">
          <BackButton />
        </div>
      </div>

      <div className="menuspacer" />

      <div className="container-fluid">
        <article className="card course-hero mb-3 border border-secondary">
          <div className="card-body">
            <h2 className="h4 mb-2">{entity?.name}</h2> 
            <div className={`description-wrapper ${!isExpanded && needsExpansionButton ? 'truncated' : ''}`}>
              <Markdown className={'small'} rehypePlugins={[rehypeRaw]} remarkPlugins={[remarkGfm]}>
                {fullDescription}
              </Markdown>
            </div>

            {needsTruncation && (
              <button 
                className="btn btn-link more-button p-0"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? 'less' : 'more'}
              </button>
            )}

            <button
              type="button"
              className="btn btn-primary no-wiggle-btn btn-sm w-100 d-flex align-items-center justify-content-center mt-3"
              onClick={() => {
                trackMatomoEvent(remixClient, { 
                  category: 'learneth', 
                  action: 'start_course', 
                  name: id, 
                  isClick: true 
                })
                navigate(`/detail?id=${id}&stepId=0`)
              }}
            >
              <span className="no-wiggle-label">Start the course now</span>
              <i className="fas fa-play no-wiggle-icon" aria-hidden="true"></i>
            </button>
          </div>
        </article>
 
        <section className="stats-row">
          <div className="stat">
            <Antenna level={levelNum} />  
            <div>
              <div className="stat-label">Level</div>
              <div className="stat-value">{levelText}</div>
            </div>
          </div>
          <div className="stat">
            <i className="fas fa-book stat-icon" aria-hidden="true" />
            <div>
              <div className="stat-label">Chapters</div>
              <div className="stat-value">{stepsLen || 0}</div>
            </div>
          </div> 
        </section>

        <hr className="hr-themed mb-3 mt-0" />

        <div className="d-flex align-items-baseline justify-content-between mb-2">
          <h3 className="h6 m-0">Syllabus</h3>
          <div className="small text-muted">{stepsLen} chapters</div>
        </div>

        <SlideIn>
          <div className="list-group syllabus-list">
            {steps.map((step: any, i: number) => (
              <Link
                key={i}
                to={`/detail?id=${id}&stepId=${i}`}
                className="list-group-item list-group-item-action d-flex align-items-center justify-content-between syllabus-item"
                onClick={() => trackMatomoEvent(remixClient, { 
                  category: 'learneth', 
                  action: 'step_slide_in', 
                  name: `${id}/${i}/${step.name}`, 
                  isClick: true 
                })}
              >
                <span className="text-truncate">{step.name}</span>
                <span className="d-flex align-items-center text-muted">
                  <span className="small mr-2">{stepMinutes(step)}</span>
                  <i className="fas fa-chevron-right opacity-75" aria-hidden="true"></i>
                </span>
              </Link>
            ))}
          </div>
        </SlideIn>
      </div>
    </div>
  )
}